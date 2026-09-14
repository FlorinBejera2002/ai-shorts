package publishing

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/julienschmidt/httprouter"
	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/testdb"
)

type fakeMedia struct{}

func (fakeMedia) SignedURL(context.Context, string) (string, error) {
	return "https://media.example.invalid/clips/video.mp4", nil
}
func (fakeMedia) KeyFromReference(s string) (string, error) { return s, nil }
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
