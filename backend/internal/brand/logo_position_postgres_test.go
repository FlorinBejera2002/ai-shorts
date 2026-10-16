package brand

import (
	"context"
	"sneepcut/backend-go/internal/media"
	"sneepcut/backend-go/internal/testdb"
	"testing"
)

func TestLogoCenterSaveReloadAndReset(t *testing.T) {
	db := testdb.Open(t)
	user := "123e4567-e89b-42d3-a456-426614174010"
	if _, err := db.Exec(`INSERT INTO users(id,email,provider,credits,plan) VALUES($1,$2,'credentials',100,'free')`, user, user+"@example.invalid"); err != nil {
		t.Fatal(err)
	}
	r := NewRepository(db)
	ctx := context.Background()
	if err := r.Update(ctx, user, map[string]any{"watermarkX": .31, "watermarkY": .62, "watermarkSize": .25}); err != nil {
		t.Fatal(err)
	}
	service := media.NewService(media.Config{}, db, nil, nil, nil)
	kit, err := service.GetBrand(ctx, user)
	if err != nil || kit["watermarkX"] != .31 || kit["watermarkY"] != .62 || kit["watermarkSize"] != .25 {
		t.Fatalf("logo geometry lost: %#v %v", kit, err)
	}
	if err := r.Update(ctx, user, map[string]any{"watermarkX": nil, "watermarkY": nil, "watermarkPosition": "top-left"}); err != nil {
		t.Fatal(err)
	}
	kit, err = service.GetBrand(ctx, user)
	if err != nil || kit["watermarkX"] != nil || kit["watermarkY"] != nil || kit["watermarkPosition"] != "top-left" {
		t.Fatalf("logo reset lost: %#v %v", kit, err)
	}
	if _, err := db.Exec(`UPDATE brand_kits SET watermark_x=0.5 WHERE user_id=$1`, user); err == nil {
		t.Fatal("incomplete coordinate pair accepted by database")
	}
}
