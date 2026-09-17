package publishing

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestTikTokPhotoPostPreservesAllPhotosAndOptions(t *testing.T) {
	calls := 0
	p := mockProvider(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v2/post/publish/creator_info/query/":
			io.WriteString(w, `{"data":{"privacy_level_options":["SELF_ONLY"],"comment_disabled":true,"duet_disabled":true,"stitch_disabled":true},"error":{"code":"ok"}}`)
		case "/v2/post/publish/content/init/":
			calls++
			var body struct {
				MediaType string         `json:"media_type"`
				PostMode  string         `json:"post_mode"`
				Post      map[string]any `json:"post_info"`
				Source    struct {
					Photos []string `json:"photo_images"`
					Cover  int      `json:"photo_cover_index"`
					Source string   `json:"source"`
				} `json:"source_info"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatal(err)
			}
			if body.MediaType != "PHOTO" || body.PostMode != "DIRECT_POST" || len(body.Source.Photos) != 35 || body.Source.Cover != 0 || body.Source.Source != "PULL_FROM_URL" {
				t.Errorf("invalid photo payload: %+v", body)
			}
			for i, photo := range body.Source.Photos {
				if photo != fmt.Sprintf("https://media.example/%d.jpg", i) {
					t.Errorf("photo order changed: %v", body.Source.Photos)
				}
			}
			if body.Post["description"] != "" || body.Post["title"] != "Summer" || body.Post["auto_add_music"] != true || body.Post["disable_comment"] != true {
				t.Errorf("photo options lost: %+v", body.Post)
			}
			if _, ok := body.Post["disable_duet"]; ok {
				t.Error("video-only flag in photo payload")
			}
			io.WriteString(w, `{"data":{"publish_id":"photo-job"},"error":{"code":"ok"}}`)
		default:
			t.Errorf("unexpected endpoint %s", r.URL.Path)
			w.WriteHeader(404)
		}
	})
	photos := make([]PublishMedia, 35)
	for i := range photos {
		photos[i] = PublishMedia{Type: "image", URL: fmt.Sprintf("https://media.example/%d.jpg", i)}
	}
	id, status, err := p.PublishMedia(context.Background(), "tiktok", "creator", Credentials{}, photos, "", TikTokOptions{PrivacyLevel: "SELF_ONLY", MusicUsageConfirmed: true, AutoAddMusic: true, PhotoTitle: "Summer"})
	if err != nil || status != "processing" || id != "photo-job" || calls != 1 {
		t.Fatalf("%s %s %v calls=%d", id, status, err, calls)
	}
}

func TestTikTokTextLimitsAllowOptionalCaptions(t *testing.T) {
	for _, photo := range []bool{false, true} {
		if err := validateTikTokText(photo, "", TikTokOptions{}); err != nil {
			t.Fatal(err)
		}
		limit := 2200
		if photo {
			limit = 4000
		}
		caption := strings.Repeat("a", limit-2) + "😀"
		if err := validateTikTokText(photo, caption, TikTokOptions{}); err != nil {
			t.Fatal(err)
		}
		if err := validateTikTokText(photo, caption+"a", TikTokOptions{}); err == nil {
			t.Fatal("accepted caption over UTF16 limit")
		}
	}
	if err := validateTikTokText(true, "", TikTokOptions{PhotoTitle: strings.Repeat("😀", 45)}); err != nil {
		t.Fatal(err)
	}
	if err := validateTikTokText(true, "", TikTokOptions{PhotoTitle: strings.Repeat("😀", 46)}); err == nil {
		t.Fatal("accepted long photo title")
	}
}

func TestTikTokMediaCountsAndVerifiedURLs(t *testing.T) {
	photos := make([]string, 35)
	for i := range photos {
		photos[i] = "image"
	}
	for _, types := range [][]string{{"image"}, photos, {"video"}} {
		if err := ValidateMediaTypes("tiktok", types); err != nil {
			t.Fatal(err)
		}
	}
	for _, types := range [][]string{append(photos, "image"), {"image", "video"}, {"video", "video"}} {
		if err := ValidateMediaTypes("tiktok", types); err == nil {
			t.Fatalf("accepted %v", types)
		}
	}
	p := mockProvider(t, func(w http.ResponseWriter, r *http.Request) { t.Error("invalid URL reached provider") })
	_, status, err := p.PublishMedia(context.Background(), "tiktok", "creator", Credentials{}, []PublishMedia{{Type: "image", URL: "https://media.example/one.jpg"}, {Type: "image", URL: "https://unverified.example/two.jpg"}}, "", TikTokOptions{})
	if err == nil || status != "failed" {
		t.Fatal(status, err)
	}
}

func TestTikTokCreatorDurationAppliesOnlyToVideo(t *testing.T) {
	p := mockProvider(t, func(w http.ResponseWriter, r *http.Request) {
		io.WriteString(w, `{"data":{"privacy_level_options":["SELF_ONLY"],"max_video_post_duration_sec":60,"duet_disabled":true,"stitch_disabled":true},"error":{"code":"ok"}}`)
	})
	vault, err := newCipher(base64.StdEncoding.EncodeToString(make([]byte, 32)))
	if err != nil {
		t.Fatal(err)
	}
	h := &Handler{client: p, vault: vault, cfg: Config{Enabled: true, ProviderConfig: ProviderConfig{AppURL: "https://app.example"}}}
	account := Account{Provider: "tiktok"}
	options := TikTokOptions{PrivacyLevel: "SELF_ONLY", MusicUsageConfirmed: true}
	field, err := h.validateTikTokMediaSelection(context.Background(), account, Credentials{}, 0, sql.NullBool{Valid: true}, []PublishMedia{{Type: "image", URL: "https://media.example/photo.jpg"}}, "", options)
	if err != nil {
		t.Fatalf("photo inherited video-only restriction %s %v", field, err)
	}
	options.DisableDuet = true
	options.DisableStitch = true
	field, err = h.validateTikTokMediaSelection(context.Background(), account, Credentials{}, 61, sql.NullBool{Valid: true}, []PublishMedia{{Type: "video", URL: "https://media.example/video.mp4"}}, "", options)
	if err == nil || field != "clipId" {
		t.Fatalf("creator duration not enforced: %s %v", field, err)
	}
	field, err = h.validateTikTokMediaSelection(context.Background(), account, Credentials{}, 60, sql.NullBool{Valid: true}, []PublishMedia{{Type: "video", URL: "https://media.example/video.mp4"}}, "", options)
	if err != nil {
		t.Fatalf("allowed duration rejected %s %v", field, err)
	}
}
