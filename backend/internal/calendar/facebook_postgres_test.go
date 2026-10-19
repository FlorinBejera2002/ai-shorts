package calendar

import (
	"context"
	"testing"
	"time"

	"sneepcut/backend-go/internal/testdb"
)

func TestPostgresFacebookPhotoSettingsRoundTrip(t *testing.T) {
	db := testdb.Open(t)
	user, _, _ := seedCalendarClip(t, db)
	account := fixtureID(t)
	if _, err := db.Exec(`INSERT INTO social_accounts(id,user_id,provider,remote_id,name,credentials) VALUES($1,$2,'facebook','page-fixture','Page fixture','sealed')`, account, user); err != nil {
		t.Fatal(err)
	}
	storage := &instagramScheduleMedia{}
	repo := NewRepository(db, storage)
	input := map[string]any{
		"title": "Photo fixture", "platforms": []any{"facebook"}, "accountIds": []any{account},
		"status": "scheduled", "scheduledAt": time.Now().Add(time.Hour).UTC().Format(time.RFC3339),
		"facebook": map[string]any{"placeId": "123456"},
		"media":    []any{map[string]any{"type": "image", "name": "original.png", "reference": "publishing/" + user + "/original.png", "altText": "A red bicycle 🚲", "crop": map[string]any{"aspectRatio": "4:5", "x": .25, "y": .75, "zoom": 2}}},
	}
	post, err := repo.Mutate(context.Background(), user, "", input, true)
	if err != nil {
		t.Fatal(err)
	}
	post, err = repo.Mutate(context.Background(), user, post.ID, map[string]any{"facebook": map[string]any{"placeId": "987654"}}, false)
	if err != nil {
		t.Fatal(err)
	}
	loaded, err := repo.Get(context.Background(), user, post.ID)
	if err != nil {
		t.Fatal(err)
	}
	if storage.prepared != 2 || loaded.Facebook == nil || loaded.Facebook.PlaceID != "987654" || len(loaded.Media) != 1 || loaded.Media[0].AltText != "A red bicycle 🚲" || loaded.Media[0].Crop == nil || loaded.Media[0].Crop.X != .25 || loaded.Media[0].Reference != "publishing/"+user+"/original.png" {
		t.Fatalf("metadata roundtrip failed: %+v prepared=%d", loaded, storage.prepared)
	}
}
