package brand

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"sneepcut/backend-go/internal/media"
	"sneepcut/backend-go/internal/testdb"
)

func TestKitNameAndImageValidation(t *testing.T) {
	if name, err := kitName("  Podcast  "); err != nil || name != "Podcast" {
		t.Fatalf("trimmed name: %q %v", name, err)
	}
	for _, bad := range []string{"", "   ", string(make([]rune, 81))} {
		if _, err := kitName(bad); !errors.Is(err, ErrInvalid) {
			t.Fatalf("name %q accepted", bad)
		}
	}
	user := "123e4567-e89b-42d3-a456-426614174000"
	ok := "brand/" + user + "/logo-1-kit.png"
	if image, err := kitImage(user, &ok); err != nil || *image != ok {
		t.Fatalf("own image rejected: %v", err)
	}
	for _, bad := range []string{"brand/other/logo.png", "brand/" + user + "/../x.png", "https://example.invalid/a.png"} {
		value := bad
		if _, err := kitImage(user, &value); !errors.Is(err, ErrInvalid) {
			t.Fatalf("image %q accepted", bad)
		}
	}
	if image, err := kitImage(user, nil); err != nil || image != nil {
		t.Fatal("no image must stay nil")
	}
}

func TestPostgresBrandKitsLifecycle(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	user, other := "123e4567-e89b-42d3-a456-426614174101", "123e4567-e89b-42d3-a456-426614174102"
	for _, id := range []string{user, other} {
		if _, err := db.Exec(`INSERT INTO users(id,email,provider,credits,plan) VALUES($1,$2,'credentials',100,'free')`, id, id+"@example.invalid"); err != nil {
			t.Fatal(err)
		}
	}
	repo := NewRepository(db)
	reader := media.NewService(media.Config{}, db, nil, nil, nil)

	// The legacy single-kit write creates the default kit.
	if err := repo.Update(ctx, user, map[string]any{"primaryColor": "#112233"}); err != nil {
		t.Fatal(err)
	}
	kits, err := reader.ListKits(ctx, user)
	if err != nil || len(kits) != 1 || kits[0]["isDefault"] != true {
		t.Fatalf("default kit: %v %v", kits, err)
	}
	main := kits[0]["id"].(string)

	copied, err := repo.CreateKit(ctx, user, KitCreate{Name: "Podcast", FromKitID: &main})
	if err != nil {
		t.Fatal(err)
	}
	copy, _ := reader.GetKit(ctx, user, copied)
	if copy["primaryColor"] != "#112233" || copy["isDefault"] != false || copy["name"] != "Podcast" {
		t.Fatalf("copy lost settings: %v", copy)
	}
	blank, err := repo.CreateKit(ctx, user, KitCreate{Name: "Recipes"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = repo.CreateKit(ctx, user, KitCreate{Name: "podcast"}); !errors.Is(err, ErrConflict) {
		t.Fatalf("duplicate name: %v", err)
	}
	if _, err = repo.CreateKit(ctx, other, KitCreate{Name: "Stolen", FromKitID: &main}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("copy from another account: %v", err)
	}

	// Editing one kit leaves the others alone; the legacy endpoint keeps editing the default.
	if err = repo.UpdateKit(ctx, user, blank, map[string]any{"primaryColor": "#445566"}); err != nil {
		t.Fatal(err)
	}
	if err = repo.UpdateKit(ctx, other, blank, map[string]any{"primaryColor": "#000000"}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("foreign update: %v", err)
	}
	if kit, _ := reader.GetBrand(ctx, user); kit["id"] != main || kit["primaryColor"] != "#112233" {
		t.Fatalf("default kit changed: %v", kit)
	}

	// Rename, image and default switch.
	name, image := "Recipes 2", json.RawMessage(`"brand/`+user+`/logo-kit.png"`)
	yes := true
	if err = repo.ChangeKit(ctx, user, blank, KitChange{Name: &name, ImagePath: image, IsDefault: &yes}); err != nil {
		t.Fatal(err)
	}
	if kit, _ := reader.GetBrand(ctx, user); kit["id"] != blank || kit["name"] != "Recipes 2" || kit["imagePath"] != "brand/"+user+"/logo-kit.png" {
		t.Fatalf("default not switched: %v", kit)
	}
	var defaults int
	if err = db.QueryRow(`SELECT count(*) FROM brand_kits WHERE user_id=$1 AND is_default`, user).Scan(&defaults); err != nil || defaults != 1 {
		t.Fatalf("exactly one default: %d %v", defaults, err)
	}

	// Deleting the default promotes another kit.
	if err = repo.DeleteKit(ctx, user, blank); err != nil {
		t.Fatal(err)
	}
	if kit, _ := reader.GetBrand(ctx, user); kit == nil || kit["id"] == blank {
		t.Fatalf("no default after delete: %v", kit)
	}
	if err = repo.DeleteKit(ctx, other, copied); !errors.Is(err, ErrNotFound) {
		t.Fatalf("foreign delete: %v", err)
	}
}
