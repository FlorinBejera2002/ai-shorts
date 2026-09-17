package account

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"sneepcut/backend-go/internal/media"
	"sneepcut/backend-go/internal/testdb"
)

func fixtureID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = (b[6] & 15) | 64
	b[8] = (b[8] & 63) | 128
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[:4], b[4:6], b[6:8], b[8:10], b[10:])
}
func seedAccount(t *testing.T, db *sql.DB) string {
	t.Helper()
	id := fixtureID()
	if _, err := db.Exec(`INSERT INTO users(id,email,provider,password_hash,credits,plan) VALUES($1,$2,'credentials',$3,100,'free')`, id, id+"@example.invalid", testHash); err != nil {
		t.Fatal(err)
	}
	return id
}
func seedWork(t *testing.T, db *sql.DB, user, status string, active bool) (string, string) {
	t.Helper()
	job, clip := fixtureID(), fixtureID()
	if _, err := db.Exec(`INSERT INTO jobs(id,user_id,source_type,status,progress,num_clips_requested,aspect_ratio,subtitle_style,include_brand,credits_charged,processing_active) VALUES($1,$2,'upload',$3,0,5,'9:16','default',false,50,$4)`, job, user, status, active); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO clips(id,user_id,job_id,title,start_time,end_time,duration,file_path,file_storage_key,resolution,viral_score,file_size,aspect_ratio,has_subtitles) VALUES($1,$2,$3,'Fixture',0,10,10,$4,$4,'1080x1920',8,1024,'9:16',false)`, clip, user, job, "clips/"+job+"/clip.mp4"); err != nil {
		t.Fatal(err)
	}
	return job, clip
}

type fakeBilling struct {
	db    *sql.DB
	err   error
	mu    sync.Mutex
	calls int
}

func (b *fakeBilling) CancelForDeletion(ctx context.Context, user string) error {
	b.mu.Lock()
	b.calls++
	b.mu.Unlock()
	if b.err != nil {
		return b.err
	}
	_, err := b.db.ExecContext(ctx, `UPDATE users u SET plan='free',stripe_customer_id=d.stripe_customer_id,stripe_subscription_id=d.stripe_subscription_id,stripe_subscription_status=CASE WHEN d.stripe_subscription_id IS NULL THEN NULL ELSE 'canceled' END,stripe_cancel_at_period_end=false,stripe_current_period_end=NULL FROM account_deletion_requests d WHERE d.user_id=u.id AND u.id=$1`, user)
	if err != nil {
		return err
	}
	_, err = b.db.ExecContext(ctx, `UPDATE account_deletion_requests SET billing_cancellation_completed=true WHERE user_id=$1`, user)
	return err
}

type fakeCleanup struct {
	err   error
	run   func(context.Context, string)
	mu    sync.Mutex
	calls int
}

func (m *fakeCleanup) CleanupAccount(ctx context.Context, user string) (media.CleanupResult, error) {
	m.mu.Lock()
	m.calls++
	m.mu.Unlock()
	if m.run != nil {
		m.run(ctx, user)
	}
	return media.CleanupResult{Complete: m.err == nil}, m.err
}
func deletionInput(user string) DeletionInput {
	return DeletionInput{Confirmation: user + "@example.invalid", CurrentPassword: ptr(testPassword)}
}

func TestPostgresDeletionPreservesRowsOnBillingAndMediaFailureAndRetries(t *testing.T) {
	db := testdb.Open(t)
	user := seedAccount(t, db)
	seedWork(t, db, user, "completed", false)
	b := &fakeBilling{db: db, err: errors.New("provider outage secret details")}
	m := &fakeCleanup{}
	h := New(db, passAuth{}, m, b, Config{})
	ctx := context.Background()
	err := h.deleteAccount(ctx, user, 1, deletionInput(user))
	var api *apiError
	if !errors.As(err, &api) || api.Status != 502 || strings.Contains(err.Error(), "secret") {
		t.Fatal(err)
	}
	var done bool
	var failure string
	if err = db.QueryRow(`SELECT billing_cancellation_completed,last_failure FROM account_deletion_requests WHERE user_id=$1`, user).Scan(&done, &failure); err != nil || done || failure != "billing_cancellation_failed" {
		t.Fatal(done, failure, err)
	}
	if m.calls != 0 {
		t.Fatal("media touched before billing completed")
	}
	b.err = nil
	m.err = errors.New("storage failure")
	if err = h.deleteAccount(ctx, user, 1, deletionInput(user)); err == nil {
		t.Fatal("media failure ignored")
	}
	if err = db.QueryRow(`SELECT billing_cancellation_completed,last_failure FROM account_deletion_requests WHERE user_id=$1`, user).Scan(&done, &failure); err != nil || !done || failure != "media_cleanup_failed" {
		t.Fatal(done, failure, err)
	}
	m.err = nil
	if err = h.deleteAccount(ctx, user, 1, deletionInput(user)); err != nil {
		t.Fatal(err)
	}
	if done, err = h.finished(ctx, user); err != nil || !done {
		t.Fatal(done, err)
	}
	if err = h.deleteAccount(ctx, user, 1, deletionInput(user)); err != nil {
		t.Fatal("idempotent retry", err)
	}
}
func TestPostgresDeletionWaitsForRunningWorkAndFencesPendingEdits(t *testing.T) {
	db := testdb.Open(t)
	user := seedAccount(t, db)
	job, clip := seedWork(t, db, user, "downloading", true)
	b := &fakeBilling{db: db}
	m := &fakeCleanup{}
	h := New(db, passAuth{}, m, b, Config{})
	ctx := context.Background()
	err := h.deleteAccount(ctx, user, 1, deletionInput(user))
	var api *apiError
	if !errors.As(err, &api) || api.Code != "processing_pending" || m.calls != 0 {
		t.Fatal(err, m.calls)
	}
	var status string
	var active bool
	if err = db.QueryRow(`SELECT status,processing_active FROM jobs WHERE id=$1`, job).Scan(&status, &active); err != nil || status != "cancelled" || !active {
		t.Fatal(status, active, err)
	}
	// A queued edit has not entered the worker, so deletion can fence it even
	// when Redis is unavailable; an already-running edit remains a blocker.
	token := fixtureID()
	if _, err = db.Exec(`UPDATE jobs SET processing_active=false,active_edit_tasks=1,active_edit_token=$2,edit_deadline=now()+interval '1 hour' WHERE id=$1`, job, token); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(`INSERT INTO edit_deliveries(id,job_id,clip_id,kind,task_id,reservation_token,payload) VALUES($1,$2,$3,'trim',$4,$5,'{}')`, fixtureID(), job, clip, fixtureID(), token); err != nil {
		t.Fatal(err)
	}
	if err = h.deleteAccount(ctx, user, 1, deletionInput(user)); err != nil {
		t.Fatal(err)
	}
	if done, _ := h.finished(ctx, user); !done {
		t.Fatal("pending edit blocked deletion")
	}
}
func TestPostgresDeletionFinalizationRejectsBillingOrWorkChangedDuringCleanup(t *testing.T) {
	for _, change := range []string{"billing", "work"} {
		t.Run(change, func(t *testing.T) {
			db := testdb.Open(t)
			user := seedAccount(t, db)
			job, _ := seedWork(t, db, user, "completed", false)
			b := &fakeBilling{db: db}
			m := &fakeCleanup{run: func(ctx context.Context, id string) {
				var err error
				if change == "billing" {
					_, err = db.ExecContext(ctx, `UPDATE users SET stripe_customer_id='cus_new' WHERE id=$1`, id)
				} else {
					_, err = db.ExecContext(ctx, `UPDATE jobs SET processing_active=true WHERE id=$1`, job)
				}
				if err != nil {
					t.Error(err)
				}
			}}
			h := New(db, passAuth{}, m, b, Config{})
			err := h.deleteAccount(context.Background(), user, 1, deletionInput(user))
			var api *apiError
			if !errors.As(err, &api) || api.Status != 409 {
				t.Fatal(err)
			}
			if done, _ := h.finished(context.Background(), user); done {
				t.Fatal("deleted despite changed prerequisite")
			}
		})
	}
}
func TestPostgresFreezeRejectsStalePasswordAndPreservesBillingSnapshot(t *testing.T) {
	db := testdb.Open(t)
	user := seedAccount(t, db)
	h := New(db, passAuth{}, nil, nil, Config{})
	ctx := context.Background()
	snapshot, err := h.deletionAccount(ctx, user)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(`UPDATE users SET session_version=session_version+1 WHERE id=$1`, user); err != nil {
		t.Fatal(err)
	}
	if err = h.freeze(ctx, user, snapshot); err == nil {
		t.Fatal("stale security snapshot froze account")
	}
	snapshot, err = h.deletionAccount(ctx, user)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(`UPDATE users SET stripe_customer_id='cus_original' WHERE id=$1`, user); err != nil {
		t.Fatal(err)
	}
	if err = h.freeze(ctx, user, snapshot); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(`UPDATE users SET stripe_customer_id='cus_new' WHERE id=$1`, user); err != nil {
		t.Fatal(err)
	}
	if err = h.freeze(ctx, user, snapshot); err != nil {
		t.Fatal(err)
	}
	var customer string
	if err = db.QueryRow(`SELECT stripe_customer_id FROM account_deletion_requests WHERE user_id=$1`, user).Scan(&customer); err != nil || customer != "cus_original" {
		t.Fatal(customer, err)
	}
}
func TestPostgresExportOwnershipNullsAndSecretOmission(t *testing.T) {
	db := testdb.Open(t)
	user, other := seedAccount(t, db), seedAccount(t, db)
	job, clip := seedWork(t, db, user, "completed", false)
	seedWork(t, db, other, "completed", false)
	if _, err := db.Exec(`INSERT INTO chat_messages(id,user_id,clip_id,context,role,content,actions) VALUES($1,$2,$3,'editor','user','My message','[]')`, fixtureID(), user, clip); err != nil {
		t.Fatal(err)
	}
	scheduledPost := fixtureID()
	if _, err := db.Exec(`INSERT INTO scheduled_posts(id,user_id,clip_id,clip_owner_id,title,platforms,account_ids,status,scheduled_at,tiktok_options,updated_at) VALUES($1,$2,$3,$2,'TikTok draft',ARRAY['tiktok']::varchar[],ARRAY[]::uuid[],'draft',now(),'{"privacyLevel":"SELF_ONLY","musicUsageConfirmed":true}'::jsonb,now())`, scheduledPost, user, clip); err != nil {
		t.Fatal(err)
	}
	h := New(db, passAuth{}, nil, nil, Config{})
	data, err := h.exportData(context.Background(), user)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := json.Marshal(data)
	if err != nil {
		t.Fatal(err)
	}
	s := string(raw)
	for _, secret := range []string{testHash, other, "passwordHash", "password_hash", "sessionVersion", "celery_task_id", "active_edit_token", "file_path"} {
		if strings.Contains(s, secret) {
			t.Fatal("export leak", secret)
		}
	}
	if !strings.Contains(s, job) || !strings.Contains(s, "assistantMessages") || !strings.Contains(s, scheduledPost) || !strings.Contains(s, `"tiktokOptions"`) || !strings.Contains(s, `"privacyLevel":"SELF_ONLY"`) || !strings.Contains(s, `"musicUsageConfirmed":true`) || data["brandKit"] != nil || data["image"] != nil {
		t.Fatal(s)
	}
	profile, err := h.readProfile(context.Background(), user, time.Now().Unix())
	if err != nil || profile["canChangePassword"] != true || profile["provider"] != "credentials" || profile["recentlyAuthenticated"] != true {
		t.Fatal(profile, err)
	}
}
func TestPostgresDeletionRemovesVerificationArtifactsAndSurvivesConcurrentRetries(t *testing.T) {
	db := testdb.Open(t)
	user := seedAccount(t, db)
	email := user + "@example.invalid"
	for _, prefix := range []string{"", "password-reset:", "email-activation:"} {
		if _, err := db.Exec(`INSERT INTO verification_tokens(identifier,token,expires) VALUES($1,$2,now()+interval '1 hour')`, prefix+email, fixtureID()); err != nil {
			t.Fatal(err)
		}
	}
	b := &fakeBilling{db: db}
	m := &fakeCleanup{}
	h := New(db, passAuth{}, m, b, Config{})
	var wg sync.WaitGroup
	results := make(chan error, 4)
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			results <- h.deleteAccount(context.Background(), user, 1, deletionInput(user))
		}()
	}
	wg.Wait()
	close(results)
	for err := range results {
		if err != nil {
			t.Fatal(err)
		}
	}
	var count int
	if err := db.QueryRow(`SELECT count(*) FROM verification_tokens`).Scan(&count); err != nil || count != 0 {
		t.Fatal(count, err)
	}
	if done, _ := h.finished(context.Background(), user); !done {
		t.Fatal("concurrent deletion incomplete")
	}
}
