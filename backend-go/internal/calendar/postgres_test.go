package calendar

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"

	"github.com/lib/pq"
	"sneepcut/backend-go/internal/publishing"
	"sneepcut/backend-go/internal/testdb"
)

type calendarMedia struct{}

type recordingTikTokValidator struct {
	prepareCalls int
	calls        int
	media        []publishing.PublishMedia
	accountID    string
	clipID       string
	caption      string
	options      publishing.TikTokOptions
	field        string
	err          error
}

func (v *recordingTikTokValidator) PrepareTikTokSchedule(_ context.Context, _ string, _ []string) (string, error) {
	v.prepareCalls++
	return v.field, v.err
}

func (v *recordingTikTokValidator) ValidateTikTokSchedule(_ context.Context, _ *sql.Tx, _ string, accountID, clipID, caption string, options publishing.TikTokOptions) (string, error) {
	v.calls++
	v.accountID = accountID
	v.clipID = clipID
	v.caption = caption
	v.options = options
	return v.field, v.err
}

func (v *recordingTikTokValidator) ValidateTikTokMediaSchedule(_ context.Context, _ *sql.Tx, _ string, accountID string, media []publishing.PublishMedia, caption string, options publishing.TikTokOptions) (string, error) {
	v.calls++
	v.accountID = accountID
	v.media = media
	v.caption = caption
	v.options = options
	return v.field, v.err
}

func (calendarMedia) KeyFromReference(value string) (string, error) {
	if strings.HasPrefix(value, "clips/") || strings.HasPrefix(value, "publishing/") {
		return value, nil
	}
	return "", errors.New("not stored media")
}

func TestPostgresCarouselOrderPersistsAndFacebookRejectsVideoSets(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	user, _, _ := seedCalendarClip(t, db)
	repo := NewRepository(db, calendarMedia{})
	instagram, facebook := fixtureID(t), fixtureID(t)
	for _, account := range []struct{ id, provider string }{{instagram, "instagram"}, {facebook, "facebook"}} {
		if _, err := db.Exec(`INSERT INTO social_accounts(id,user_id,provider,remote_id,name,credentials) VALUES($1,$2,$3,$4,'Carousel fixture','sealed')`, account.id, user, account.provider, account.id); err != nil {
			t.Fatal(err)
		}
	}
	media := []any{
		map[string]any{"type": "video", "reference": "publishing/" + user + "/first.mp4", "name": "first.mp4"},
		map[string]any{"type": "image", "reference": "publishing/" + user + "/second.jpg", "name": "second.jpg"},
		map[string]any{"type": "video", "reference": "publishing/" + user + "/third.mp4", "name": "third.mp4"},
	}
	input := validInput()
	input["clipId"], input["media"] = nil, media
	input["platforms"], input["accountIds"] = []any{"instagram"}, []any{instagram}
	post, err := repo.Mutate(ctx, user, "", input, true)
	if err != nil {
		t.Fatal(err)
	}
	if len(post.Media) != 3 || post.Media[0]["name"] != "first.mp4" {
		t.Fatalf("created order: %v", post.Media)
	}
	post, err = repo.Mutate(ctx, user, post.ID, map[string]any{"media": []any{media[1], media[2], media[0]}}, false)
	if err != nil {
		t.Fatal(err)
	}
	loaded, err := repo.Get(ctx, user, post.ID)
	if err != nil || loaded.Media[0]["name"] != "second.jpg" || loaded.Media[2]["name"] != "first.mp4" {
		t.Fatalf("reordered cover did not persist: %v %v", loaded.Media, err)
	}
	// A partial update must inspect stored media, not just the PATCH payload.
	_, err = repo.Mutate(ctx, user, post.ID, map[string]any{"platforms": []any{"facebook"}, "accountIds": []any{facebook}}, false)
	var validation *ValidationError
	if !errors.As(err, &validation) || len(validation.Issues) != 1 || validation.Issues[0].Field != "media" {
		t.Fatalf("Facebook accepted mixed carousel: %v", err)
	}
	input["platforms"], input["accountIds"] = []any{"facebook"}, []any{facebook}
	input["media"] = []any{media[0], media[2]}
	if _, err := repo.Mutate(ctx, user, "", input, true); !errors.As(err, &validation) {
		t.Fatalf("Facebook accepted multiple videos: %v", err)
	}
	input["media"] = []any{media[1]}
	if _, err := repo.Mutate(ctx, user, "", input, true); err != nil {
		t.Fatalf("Facebook single image rejected: %v", err)
	}
}
func (calendarMedia) SignedURL(ctx context.Context, key string) (string, error) {
	return "https://media.example.invalid/" + key + "?fresh=true", nil
}
func fixtureID(t *testing.T) string {
	t.Helper()
	var b [16]byte
	if _, e := rand.Read(b[:]); e != nil {
		t.Fatal(e)
	}
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[:4], b[4:6], b[6:8], b[8:10], b[10:])
}
func seedCalendarClip(t *testing.T, db *sql.DB) (string, string, string) {
	t.Helper()
	user, job, clip := fixtureID(t), fixtureID(t), fixtureID(t)
	queries := []struct {
		query string
		args  []any
	}{
		{`INSERT INTO users(id,email,provider,credits,plan) VALUES($1,$2,'credentials',100,'free')`, []any{user, user + "@example.invalid"}},
		{`INSERT INTO jobs(id,user_id,source_type,status,progress,num_clips_requested,aspect_ratio,subtitle_style,include_brand,credits_charged) VALUES($1,$2,'upload','completed',100,5,'9:16','default',false,50)`, []any{job, user}},
		{`INSERT INTO clips(id,user_id,job_id,title,start_time,end_time,duration,file_path,file_storage_key,thumbnail_storage_key,caption_tiktok,viral_score,file_size,aspect_ratio,resolution,has_subtitles,contains_platform_badge) VALUES($1,$2,$3,'Fixture',0,10,10,$4,$4,$5,'Clip caption',8,1024,'9:16','1080x1920',false,false)`, []any{clip, user, job, "clips/" + job + "/video.mp4", "clips/" + job + "/thumbnail.jpg"}},
	}
	for _, q := range queries {
		if _, e := db.Exec(q.query, q.args...); e != nil {
			t.Fatal(e)
		}
	}
	return user, job, clip
}
func TestPostgresCalendarOwnershipAttachmentAndHalfOpenRange(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	user, _, clip := seedCalendarClip(t, db)
	other, _, foreignClip := seedCalendarClip(t, db)
	repo := NewRepository(db, calendarMedia{})
	input := validInput()
	input["clipId"] = clip
	account := fixtureID(t)
	if _, e := db.Exec(`INSERT INTO social_accounts(id,user_id,provider,remote_id,name,credentials,scopes) VALUES($1,$2,'instagram',$3,'Fixture','sealed',ARRAY['instagram_business_content_publish'])`, account, user, account); e != nil {
		t.Fatal(e)
	}
	input["accountIds"] = []any{account}
	input["platforms"] = []any{"instagram"}
	post, e := repo.Mutate(ctx, user, "", input, true)
	if e != nil {
		t.Fatal(e)
	}
	if post.Title != "Product launch teaser" || post.Notes != nil || post.ScheduledAt != "2026-09-04T07:30:00.000Z" || post.Clip == nil || post.Clip.ID != clip || post.Clip.Duration != 10 || !post.Clip.TikTokEligible || post.Clip.ThumbnailURL == nil || !strings.Contains(*post.Clip.ThumbnailURL, "fresh=true") {
		t.Fatalf("contract mismatch: %+v", post)
	}
	encoded, _ := json.Marshal(post)
	var fields map[string]any
	_ = json.Unmarshal(encoded, &fields)
	for _, private := range []string{"userId", "user_id", "clipId", "clip_id", "clipOwnerId"} {
		if _, ok := fields[private]; ok {
			t.Fatalf("private field %s leaked", private)
		}
	}
	if _, e = repo.Get(ctx, other, post.ID); !errors.Is(e, sql.ErrNoRows) {
		t.Fatalf("cross-account read: %v", e)
	}
	if _, e = repo.Mutate(ctx, other, post.ID, map[string]any{"title": "stolen"}, false); !errors.Is(e, sql.ErrNoRows) {
		t.Fatalf("cross-account mutation: %v", e)
	}
	if e = repo.Delete(ctx, other, post.ID); !errors.Is(e, sql.ErrNoRows) {
		t.Fatalf("cross-account deletion: %v", e)
	}
	input["clipId"] = foreignClip
	if _, e = repo.Mutate(ctx, user, "", input, true); !errors.Is(e, ErrClip) {
		t.Fatalf("foreign clip attached: %v", e)
	}
	if _, e = repo.Mutate(ctx, user, post.ID, map[string]any{"clipId": foreignClip}, false); !errors.Is(e, ErrClip) {
		t.Fatalf("foreign clip replacement: %v", e)
	}
	_, e = db.Exec(`UPDATE scheduled_posts SET clip_id=$1,clip_owner_id=$2 WHERE id=$3`, foreignClip, user, post.ID)
	var pg *pq.Error
	if !errors.As(e, &pg) || pg.Code != "23503" {
		t.Fatalf("owned clip foreign key missing: %v", e)
	}
	start, end, _ := ParseRange("2026-09-04T07:30:00Z", "2026-09-05T07:30:00Z")
	listed, e := repo.List(ctx, user, start, end)
	if e != nil || len(listed.Posts) != 1 || len(listed.Clips) != 1 || listed.Clips[0].Duration != 10 || !listed.Clips[0].TikTokEligible || listed.Meta.Truncated || listed.Meta.Limit != 500 {
		t.Fatalf("list: %+v %v", listed, e)
	}
	start, end, _ = ParseRange("2026-09-03T07:30:00Z", "2026-09-04T07:30:00Z")
	listed, e = repo.List(ctx, user, start, end)
	if e != nil || len(listed.Posts) != 0 {
		t.Fatalf("end boundary included: %+v %v", listed, e)
	}
	updated, e := repo.Mutate(ctx, user, post.ID, map[string]any{"clipId": nil, "caption": "", "status": "draft"}, false)
	if e != nil || updated.Clip != nil || updated.Caption != nil || updated.Title != post.Title {
		t.Fatalf("partial update: %+v %v", updated, e)
	}
	updated, e = repo.Mutate(ctx, user, post.ID, map[string]any{"clipId": clip}, false)
	if e != nil || updated.Clip == nil {
		t.Fatal(updated, e)
	}
	if _, e = db.Exec(`DELETE FROM clips WHERE id=$1`, clip); e != nil {
		t.Fatal(e)
	}
	updated, e = repo.Get(ctx, user, post.ID)
	if e != nil || updated.Clip != nil || updated.Title != post.Title {
		t.Fatalf("clip deletion lost editorial post: %+v %v", updated, e)
	}
	if e = repo.Delete(ctx, user, post.ID); e != nil {
		t.Fatal(e)
	}
	if _, e = repo.Get(ctx, user, post.ID); !errors.Is(e, sql.ErrNoRows) {
		t.Fatal(e)
	}
}
func TestPostgresCalendarBoundedListsAndInactiveWriters(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	user, job, _ := seedCalendarClip(t, db)
	repo := NewRepository(db, calendarMedia{})
	if _, e := db.Exec(`INSERT INTO scheduled_posts(id,user_id,title,platforms,status,scheduled_at,updated_at) SELECT gen_random_uuid(),$1,'Post '||i,ARRAY['youtube']::varchar[],'draft','2026-09-04 00:00:00+00'::timestamptz + i*interval '1 minute',now() FROM generate_series(1,501) i`, user); e != nil {
		t.Fatal(e)
	}
	if _, e := db.Exec(`INSERT INTO clips(id,user_id,job_id,title,start_time,end_time,duration,viral_score,file_path,file_size,aspect_ratio,resolution,has_subtitles) SELECT gen_random_uuid(),$1,$2,'Clip '||i,0,10,10,8,'clips/fixture/video.mp4',1024,'9:16','1080x1920',false FROM generate_series(1,101) i`, user, job); e != nil {
		t.Fatal(e)
	}
	start, end, _ := ParseRange("2026-09-04T00:00:00Z", "2026-09-05T00:00:00Z")
	listed, e := repo.List(ctx, user, start, end)
	if e != nil || len(listed.Posts) != 500 || len(listed.Clips) != 100 || !listed.Meta.Truncated {
		t.Fatalf("unbounded list: posts=%d clips=%d meta=%+v err=%v", len(listed.Posts), len(listed.Clips), listed.Meta, e)
	}
	for i := 1; i < len(listed.Posts); i++ {
		if listed.Posts[i].ScheduledAt < listed.Posts[i-1].ScheduledAt {
			t.Fatal("unstable ordering")
		}
	}
	for _, update := range []string{`UPDATE users SET access_role='viewer' WHERE id=$1`, `UPDATE users SET access_role='member',email_activation_required=true WHERE id=$1`} {
		if _, e = db.Exec(update, user); e != nil {
			t.Fatal(e)
		}
		if e = repo.Delete(ctx, user, listed.Posts[0].ID); !errors.Is(e, ErrInactive) {
			t.Fatalf("inactive delete: %v", e)
		}
		if _, e = repo.Mutate(ctx, user, listed.Posts[0].ID, map[string]any{"title": "changed"}, false); !errors.Is(e, ErrInactive) {
			t.Fatalf("inactive edit: %v", e)
		}
	}
	if _, e = db.Exec(`UPDATE users SET email_activation_required=false WHERE id=$1`, user); e != nil {
		t.Fatal(e)
	}
	if _, e = db.Exec(`INSERT INTO account_deletion_requests(user_id) VALUES($1)`, user); e != nil {
		t.Fatal(e)
	}
	input := validInput()
	delete(input, "clipId")
	if _, e = repo.Mutate(ctx, user, "", input, true); !errors.Is(e, ErrInactive) {
		t.Fatalf("deleting create: %v", e)
	}
}

func TestPostgresCalendarPersistsAndValidatesTikTokSettings(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	user, _, clip := seedCalendarClip(t, db)
	account := fixtureID(t)
	if _, err := db.Exec(`INSERT INTO social_accounts(id,user_id,provider,remote_id,name,credentials) VALUES($1,$2,'tiktok',$3,'TikTok fixture','sealed')`, account, user, account); err != nil {
		t.Fatal(err)
	}
	validator := &recordingTikTokValidator{}
	repo := NewRepository(db, calendarMedia{}, validator)
	input := validInput()
	input["clipId"] = clip
	input["platforms"] = []any{"tiktok"}
	input["accountIds"] = []any{account}
	input["caption"] = "TikTok caption"
	input["tiktok"] = map[string]any{
		"privacyLevel":        "SELF_ONLY",
		"disableComment":      true,
		"disableDuet":         false,
		"disableStitch":       true,
		"brandContentToggle":  false,
		"brandOrganicToggle":  true,
		"musicUsageConfirmed": true,
		"isAigc":              true,
	}
	post, err := repo.Mutate(ctx, user, "", input, true)
	if err != nil {
		t.Fatal(err)
	}
	if validator.prepareCalls != 1 || validator.calls != 1 || validator.accountID != account || validator.clipID != clip || validator.caption != "TikTok caption" || !validator.options.IsAIGC {
		t.Fatalf("validator did not receive the effective TikTok post: %+v", validator)
	}
	if post.TikTok == nil || post.TikTok.PrivacyLevel != "SELF_ONLY" || !post.TikTok.BrandOrganicToggle || !post.TikTok.IsAIGC {
		t.Fatalf("TikTok response contract mismatch: %+v", post.TikTok)
	}
	var raw []byte
	if err = db.QueryRow(`SELECT tiktok_options FROM scheduled_posts WHERE id=$1`, post.ID).Scan(&raw); err != nil || !strings.Contains(string(raw), `"privacyLevel": "SELF_ONLY"`) || !strings.Contains(string(raw), `"isAigc": true`) {
		t.Fatalf("TikTok settings were not persisted: %s %v", raw, err)
	}

	updated, err := repo.Mutate(ctx, user, post.ID, map[string]any{
		"status": "publish",
		"tiktok": map[string]any{
			"privacyLevel":        "PUBLIC_TO_EVERYONE",
			"musicUsageConfirmed": true,
		},
	}, false)
	if err != nil || updated.Status != "scheduled" || updated.TikTok == nil || updated.TikTok.PrivacyLevel != "PUBLIC_TO_EVERYONE" || validator.prepareCalls != 2 || validator.calls != 2 {
		t.Fatalf("publish-now TikTok update mismatch: %+v prepareCalls=%d calls=%d err=%v", updated.TikTok, validator.prepareCalls, validator.calls, err)
	}
}

func TestPostgresCalendarRejectsUnsafeTikTokSelectionsBeforeValidation(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	user, _, clip := seedCalendarClip(t, db)
	first, second := fixtureID(t), fixtureID(t)
	for _, account := range []string{first, second} {
		if _, err := db.Exec(`INSERT INTO social_accounts(id,user_id,provider,remote_id,name,credentials) VALUES($1,$2,'tiktok',$3,'TikTok fixture','sealed')`, account, user, account); err != nil {
			t.Fatal(err)
		}
	}
	validator := &recordingTikTokValidator{}
	repo := NewRepository(db, calendarMedia{}, validator)
	base := validInput()
	base["clipId"] = clip
	base["platforms"] = []any{"tiktok"}
	base["accountIds"] = []any{first}
	base["caption"] = "TikTok caption"
	base["tiktok"] = map[string]any{"privacyLevel": "SELF_ONLY", "musicUsageConfirmed": true}

	direct := make(map[string]any, len(base)+1)
	for key, value := range base {
		direct[key] = value
	}
	direct["clipId"] = nil
	direct["media"] = []any{map[string]any{"type": "video", "reference": "publishing/" + user + "/direct.mp4", "name": "direct.mp4"}}
	direct["caption"] = ""
	_, err := repo.Mutate(ctx, user, "", direct, true)
	if err != nil || validator.calls != 1 || len(validator.media) != 1 || validator.media[0].Type != "video" || validator.caption != "" {
		t.Fatalf("uploaded video with optional caption rejected: %+v %v", validator, err)
	}
	validator.calls = 0
	photos := make([]any, 35)
	for i := range photos {
		photos[i] = map[string]any{"type": "image", "reference": fmt.Sprintf("publishing/%s/photo-%d.png", user, i), "name": "photo.png"}
	}
	direct["media"] = photos
	direct["caption"] = strings.Repeat("a", 4000)
	direct["tiktok"] = map[string]any{"privacyLevel": "SELF_ONLY", "musicUsageConfirmed": true, "autoAddMusic": true, "photoTitle": "Photo title"}
	post, err := repo.Mutate(ctx, user, "", direct, true)
	if err != nil || len(validator.media) != 35 || !validator.options.AutoAddMusic || post.TikTok.PhotoTitle != "Photo title" {
		t.Fatalf("photo post rejected or options lost: %+v %v", post, err)
	}
	validator.calls = 0
	var validation *ValidationError

	base["accountIds"] = []any{first, second}
	_, err = repo.Mutate(ctx, user, "", base, true)
	if !errors.As(err, &validation) {
		t.Fatalf("multiple TikTok accounts were accepted: %v", err)
	}
	found := false
	for _, issue := range validation.Issues {
		found = found || issue.Field == "accountIds"
	}
	if !found || validator.calls != 0 {
		t.Fatalf("multiple TikTok accounts did not fail atomically: %+v calls=%d", validation.Issues, validator.calls)
	}
}
