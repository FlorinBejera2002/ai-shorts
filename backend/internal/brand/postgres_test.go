package brand

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"sneepcut/backend-go/internal/media"
	"sneepcut/backend-go/internal/testdb"
)

func TestPostgresBrandDefaultsPartialUpdatesAndEntitlements(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	userID := "123e4567-e89b-42d3-a456-426614174000"
	if _, e := db.Exec(`INSERT INTO users(id,email,provider,credits,plan) VALUES($1,'brand@example.invalid','credentials',100,'free')`, userID); e != nil {
		t.Fatal(e)
	}
	repo := NewRepository(db)
	if e := repo.Update(ctx, userID, map[string]any{"primaryColor": "#abc123", "watermarkOpacity": 0.4}); e != nil {
		t.Fatal(e)
	}
	reader := media.NewService(media.Config{}, db, nil, nil, nil)
	kit, e := reader.GetBrand(ctx, userID)
	if e != nil {
		t.Fatal(e)
	}
	if kit["primaryColor"] != "#ABC123" || kit["secondaryColor"] != "#8b5cf6" || kit["fontFamily"] != "Inter" || kit["logoPath"] != nil || kit["hidePlatformBadge"] != false {
		t.Fatalf("defaults lost: %+v", kit)
	}
	if e = repo.Update(ctx, userID, map[string]any{"hidePlatformBadge": true}); !errors.Is(e, ErrPlan) {
		t.Fatalf("free badge removal: %v", e)
	}
	var hidden bool
	if e = db.QueryRow(`SELECT hide_platform_badge FROM brand_kits WHERE user_id=$1`, userID).Scan(&hidden); e != nil || hidden {
		t.Fatal("failed update changed state")
	}
	if _, e = db.Exec(`UPDATE users SET plan='agency' WHERE id=$1`, userID); e != nil {
		t.Fatal(e)
	}
	if e = repo.Update(ctx, userID, map[string]any{"hidePlatformBadge": true, "subtitleFont": "Arial Bold"}); e != nil {
		t.Fatal(e)
	}
	// Independent concurrent partial edits must not overwrite each other's fields.
	var wg sync.WaitGroup
	for _, input := range []map[string]any{{"primaryColor": "#010203"}, {"secondaryColor": "#040506"}} {
		wg.Add(1)
		go func(input map[string]any) {
			defer wg.Done()
			if e := repo.Update(ctx, userID, input); e != nil {
				t.Error(e)
			}
		}(input)
	}
	wg.Wait()
	kit, e = reader.GetBrand(ctx, userID)
	if e != nil || kit["primaryColor"] != "#010203" || kit["secondaryColor"] != "#040506" || kit["hidePlatformBadge"] != true || kit["subtitleFont"] != "Arial Bold" {
		t.Fatalf("partial update lost fields: %+v %v", kit, e)
	}
	for _, update := range []string{`UPDATE users SET access_role='viewer' WHERE id=$1`, `UPDATE users SET access_role='member',email_activation_required=true WHERE id=$1`} {
		if _, e = db.Exec(update, userID); e != nil {
			t.Fatal(e)
		}
		if e = repo.Update(ctx, userID, map[string]any{"primaryColor": "#000000"}); !errors.Is(e, ErrInactive) {
			t.Fatalf("inactive mutation %v", e)
		}
	}
	if _, e = db.Exec(`UPDATE users SET email_activation_required=false WHERE id=$1`, userID); e != nil {
		t.Fatal(e)
	}
	if _, e = db.Exec(`INSERT INTO account_deletion_requests(user_id) VALUES($1)`, userID); e != nil {
		t.Fatal(e)
	}
	if e = repo.Update(ctx, userID, map[string]any{"fontFamily": "Arial"}); !errors.Is(e, ErrInactive) {
		t.Fatalf("deleting mutation %v", e)
	}
}

func TestPostgresBrandChecksCoverageAfterWaitingForAccountLock(t *testing.T) {
	db := testdb.Open(t)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	user := "123e4567-e89b-42d3-a456-426614174099"
	if _, err := db.ExecContext(ctx, `INSERT INTO users(id,email,provider,credits,plan,stripe_subscription_id,stripe_subscription_status,stripe_current_period_end) VALUES($1,'brand-expiry-lock@example.invalid','credentials',100,'agency','sub_brand_expiry_lock','active',clock_timestamp()+interval '2 seconds')`, user); err != nil {
		t.Fatal(err)
	}
	owner, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer owner.Rollback()
	var locked string
	if err := owner.QueryRowContext(ctx, `SELECT id::text FROM users WHERE id=$1 FOR UPDATE`, user).Scan(&locked); err != nil {
		t.Fatal(err)
	}
	var ownerPID int
	if err := owner.QueryRowContext(ctx, `SELECT pg_backend_pid()`).Scan(&ownerPID); err != nil {
		t.Fatal(err)
	}
	result := make(chan error, 1)
	go func() { result <- NewRepository(db).Update(ctx, user, map[string]any{"hidePlatformBadge": true}) }()
	blocked := false
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if err := db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)))`, ownerPID).Scan(&blocked); err != nil {
			t.Fatal(err)
		}
		if blocked {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if !blocked {
		t.Fatal("protected update did not wait behind the account lock")
	}
	// Leave the financial row unchanged while time crosses its verified bound.
	if _, err := owner.ExecContext(ctx, `SELECT pg_sleep(2.1)`); err != nil {
		t.Fatal(err)
	}
	if err := owner.Commit(); err != nil {
		t.Fatal(err)
	}
	if err := <-result; !errors.Is(err, ErrPlan) {
		t.Fatalf("expired protected mutation was authorized after lock wait: %v", err)
	}
}
