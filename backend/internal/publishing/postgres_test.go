package publishing

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/julienschmidt/httprouter"
	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/testdb"
)

type fakeMedia struct{}

func (fakeMedia) SignedURL(context.Context, string) (string, error) {
	return "https://media.example.invalid/clips/video.mp4", nil
}
func (fakeMedia) KeyFromReference(s string) (string, error) { return s, nil }

type cancellingMedia struct {
	cancel context.CancelFunc
}

func (m cancellingMedia) SignedURL(context.Context, string) (string, error) {
	m.cancel()
	return "https://media.example.invalid/clips/video.mp4", nil
}

func (cancellingMedia) KeyFromReference(s string) (string, error) { return s, nil }
func fixture(t *testing.T) (*Handler, string, string, string) {
	t.Helper()
	db := testdb.Open(t)
	h, e := New(db, nil, fakeMedia{}, Config{ProviderConfig: ProviderConfig{AppURL: "https://sneepcut.example.invalid", InstagramAppID: "test", InstagramAppSecret: "test"}, EncryptionKey: base64.StdEncoding.EncodeToString(make([]byte, 32)), Enabled: true})
	if e != nil {
		t.Fatal(e)
	}
	user, _ := data.NewUUID()
	job, _ := data.NewUUID()
	clip, _ := data.NewUUID()
	account, _ := data.NewUUID()
	for _, query := range []struct {
		s string
		a []any
	}{{`INSERT INTO users(id,email,provider,credits,plan) VALUES($1,$2,'credentials',100,'free')`, []any{user, user + "@example.invalid"}}, {`INSERT INTO jobs(id,user_id,source_type,status,progress,num_clips_requested,aspect_ratio,subtitle_style,include_brand,credits_charged) VALUES($1,$2,'upload','completed',100,1,'9:16','default',false,0)`, []any{job, user}}, {`INSERT INTO clips(id,user_id,job_id,title,start_time,end_time,duration,file_path,file_storage_key,aspect_ratio,contains_platform_badge,viral_score,file_size,resolution,has_subtitles) VALUES($1,$2,$3,'Test clip',0,10,10,'clips/test.mp4','clips/test.mp4','9:16',false,8,1024,'1080x1920',false)`, []any{clip, user, job}}} {
		if _, e = db.Exec(query.s, query.a...); e != nil {
			t.Fatal(e)
		}
	}
	enc, _ := seal(h.vault, Credentials{AccessToken: "synthetic-token"}, user+":instagram:42")
	if _, e = db.Exec(`INSERT INTO social_accounts(id,user_id,provider,remote_id,name,credentials) VALUES($1,$2,'instagram','42','Test Instagram',$3)`, account, user, enc); e != nil {
		t.Fatal(e)
	}
	return h, user, clip, account
}

func expiredTikTokAccount(t *testing.T, h *Handler, user string) string {
	t.Helper()
	account, _ := data.NewUUID()
	expiredAt := time.Now().Add(-time.Hour).UTC().Truncate(time.Second)
	encrypted, err := seal(h.vault, Credentials{AccessToken: "expired-access", RefreshToken: "valid-refresh", ExpiresAt: expiredAt}, user+":tiktok:creator")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = h.db.Exec(`INSERT INTO social_accounts(id,user_id,provider,remote_id,name,credentials,token_expires_at) VALUES($1,$2,'tiktok','creator','TikTok fixture',$3,$4)`, account, user, encrypted, expiredAt); err != nil {
		t.Fatal(err)
	}
	return account
}

func failingTikTokCreatorClient(t *testing.T, h *Handler) (refreshCalls, creatorCalls *int) {
	t.Helper()
	refreshCount, creatorCount := 0, 0
	h.client = mockProvider(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v2/oauth/token/":
			refreshCount++
			_, _ = w.Write([]byte(`{"access_token":"renewed-access","refresh_token":"rotated-refresh","expires_in":86400}`))
		case "/v2/post/publish/creator_info/query/":
			creatorCount++
			if r.Header.Get("Authorization") != "Bearer renewed-access" {
				t.Errorf("creator validation used stale credentials")
			}
			_, _ = w.Write([]byte(`{"error":{"code":"creator_validation_failed","message":"provider-private-details"}}`))
		default:
			t.Errorf("unexpected provider request: %s", r.URL.Path)
			w.WriteHeader(http.StatusNotFound)
		}
	})
	h.client.config.TikTokVerifiedURLPrefix = "https://media.example.invalid/"
	return &refreshCount, &creatorCount
}

func assertRotatedTikTokCredentials(t *testing.T, h *Handler, user, account string) {
	t.Helper()
	var persistedEncrypted string
	var persistedExpiry time.Time
	if err := h.db.QueryRow(`SELECT credentials,token_expires_at FROM social_accounts WHERE id=$1`, account).Scan(&persistedEncrypted, &persistedExpiry); err != nil {
		t.Fatal(err)
	}
	var persisted Credentials
	if err := unseal(h.vault, persistedEncrypted, user+":tiktok:creator", &persisted); err != nil {
		t.Fatal(err)
	}
	if persisted.AccessToken != "renewed-access" || persisted.RefreshToken != "rotated-refresh" || !persistedExpiry.After(time.Now().Add(23*time.Hour)) {
		t.Fatalf("rotated TikTok credentials were not committed: %+v expiry=%s", persisted, persistedExpiry)
	}
}

func TestPostgresEnqueueOwnershipIdempotencyAndDeletion(t *testing.T) {
	h, user, clip, account := fixture(t)
	key, _ := data.NewUUID()
	in := postInput{ClipID: clip, AccountIDs: []string{account}, IdempotencyKey: key, Confirmed: true, Caption: "Original"}
	posts, e := h.enqueue(context.Background(), user, in)
	if e != nil || len(posts) != 1 {
		t.Fatalf("enqueue %v", e)
	}
	again, e := h.enqueue(context.Background(), user, in)
	if e != nil || again[0].ID != posts[0].ID {
		t.Fatal("retry duplicated")
	}
	in.Caption = "Changed"
	if _, e = h.enqueue(context.Background(), user, in); e != errInvalid {
		t.Fatalf("payload mismatch accepted: %v", e)
	}
	in.Caption = "Original"
	other, _ := data.NewUUID()
	if _, e = h.enqueue(context.Background(), other, in); e != errInvalid {
		t.Fatal("foreign account accepted")
	}
	if _, e = h.db.Exec(`INSERT INTO account_deletion_requests(user_id) VALUES($1)`, user); e != nil {
		t.Fatal(e)
	}
	if _, e = h.enqueue(context.Background(), user, in); e != errInvalid {
		t.Fatal("deletion pending accepted")
	}
}

func TestPostgresEnqueueKeepsRotatedTikTokCredentialsWhenCreatorValidationFails(t *testing.T) {
	h, user, clip, _ := fixture(t)
	account := expiredTikTokAccount(t, h, user)
	refreshCalls, creatorCalls := failingTikTokCreatorClient(t, h)
	key, _ := data.NewUUID()
	_, err := h.enqueue(context.Background(), user, postInput{
		ClipID:         clip,
		AccountIDs:     []string{account},
		Caption:        "Caption",
		IdempotencyKey: key,
		Confirmed:      true,
		TikTok:         TikTokOptions{PrivacyLevel: "SELF_ONLY", MusicUsageConfirmed: true},
	})
	if err != errInvalid || *refreshCalls != 1 || *creatorCalls != 1 {
		t.Fatalf("unexpected failed validation result: err=%v refresh=%d creator=%d", err, *refreshCalls, *creatorCalls)
	}
	assertRotatedTikTokCredentials(t, h, user, account)
	var posts int
	if err = h.db.QueryRow(`SELECT count(*) FROM social_posts WHERE account_id=$1`, account).Scan(&posts); err != nil || posts != 0 {
		t.Fatalf("failed validation created a post: count=%d err=%v", posts, err)
	}
}

func TestPostgresCalendarDispatchCreatesDurableJobAndReconciles(t *testing.T) {
	h, user, clip, account := fixture(t)
	calendarID, _ := data.NewUUID()
	_, e := h.db.Exec(`INSERT INTO scheduled_posts(id,user_id,clip_id,clip_owner_id,title,caption,platforms,account_ids,status,scheduled_at,updated_at)
		VALUES($1,$2,$3,$2,'Scheduled clip','Caption',ARRAY['instagram']::varchar[],ARRAY[$4]::uuid[],'scheduled',now()-interval '1 minute',now())`, calendarID, user, clip, account)
	if e != nil {
		t.Fatal(e)
	}
	if e = h.dispatchCalendar(context.Background()); e != nil {
		t.Fatal(e)
	}
	var calendarStatus, postStatus, scheduledPostID string
	e = h.db.QueryRow(`SELECT s.status,p.status,p.scheduled_post_id FROM scheduled_posts s JOIN social_posts p ON p.scheduled_post_id=s.id WHERE s.id=$1`, calendarID).Scan(&calendarStatus, &postStatus, &scheduledPostID)
	if e != nil || calendarStatus != "publishing" || postStatus != "queued" || scheduledPostID != calendarID {
		t.Fatalf("dispatch mismatch: calendar=%s post=%s scheduled=%s err=%v", calendarStatus, postStatus, scheduledPostID, e)
	}
	if _, e = h.db.Exec(`UPDATE social_posts SET status='published' WHERE scheduled_post_id=$1`, calendarID); e != nil {
		t.Fatal(e)
	}
	if e = h.reconcileCalendar(context.Background()); e != nil {
		t.Fatal(e)
	}
	if e = h.db.QueryRow(`SELECT status FROM scheduled_posts WHERE id=$1`, calendarID).Scan(&calendarStatus); e != nil || calendarStatus != "published" {
		t.Fatalf("reconcile mismatch: %s %v", calendarStatus, e)
	}
}
func TestPostgresWorkerDoesNotRetryUnknownMutation(t *testing.T) {
	h, user, clip, account := fixture(t)
	key, _ := data.NewUUID()
	posts, e := h.enqueue(context.Background(), user, postInput{ClipID: clip, AccountIDs: []string{account}, IdempotencyKey: key, Confirmed: true})
	if e != nil {
		t.Fatal(e)
	}
	if _, e = h.db.Exec(`UPDATE social_posts SET status='submitting',updated_at=now()-interval '6 minutes' WHERE id=$1`, posts[0].ID); e != nil {
		t.Fatal(e)
	}
	if e = h.runOne(context.Background()); e != nil {
		t.Fatal(e)
	}
	var status string
	_ = h.db.QueryRow(`SELECT status FROM social_posts WHERE id=$1`, posts[0].ID).Scan(&status)
	if status != "unknown" {
		t.Fatalf("unsafe recovery: %s", status)
	}
}

func TestPostgresWorkerKeepsRotatedTikTokCredentialsWhenPublishTransactionRollsBack(t *testing.T) {
	h, user, clip, _ := fixture(t)
	account := expiredTikTokAccount(t, h, user)
	refreshCalls := 0
	h.client = mockProvider(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v2/oauth/token/" {
			t.Errorf("unexpected request after publishing context was cancelled: %s", r.URL.Path)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		refreshCalls++
		_, _ = w.Write([]byte(`{"access_token":"renewed-access","refresh_token":"rotated-refresh","expires_in":86400}`))
	})
	h.client.config.TikTokVerifiedURLPrefix = "https://media.example.invalid/"
	postID, _ := data.NewUUID()
	idempotencyKey, _ := data.NewUUID()
	options, _ := json.Marshal(TikTokOptions{PrivacyLevel: "SELF_ONLY", MusicUsageConfirmed: true})
	if _, err := h.db.Exec(`INSERT INTO social_posts(id,user_id,account_id,clip_id,provider,caption,options,idempotency_key,request_hash,media_reference)
		VALUES($1,$2,$3,$4,'tiktok','Caption',$5,$6,'worker-rollback',$7)`, postID, user, account, clip, options, idempotencyKey, "clips/test.mp4"); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	h.media = cancellingMedia{cancel: cancel}
	err := h.runOne(ctx)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("expected the publishing transaction to be cancelled, got %v", err)
	}
	if refreshCalls != 1 {
		t.Fatalf("expected one TikTok refresh before publishing, got %d", refreshCalls)
	}
	assertRotatedTikTokCredentials(t, h, user, account)
	var status string
	if err = h.db.QueryRow(`SELECT status FROM social_posts WHERE id=$1`, postID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "submitting" {
		t.Fatalf("rolled-back publishing transaction changed durable job state to %q", status)
	}
}

func TestPostgresCallbackRejectsWrongBrowserAndConsumesDeniedState(t *testing.T) {
	h, user, _, _ := fixture(t)
	_, e := h.db.Exec(`INSERT INTO social_oauth_states(state_hash,user_id,provider,browser_hash,verifier,locale,session_version,expires_at) VALUES($1,$2,'instagram',$3,'verifier','ro',0,now()+interval '10 minutes')`, digest("state"), user, digest("browser"))
	if e != nil {
		t.Fatal(e)
	}
	router := httprouter.New()
	router.HandlerFunc("GET", "/api/publishing/callback/:provider", h.callback)
	request := func(browser string) *httptest.ResponseRecorder {
		req := httptest.NewRequest("GET", "https://app.example.invalid/api/publishing/callback/instagram?state=state&error=access_denied", nil)
		req.AddCookie(&http.Cookie{Name: "social_oauth_instagram", Value: browser})
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		return w
	}
	if !strings.Contains(request("wrong").Header().Get("Location"), "invalid_state") {
		t.Fatal("browser binding missing")
	}
	if !strings.Contains(request("browser").Header().Get("Location"), "/ro/dashboard/publish?connectionError=denied") {
		t.Fatal("denied callback")
	}
	var count int
	_ = h.db.QueryRow(`SELECT count(*) FROM social_oauth_states`).Scan(&count)
	if count != 0 {
		t.Fatal("state not consumed")
	}
	if !strings.Contains(request("browser").Header().Get("Location"), "invalid_state") {
		t.Fatal("replay accepted")
	}
}
func TestPostgresDisconnectFencesQueuedJob(t *testing.T) {
	h, user, clip, account := fixture(t)
	key, _ := data.NewUUID()
	posts, e := h.enqueue(context.Background(), user, postInput{ClipID: clip, AccountIDs: []string{account}, IdempotencyKey: key, Confirmed: true})
	if e != nil {
		t.Fatal(e)
	}
	_, e = h.db.Exec(`UPDATE social_accounts SET status='disconnected',credentials='' WHERE id=$1`, account)
	if e != nil {
		t.Fatal(e)
	}
	if e = h.runOne(context.Background()); e != nil {
		t.Fatal(e)
	}
	var status string
	_ = h.db.QueryRow(`SELECT status FROM social_posts WHERE id=$1`, posts[0].ID).Scan(&status)
	if status != "cancelled" {
		t.Fatal(status)
	}
}

// Keep the fixture's exported metadata contract explicit without leaking tokens.
func TestAccountSerializationExcludesSecrets(t *testing.T) {
	raw, _ := json.Marshal(Account{Encrypted: "secret", RemoteID: "private-id", UserID: "private-user"})
	if strings.Contains(string(raw), "secret") || strings.Contains(string(raw), "private-") {
		t.Fatal("private fields leaked")
	}
}
func TestPostgresWorkerRejectsEditedClip(t *testing.T) {
	h, user, clip, account := fixture(t)
	key, _ := data.NewUUID()
	posts, e := h.enqueue(context.Background(), user, postInput{ClipID: clip, AccountIDs: []string{account}, IdempotencyKey: key, Confirmed: true})
	if e != nil {
		t.Fatal(e)
	}
	if _, e = h.db.Exec(`UPDATE clips SET file_storage_key='clips/changed.mp4' WHERE id=$1`, clip); e != nil {
		t.Fatal(e)
	}
	if e = h.runOne(context.Background()); e != nil {
		t.Fatal(e)
	}
	var status string
	_ = h.db.QueryRow(`SELECT status FROM social_posts WHERE id=$1`, posts[0].ID).Scan(&status)
	if status != "failed" {
		t.Fatal(status)
	}
}

func TestPostgresWorkerPublishesOnceThroughDurableStages(t *testing.T) {
	h, user, clip, account := fixture(t)
	calls := 0
	h.client = mockProvider(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/v23.0/42/media":
			calls++
			_, _ = w.Write([]byte(`{"id":"777"}`))
		case "/v23.0/777":
			_, _ = w.Write([]byte(`{"status_code":"FINISHED"}`))
		case "/v23.0/42/media_publish":
			calls++
			_, _ = w.Write([]byte(`{"id":"888"}`))
		case "/v23.0/888":
			_, _ = w.Write([]byte(`{"permalink":"https://www.instagram.com/reel/example/"}`))
		default:
			t.Errorf("unexpected path %s", r.URL.Path)
			w.WriteHeader(404)
		}
	})
	key, _ := data.NewUUID()
	posts, e := h.enqueue(context.Background(), user, postInput{ClipID: clip, AccountIDs: []string{account}, IdempotencyKey: key, Confirmed: true})
	if e != nil {
		t.Fatal(e)
	}
	for i := 0; i < 3; i++ {
		if _, e = h.db.Exec(`UPDATE social_posts SET next_attempt_at=now() WHERE id=$1`, posts[0].ID); e != nil {
			t.Fatal(e)
		}
		if e = h.runOne(context.Background()); e != nil {
			t.Fatal(e)
		}
	}
	var status string
	_ = h.db.QueryRow(`SELECT status FROM social_posts WHERE id=$1`, posts[0].ID).Scan(&status)
	if status != "published" || calls != 2 {
		t.Fatalf("status %s mutation calls %d", status, calls)
	}
}
func TestPostgresConcurrentSubmissionUsesOneJob(t *testing.T) {
	h, user, clip, account := fixture(t)
	key, _ := data.NewUUID()
	in := postInput{ClipID: clip, AccountIDs: []string{account}, IdempotencyKey: key, Confirmed: true}
	results := make(chan error, 4)
	for i := 0; i < 4; i++ {
		go func() { _, e := h.enqueue(context.Background(), user, in); results <- e }()
	}
	for i := 0; i < 4; i++ {
		if e := <-results; e != nil {
			t.Fatal(e)
		}
	}
	var count int
	if e := h.db.QueryRow(`SELECT count(*) FROM social_posts WHERE user_id=$1`, user).Scan(&count); e != nil {
		t.Fatal(e)
	}
	if count != 1 {
		t.Fatalf("duplicate jobs: %d", count)
	}
}

func TestPostgresCalendarDispatchPersistsTikTokOptionsForMixedDestinations(t *testing.T) {
	h, user, clip, instagram := fixture(t)
	const cleanTikTokReference = "clips/test-tiktok-clean.mp4"
	if _, err := h.db.Exec(`UPDATE clips SET contains_platform_badge=true,tiktok_file_storage_key=$2 WHERE id=$1`, clip, cleanTikTokReference); err != nil {
		t.Fatal(err)
	}
	tiktok, _ := data.NewUUID()
	encrypted, err := seal(h.vault, Credentials{AccessToken: "synthetic-tiktok-token"}, user+":tiktok:creator")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = h.db.Exec(`INSERT INTO social_accounts(id,user_id,provider,remote_id,name,credentials) VALUES($1,$2,'tiktok','creator','TikTok fixture',$3)`, tiktok, user, encrypted); err != nil {
		t.Fatal(err)
	}
	creatorCalls := 0
	h.client = mockProvider(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v2/post/publish/creator_info/query/" {
			t.Errorf("unexpected provider request: %s", r.URL.Path)
			w.WriteHeader(http.StatusNotFound)
			return
		}
		creatorCalls++
		_, _ = w.Write([]byte(`{"data":{"privacy_level_options":["SELF_ONLY"],"comment_disabled":true,"duet_disabled":false,"stitch_disabled":true,"max_video_post_duration_sec":60,"creator_nickname":"fixture"},"error":{"code":"ok"}}`))
	})
	h.client.config.TikTokVerifiedURLPrefix = "https://media.example.invalid/"
	calendarID, _ := data.NewUUID()
	options := TikTokOptions{PrivacyLevel: "SELF_ONLY", DisableComment: true, DisableStitch: true, BrandOrganicToggle: true, MusicUsageConfirmed: true, IsAIGC: true}
	optionsJSON, _ := json.Marshal(options)
	if _, err = h.db.Exec(`INSERT INTO scheduled_posts(id,user_id,clip_id,clip_owner_id,title,caption,platforms,account_ids,status,scheduled_at,tiktok_options,updated_at)
		VALUES($1,$2,$3,$2,'Mixed scheduled clip','Caption',ARRAY['instagram','tiktok']::varchar[],ARRAY[$4,$5]::uuid[],'scheduled',now()-interval '1 minute',$6,now())`, calendarID, user, clip, instagram, tiktok, optionsJSON); err != nil {
		t.Fatal(err)
	}
	if err = h.dispatchCalendar(context.Background()); err != nil {
		t.Fatal(err)
	}
	var calendarStatus string
	var jobs int
	if err = h.db.QueryRow(`SELECT status,(SELECT count(*) FROM social_posts WHERE scheduled_post_id=$1) FROM scheduled_posts WHERE id=$1`, calendarID).Scan(&calendarStatus, &jobs); err != nil {
		t.Fatal(err)
	}
	if calendarStatus != "publishing" || jobs != 2 || creatorCalls != 1 {
		t.Fatalf("mixed TikTok dispatch mismatch: status=%s jobs=%d creatorCalls=%d", calendarStatus, jobs, creatorCalls)
	}
	var persisted []byte
	if err = h.db.QueryRow(`SELECT options FROM social_posts WHERE scheduled_post_id=$1 AND provider='tiktok'`, calendarID).Scan(&persisted); err != nil {
		t.Fatal(err)
	}
	var actual TikTokOptions
	if err = json.Unmarshal(persisted, &actual); err != nil || actual != options {
		t.Fatalf("TikTok durable job lost options: %+v %s %v", actual, persisted, err)
	}
	if err = h.db.QueryRow(`SELECT options FROM social_posts WHERE scheduled_post_id=$1 AND provider='instagram'`, calendarID).Scan(&persisted); err != nil || string(persisted) != "{}" {
		t.Fatalf("TikTok settings leaked to Instagram job: %s %v", persisted, err)
	}
	var instagramReference, tiktokReference string
	if err = h.db.QueryRow(`SELECT media_reference FROM social_posts WHERE scheduled_post_id=$1 AND provider='instagram'`, calendarID).Scan(&instagramReference); err != nil {
		t.Fatal(err)
	}
	if err = h.db.QueryRow(`SELECT media_reference FROM social_posts WHERE scheduled_post_id=$1 AND provider='tiktok'`, calendarID).Scan(&tiktokReference); err != nil {
		t.Fatal(err)
	}
	if instagramReference != "clips/test.mp4" || tiktokReference != cleanTikTokReference {
		t.Fatalf("provider media references crossed: instagram=%q tiktok=%q", instagramReference, tiktokReference)
	}
}

func TestPostgresCalendarDispatchRefreshesExpiredTikTokBeforeCreatorValidation(t *testing.T) {
	h, user, clip, _ := fixture(t)
	tiktok, _ := data.NewUUID()
	expiredAt := time.Now().Add(-time.Hour).UTC().Truncate(time.Second)
	encrypted, err := seal(h.vault, Credentials{AccessToken: "expired-access", RefreshToken: "valid-refresh", ExpiresAt: expiredAt}, user+":tiktok:creator")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = h.db.Exec(`INSERT INTO social_accounts(id,user_id,provider,remote_id,name,credentials,token_expires_at) VALUES($1,$2,'tiktok','creator','TikTok fixture',$3,$4)`, tiktok, user, encrypted, expiredAt); err != nil {
		t.Fatal(err)
	}
	refreshCalls, creatorCalls := 0, 0
	h.client = mockProvider(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v2/oauth/token/":
			refreshCalls++
			_ = r.ParseForm()
			if r.Form.Get("refresh_token") != "valid-refresh" {
				t.Errorf("unexpected refresh token")
			}
			_, _ = w.Write([]byte(`{"access_token":"renewed-access","refresh_token":"rotated-refresh","expires_in":86400}`))
		case "/v2/post/publish/creator_info/query/":
			creatorCalls++
			if r.Header.Get("Authorization") != "Bearer renewed-access" {
				t.Errorf("creator validation used stale credentials")
			}
			_, _ = w.Write([]byte(`{"data":{"privacy_level_options":["SELF_ONLY"],"max_video_post_duration_sec":60,"creator_nickname":"fixture"},"error":{"code":"ok"}}`))
		default:
			t.Errorf("unexpected provider request: %s", r.URL.Path)
			w.WriteHeader(http.StatusNotFound)
		}
	})
	h.client.config.TikTokVerifiedURLPrefix = "https://media.example.invalid/"
	calendarID, _ := data.NewUUID()
	optionsJSON, _ := json.Marshal(TikTokOptions{PrivacyLevel: "SELF_ONLY", MusicUsageConfirmed: true})
	if _, err = h.db.Exec(`INSERT INTO scheduled_posts(id,user_id,clip_id,clip_owner_id,title,caption,platforms,account_ids,status,scheduled_at,tiktok_options,updated_at)
		VALUES($1,$2,$3,$2,'Expired token schedule','Caption',ARRAY['tiktok']::varchar[],ARRAY[$4]::uuid[],'scheduled',now()-interval '1 minute',$5,now())`, calendarID, user, clip, tiktok, optionsJSON); err != nil {
		t.Fatal(err)
	}
	if err = h.dispatchCalendar(context.Background()); err != nil {
		t.Fatal(err)
	}
	var persistedEncrypted, calendarStatus string
	var persistedExpiry time.Time
	if err = h.db.QueryRow(`SELECT a.credentials,a.token_expires_at,s.status FROM social_accounts a JOIN scheduled_posts s ON s.id=$1 WHERE a.id=$2`, calendarID, tiktok).Scan(&persistedEncrypted, &persistedExpiry, &calendarStatus); err != nil {
		t.Fatal(err)
	}
	var persisted Credentials
	if err = unseal(h.vault, persistedEncrypted, user+":tiktok:creator", &persisted); err != nil {
		t.Fatal(err)
	}
	expiryDelta := persisted.ExpiresAt.Sub(persistedExpiry)
	if expiryDelta < 0 {
		expiryDelta = -expiryDelta
	}
	if refreshCalls != 1 || creatorCalls != 1 || calendarStatus != "publishing" || persisted.AccessToken != "renewed-access" || persisted.RefreshToken != "rotated-refresh" || !persistedExpiry.After(time.Now().Add(23*time.Hour)) || expiryDelta > time.Millisecond {
		t.Fatalf("TikTok refresh was not persisted before dispatch: refresh=%d creator=%d status=%s credentials=%+v expiry=%s", refreshCalls, creatorCalls, calendarStatus, persisted, persistedExpiry)
	}
}

func TestPostgresCalendarDispatchKeepsRotatedTikTokCredentialsWhenCreatorValidationFails(t *testing.T) {
	h, user, clip, _ := fixture(t)
	account := expiredTikTokAccount(t, h, user)
	refreshCalls, creatorCalls := failingTikTokCreatorClient(t, h)
	calendarID, _ := data.NewUUID()
	optionsJSON, _ := json.Marshal(TikTokOptions{PrivacyLevel: "SELF_ONLY", MusicUsageConfirmed: true})
	if _, err := h.db.Exec(`INSERT INTO scheduled_posts(id,user_id,clip_id,clip_owner_id,title,caption,platforms,account_ids,status,scheduled_at,tiktok_options,updated_at)
		VALUES($1,$2,$3,$2,'Creator validation failure','Caption',ARRAY['tiktok']::varchar[],ARRAY[$4]::uuid[],'scheduled',now()-interval '1 minute',$5,now())`, calendarID, user, clip, account, optionsJSON); err != nil {
		t.Fatal(err)
	}
	if err := h.dispatchCalendar(context.Background()); err != nil {
		t.Fatal(err)
	}
	assertRotatedTikTokCredentials(t, h, user, account)
	var status, message string
	var posts int
	if err := h.db.QueryRow(`SELECT status,publishing_error,(SELECT count(*) FROM social_posts WHERE scheduled_post_id=$1) FROM scheduled_posts WHERE id=$1`, calendarID).Scan(&status, &message, &posts); err != nil {
		t.Fatal(err)
	}
	if *refreshCalls != 1 || *creatorCalls != 1 || status != "failed" || posts != 0 || !strings.Contains(message, "could not be confirmed") {
		t.Fatalf("calendar validation failure mismatch: refresh=%d creator=%d status=%s posts=%d message=%q", *refreshCalls, *creatorCalls, status, posts, message)
	}
}

func TestPostgresCalendarDispatchRejectsMultipleTikTokAccountsAtomically(t *testing.T) {
	h, user, clip, _ := fixture(t)
	creatorCalls := 0
	h.client = mockProvider(t, func(w http.ResponseWriter, r *http.Request) {
		creatorCalls++
		w.WriteHeader(http.StatusInternalServerError)
	})
	h.client.config.TikTokVerifiedURLPrefix = "https://media.example.invalid/"
	accounts := make([]string, 0, 2)
	for index := 0; index < 2; index++ {
		account, _ := data.NewUUID()
		remote := fmt.Sprintf("creator-%d", index)
		encrypted, err := seal(h.vault, Credentials{AccessToken: "synthetic-tiktok-token"}, user+":tiktok:"+remote)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = h.db.Exec(`INSERT INTO social_accounts(id,user_id,provider,remote_id,name,credentials) VALUES($1,$2,'tiktok',$3,'TikTok fixture',$4)`, account, user, remote, encrypted); err != nil {
			t.Fatal(err)
		}
		accounts = append(accounts, account)
	}
	calendarID, _ := data.NewUUID()
	optionsJSON, _ := json.Marshal(TikTokOptions{PrivacyLevel: "SELF_ONLY", MusicUsageConfirmed: true})
	if _, err := h.db.Exec(`INSERT INTO scheduled_posts(id,user_id,clip_id,clip_owner_id,title,caption,platforms,account_ids,status,scheduled_at,tiktok_options,updated_at)
		VALUES($1,$2,$3,$2,'Invalid TikTok schedule','Caption',ARRAY['tiktok']::varchar[],ARRAY[$4,$5]::uuid[],'scheduled',now()-interval '1 minute',$6,now())`, calendarID, user, clip, accounts[0], accounts[1], optionsJSON); err != nil {
		t.Fatal(err)
	}
	if err := h.dispatchCalendar(context.Background()); err != nil {
		t.Fatal(err)
	}
	var status, message string
	var jobs int
	if err := h.db.QueryRow(`SELECT status,publishing_error,(SELECT count(*) FROM social_posts WHERE scheduled_post_id=$1) FROM scheduled_posts WHERE id=$1`, calendarID).Scan(&status, &message, &jobs); err != nil {
		t.Fatal(err)
	}
	if status != "failed" || jobs != 0 || creatorCalls != 0 || !strings.Contains(message, "one TikTok account") {
		t.Fatalf("multiple TikTok destinations were not rejected atomically: status=%s jobs=%d calls=%d message=%q", status, jobs, creatorCalls, message)
	}
}

// Uploaded media is inspected through trusted service methods, never client duration metadata.
type uploadedTikTokMedia struct{ duration float64 }

func (m uploadedTikTokMedia) SignedURL(_ context.Context, key string) (string, error) {
	return "https://media.example/" + key, nil
}
func (m uploadedTikTokMedia) KeyFromReference(key string) (string, error) { return key, nil }
func (m uploadedTikTokMedia) TikTokPublishingKey(_ context.Context, key string) (string, error) {
	return strings.TrimSuffix(key, ".png") + ".jpg", nil
}
func (m uploadedTikTokMedia) PublishingVideoDuration(context.Context, string) (float64, error) {
	return m.duration, nil
}
func (m uploadedTikTokMedia) ValidatePublishingMedia(context.Context, string, string, string) error {
	return nil
}

type temporarilyUninspectableTikTokMedia struct{ uploadedTikTokMedia }

func (temporarilyUninspectableTikTokMedia) PublishingVideoDuration(context.Context, string) (float64, error) {
	return 0, errors.New("temporary ffprobe failure")
}

func TestTikTokClipValidationFallsBackToStoredDuration(t *testing.T) {
	h, user, clip, _ := fixture(t)
	h.media = temporarilyUninspectableTikTokMedia{}
	if _, err := h.db.Exec(`UPDATE clips SET tiktok_file_storage_key='clips/test-tiktok-clean.mp4' WHERE id=$1`, clip); err != nil {
		t.Fatal(err)
	}
	account, _ := data.NewUUID()
	encrypted, err := seal(h.vault, Credentials{AccessToken: "synthetic"}, user+":tiktok:creator")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = h.db.Exec(`INSERT INTO social_accounts(id,user_id,provider,remote_id,name,credentials) VALUES($1,$2,'tiktok','creator','Fixture',$3)`, account, user, encrypted); err != nil {
		t.Fatal(err)
	}
	h.client = mockProvider(t, func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"data":{"privacy_level_options":["SELF_ONLY"],"max_video_post_duration_sec":60},"error":{"code":"ok"}}`)
	})
	tx, err := h.db.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	field, err := h.ValidateTikTokSchedule(context.Background(), tx, user, account, clip, "", TikTokOptions{PrivacyLevel: "SELF_ONLY", MusicUsageConfirmed: true})
	if err != nil {
		t.Fatalf("stored clip duration was not used after temporary inspection failure: field=%s err=%v", field, err)
	}
}

func TestPostgresTikTokUploadedMediaDispatchAndWorker(t *testing.T) {
	for _, kind := range []string{"image", "video"} {
		t.Run(kind, func(t *testing.T) {
			h, user, _, _ := fixture(t)
			h.media = uploadedTikTokMedia{duration: 10}
			account, _ := data.NewUUID()
			encrypted, err := seal(h.vault, Credentials{AccessToken: "synthetic"}, user+":tiktok:creator")
			if err != nil {
				t.Fatal(err)
			}
			if _, err = h.db.Exec(`INSERT INTO social_accounts(id,user_id,provider,remote_id,name,credentials) VALUES($1,$2,'tiktok','creator','Fixture',$3)`, account, user, encrypted); err != nil {
				t.Fatal(err)
			}
			calls := 0
			h.client = mockProvider(t, func(w http.ResponseWriter, r *http.Request) {
				switch r.URL.Path {
				case "/v2/post/publish/creator_info/query/":
					fmt.Fprint(w, `{"data":{"privacy_level_options":["SELF_ONLY"],"max_video_post_duration_sec":60},"error":{"code":"ok"}}`)
				case "/v2/post/publish/content/init/", "/v2/post/publish/video/init/":
					calls++
					var body map[string]any
					if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
						t.Fatal(err)
					}
					source := body["source_info"].(map[string]any)
					if kind == "image" {
						photos := source["photo_images"].([]any)
						if len(photos) != 2 || !strings.HasSuffix(photos[0].(string), "first.jpg") {
							t.Errorf("photo preparation/order lost: %v", source)
						}
					} else if !strings.HasSuffix(source["video_url"].(string), "first.webm") {
						t.Errorf("uploaded video lost: %v", source)
					}
					fmt.Fprint(w, `{"data":{"publish_id":"accepted"},"error":{"code":"ok"}}`)
				default:
					t.Errorf("unexpected endpoint %s", r.URL.Path)
					w.WriteHeader(404)
				}
			})
			calendarID, _ := data.NewUUID()
			reference := "publishing/" + user + "/first.webm"
			if kind == "image" {
				reference = "publishing/" + user + "/first.png"
			}
			media := []map[string]string{{"type": kind, "reference": reference, "name": "first"}}
			if kind == "image" {
				media = append(media, map[string]string{"type": "image", "reference": "publishing/" + user + "/second.png", "name": "second"})
			}
			raw, _ := json.Marshal(media)
			options, _ := json.Marshal(TikTokOptions{PrivacyLevel: "SELF_ONLY", MusicUsageConfirmed: true, AutoAddMusic: true})
			if _, err = h.db.Exec(`INSERT INTO scheduled_posts(id,user_id,title,caption,platforms,account_ids,status,scheduled_at,media,tiktok_options,updated_at) VALUES($1,$2,'Upload','',ARRAY['tiktok']::varchar[],ARRAY[$3]::uuid[],'scheduled',now()-interval '1 minute',$4,$5,now())`, calendarID, user, account, raw, options); err != nil {
				t.Fatal(err)
			}
			if err = h.dispatchCalendar(context.Background()); err != nil {
				t.Fatal(err)
			}
			if err = h.dispatchCalendar(context.Background()); err != nil {
				t.Fatal(err)
			}
			var count int
			if err = h.db.QueryRow("SELECT count(*) FROM social_posts WHERE scheduled_post_id=$1", calendarID).Scan(&count); err != nil || count != 1 {
				t.Fatalf("duplicate or missing durable jobs %d %v", count, err)
			}
			if err = h.runOne(context.Background()); err != nil {
				t.Fatal(err)
			}
			var status, remote string
			if err = h.db.QueryRow("SELECT status,remote_id FROM social_posts WHERE scheduled_post_id=$1", calendarID).Scan(&status, &remote); err != nil || status != "processing" || remote != "accepted" || calls != 1 {
				t.Fatalf("worker failed: status=%s remote=%s calls=%d err=%v", status, remote, calls, err)
			}
		})
	}
}
