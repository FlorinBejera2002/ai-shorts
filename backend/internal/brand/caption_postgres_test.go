package brand

import (
	"context"
	"encoding/json"
	"errors"
	"sneepcut/backend-go/internal/captions"
	"sneepcut/backend-go/internal/media"
	"sneepcut/backend-go/internal/testdb"
	"testing"
)

func TestCaptionStyleSaveReloadFontOwnershipAndArchive(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	owner, other, font := "123e4567-e89b-42d3-a456-426614174001", "123e4567-e89b-42d3-a456-426614174002", "123e4567-e89b-42d3-a456-426614174003"
	for _, user := range []string{owner, other} {
		if _, e := db.Exec(`INSERT INTO users(id,email,provider,credits,plan) VALUES($1,$2,'credentials',100,'free')`, user, user+"@example.invalid"); e != nil {
			t.Fatal(e)
		}
	}
	key, _ := captions.PrivateKey(owner, font)
	if _, e := db.Exec(`INSERT INTO caption_fonts(id,user_id,family,style,weight,romanian,digest,storage_key) VALUES($1,$2,'Open Sans','Bold',700,true,'synthetic',$3)`, font, owner, key); e != nil {
		t.Fatal(e)
	}
	style := captions.Default()
	style.FontID = font
	style.Position = captions.Position{X: .32, Y: .27, Anchor: "center"}
	r := NewRepository(db)
	if err := r.Update(ctx, other, map[string]any{"captionStyle": style}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("foreign private font accepted: %v", err)
	}
	if err := r.Update(ctx, owner, map[string]any{"captionStyle": style, "watermarkEnabled": false, "watermarkSize": .24, "watermarkMargin": .04}); err != nil {
		t.Fatal(err)
	}
	service := media.NewService(media.Config{}, db, nil, nil, nil)
	kit, e := service.GetBrand(ctx, owner)
	if e != nil {
		t.Fatal(e)
	}
	raw, _ := json.Marshal(kit["captionStyle"])
	var restored captions.Style
	if e = json.Unmarshal(raw, &restored); e != nil || restored != style {
		t.Fatalf("style changed on save/reload %#v %v", restored, e)
	}
	if kit["watermarkEnabled"] != false || kit["watermarkSize"] != .24 {
		t.Fatal("watermark values lost")
	}
	if _, e = db.Exec(`UPDATE caption_fonts SET archived=true WHERE id=$1`, font); e != nil {
		t.Fatal(e)
	}
	// Archiving removes discovery, not permissions or saved-project readability.
	if err := r.Update(ctx, owner, map[string]any{"captionStyle": style}); err != nil {
		t.Fatalf("saved archived font became unusable: %v", err)
	}
	if _, e = db.Exec(`UPDATE caption_fonts SET weight=400 WHERE id=$1`, font); e != nil {
		t.Fatal(e)
	}
	if err := r.Update(ctx, owner, map[string]any{"captionStyle": style}); !errors.Is(err, ErrInvalid) {
		t.Fatal("unavailable weight accepted")
	}
}
