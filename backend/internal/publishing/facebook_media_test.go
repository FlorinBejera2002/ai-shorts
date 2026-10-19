package publishing

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/media"
)

func TestFacebookPhotosReceiveIndependentAlternativeText(t *testing.T) {
	items := []PublishMedia{
		{Type: "image", URL: "https://media.example/crop-one.jpg", AltText: "A red bicycle 🚲", UserTags: []InstagramUserTag{{Username: "alice", X: .5, Y: .5}}},
		{Type: "image", URL: "https://media.example/crop-two.jpg", AltText: "A blue bicycle"},
	}
	uploads, feeds := 0, 0
	client := mockProvider(t, func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/photos") {
			_ = r.ParseForm()
			item := items[uploads]
			if r.Form.Get("url") != item.URL || r.Form.Get("alt_text_custom") != item.AltText || r.Form.Get("published") != "false" {
				t.Errorf("incorrect Facebook photo metadata: %v", r.Form)
			}
			if r.Form.Has("alt_text") || r.Form.Has("user_tags") {
				t.Errorf("Instagram metadata leaked to Facebook: %v", r.Form)
			}
			uploads++
			fmt.Fprintf(w, `{"id":"photo-%d"}`, uploads)
			return
		}
		var body struct {
			Message       string
			Place         string
			AttachedMedia []map[string]string `json:"attached_media"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body.Message != "Caption" || body.Place != "987654" || len(body.AttachedMedia) != 2 || body.AttachedMedia[0]["media_fbid"] != "photo-1" || body.AttachedMedia[1]["media_fbid"] != "photo-2" {
			t.Errorf("photo ordering lost: %+v", body)
		}
		feeds++
		fmt.Fprint(w, `{"id":"123_456"}`)
	})
	id, status, err := client.PublishMedia(context.Background(), "facebook", "123", Credentials{}, items, "Caption", TikTokOptions{}, InstagramOptions{}, FacebookOptions{PlaceID: "987654"})
	if err != nil || id != "123_456" || status != "published" || uploads != 2 || feeds != 1 {
		t.Fatalf("Facebook publication: %s %s uploads%d feeds%d %v", id, status, uploads, feeds, err)
	}
}

func TestFacebookReelAdvancedOptionsReachFinalization(t *testing.T) {
	calls := 0
	client := mockProvider(t, func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		if r.URL.Path != "/v23.0/123/video_reels" || r.Form.Get("upload_phase") != "finish" || r.Form.Get("video_id") != "456" || r.Form.Get("description") != "A + caption" || r.Form.Get("title") != "My Reel" || r.Form.Get("place") != "987654" || r.Form.Get("is_ai_generated") != "true" {
			t.Errorf("incorrect Reel finish payload: %s %v", r.URL.Path, r.Form)
		}
		calls++
		fmt.Fprint(w, `{"success":true}`)
	})
	id, _, err := client.Finalize(context.Background(), "facebook", "123:456:A+%2B+caption", Credentials{}, FacebookOptions{PlaceID: "987654", ReelTitle: "My Reel", IsAIGenerated: true})
	if err != nil || id != "456" || calls != 1 {
		t.Fatalf("Reel finish %s %v calls%d", id, err, calls)
	}
}

func TestFacebookRejectsReelOptionsForPhotosAndInvalidPlaces(t *testing.T) {
	for _, options := range []FacebookOptions{{PlaceID: "not-a-place"}, {ReelTitle: "Reel title"}, {IsAIGenerated: true}, {ReelTitle: strings.Repeat("🚲", 256)}} {
		client := mockProvider(t, func(http.ResponseWriter, *http.Request) { t.Error("invalid settings reached provider") })
		if _, status, err := client.PublishMedia(context.Background(), "facebook", "123", Credentials{}, []PublishMedia{{Type: "image", URL: "https://media.example/photo.jpg"}}, "", TikTokOptions{}, InstagramOptions{}, options); err == nil || status != "failed" {
			t.Fatalf("invalid settings accepted: %+v", options)
		}
	}
}

func TestFacebookRejectsInvalidPhotoMetadataBeforeProviderRequests(t *testing.T) {
	for _, item := range []PublishMedia{
		{Type: "image", URL: "https://media.example/photo.jpg", AltText: strings.Repeat("🚲", 1001)},
		{Type: "video", URL: "https://media.example/video.mp4", AltText: "photo only"},
		{Type: "image", URL: "https://media.example/photo.jpg", Crop: &media.InstagramCrop{AspectRatio: "4:5", X: 2, Y: .5, Zoom: 1}},
	} {
		client := mockProvider(t, func(http.ResponseWriter, *http.Request) { t.Error("provider called for invalid photo metadata") })
		if _, status, err := client.PublishMedia(context.Background(), "facebook", "123", Credentials{}, []PublishMedia{item}, "", TikTokOptions{}, InstagramOptions{}); err == nil || status != "failed" {
			t.Fatalf("accepted invalid metadata %v", err)
		}
	}
}
