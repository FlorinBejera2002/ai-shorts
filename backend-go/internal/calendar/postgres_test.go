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
	"sneepcut/backend-go/internal/testdb"
)

type calendarMedia struct{}

func (calendarMedia) KeyFromReference(value string) (string, error) {
	if strings.HasPrefix(value, "clips/") {
		return value, nil
	}
	return "", errors.New("not stored media")
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
		{`INSERT INTO clips(id,user_id,job_id,title,start_time,end_time,duration,file_path,file_storage_key,thumbnail_storage_key,caption_tiktok,viral_score,file_size,aspect_ratio,resolution,has_subtitles) VALUES($1,$2,$3,'Fixture',0,10,10,$4,$4,$5,'Clip caption',8,1024,'9:16','1080x1920',false)`, []any{clip, user, job, "clips/" + job + "/video.mp4", "clips/" + job + "/thumbnail.jpg"}},
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
	post, e := repo.Mutate(ctx, user, "", input, true)
	if e != nil {
		t.Fatal(e)
	}
	if post.Title != "Product launch teaser" || post.Notes != nil || post.ScheduledAt != "2026-09-04T07:30:00.000Z" || post.Clip == nil || post.Clip.ID != clip || post.Clip.ThumbnailURL == nil || !strings.Contains(*post.Clip.ThumbnailURL, "fresh=true") {
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
	if e != nil || len(listed.Posts) != 1 || len(listed.Clips) != 1 || listed.Meta.Truncated || listed.Meta.Limit != 500 {
		t.Fatalf("list: %+v %v", listed, e)
	}
	start, end, _ = ParseRange("2026-09-03T07:30:00Z", "2026-09-04T07:30:00Z")
	listed, e = repo.List(ctx, user, start, end)
	if e != nil || len(listed.Posts) != 0 {
		t.Fatalf("end boundary included: %+v %v", listed, e)
	}
	updated, e := repo.Mutate(ctx, user, post.ID, map[string]any{"clipId": nil, "caption": "", "status": "published"}, false)
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
