package brand

import (
	"context"
	"errors"
	"testing"

	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/testdb"
)

func TestAdminWhiteLabelDoesNotRequirePaidPlan(t *testing.T) {
	db := testdb.Open(t)
	user, _ := data.NewUUID()
	if _, err := db.Exec(`INSERT INTO users(id,email,provider,credits,plan,access_role) VALUES($1,$2,'credentials',0,'free','admin')`, user, user+"@example.invalid"); err != nil {
		t.Fatal(err)
	}
	repo := NewRepository(db)
	if err := repo.Update(context.Background(), user, map[string]any{"hidePlatformBadge": true}); err != nil {
		t.Fatalf("zero-credit free admin cannot remove badge: %v", err)
	}
	var hidden bool
	if err := db.QueryRow(`SELECT hide_platform_badge FROM brand_kits WHERE user_id=$1`, user).Scan(&hidden); err != nil || !hidden {
		t.Fatalf("badge preference not saved: %v %v", hidden, err)
	}
	if _, err := db.Exec(`UPDATE users SET access_role='member' WHERE id=$1`, user); err != nil {
		t.Fatal(err)
	}
	if err := repo.Update(context.Background(), user, map[string]any{"hidePlatformBadge": true}); !errors.Is(err, ErrPlan) {
		t.Fatalf("demotion retained admin entitlement: %v", err)
	}
}
