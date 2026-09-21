package brand

import (
	"context"
	"errors"
	"sync"
	"testing"

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
