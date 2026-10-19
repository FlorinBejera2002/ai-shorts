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

func TestInstagramPhotoAndCarouselMetadataReachCorrectContainers(t *testing.T) {
	for _, carousel := range []bool{false, true} {
		t.Run(fmt.Sprint(carousel), func(t *testing.T) {
			calls := 0
			options := InstagramOptions{LocationID: "123456", Collaborators: []string{"alice", "bob"}, IsAIGenerated: true}
			items := []PublishMedia{{Type: "image", URL: "https://media.example/one.jpg", AltText: "A red bicycle 🚲", UserTags: []InstagramUserTag{{Username: "alice", X: .2, Y: .7}}}}
			if carousel {
				items = append(items, PublishMedia{Type: "image", URL: "https://media.example/two.jpg", AltText: "A green bicycle"})
			}
			client := mockProvider(t, func(w http.ResponseWriter, r *http.Request) {
				_ = r.ParseForm()
				child := r.Form.Get("is_carousel_item") == "true"
				parent := r.Form.Get("media_type") == "CAROUSEL"
				if !parent {
					if r.Form.Get("alt_text") != items[calls].AltText {
						t.Errorf("missing item alt text: %v", r.Form)
					}
					if calls == 0 && r.Form.Get("user_tags") != `[{"username":"alice","x":0.2,"y":0.7}]` {
						t.Errorf("missing positioned tags: %v", r.Form)
					}
				}
				if child {
					if r.Form.Has("location_id") || r.Form.Has("collaborators") || r.Form.Has("is_ai_generated") {
						t.Errorf("parent fields leaked to child: %v", r.Form)
					}
				} else if r.Form.Get("location_id") != "123456" || r.Form.Get("collaborators") != `["alice","bob"]` || r.Form.Get("is_ai_generated") != "true" {
					t.Errorf("missing parent options: %v", r.Form)
				}
				if r.Form.Has("comment_enabled") || r.Form.Has("share_to_feed") {
					t.Errorf("unsupported photo fields: %v", r.Form)
				}
				calls++
				fmt.Fprintf(w, `{"id":"%d"}`, calls)
			})
			job, _, err := client.PublishMedia(context.Background(), "instagram", "123", Credentials{}, items, "caption", TikTokOptions{}, options)
			if err != nil {
				t.Fatal(err)
			}
			if carousel {
				if _, err := client.CreateCarousel(context.Background(), job, Credentials{}); err != nil {
					t.Fatal(err)
				}
			}
			if calls != len(items)+map[bool]int{true: 1}[carousel] {
				t.Fatalf("unexpected calls %d", calls)
			}
		})
	}
}

func TestInstagramReelAdvancedFieldsAndExplicitFeedChoice(t *testing.T) {
	for _, cover := range []bool{true, false} {
		offset := 0
		shareToFeed := false
		options := InstagramOptions{AudioName: "My original audio", TrialReel: "MANUAL", ShareToFeed: &shareToFeed}
		if cover {
			options.CoverReference = "publishing/user/cover.png"
			options.CoverURL = "https://media.example/cover.jpg"
		} else {
			options.ThumbOffset = &offset
		}
		client := mockProvider(t, func(w http.ResponseWriter, r *http.Request) {
			_ = r.ParseForm()
			if r.Form.Get("media_type") != "REELS" || r.Form.Get("audio_name") != options.AudioName || r.Form.Get("trial_params") != `{"graduation_strategy":"MANUAL"}` || r.Form.Get("share_to_feed") != "false" {
				t.Errorf("missing Reel fields %v", r.Form)
			}
			if cover && r.Form.Get("cover_url") != options.CoverURL || !cover && r.Form.Get("thumb_offset") != "0" {
				t.Errorf("incorrect cover %v", r.Form)
			}
			fmt.Fprint(w, `{"id":"456"}`)
		})
		if _, _, err := client.PublishMedia(context.Background(), "instagram", "123", Credentials{}, []PublishMedia{{Type: "video", URL: "https://media.example/reel.mp4"}}, "", TikTokOptions{}, options); err != nil {
			t.Fatal(err)
		}
	}
}

func TestInstagramRejectsIncompatibleMetadataBeforeRequests(t *testing.T) {
	disabled := false
	for _, sample := range []struct {
		items   []PublishMedia
		options InstagramOptions
	}{
		{[]PublishMedia{{Type: "video", URL: "a.mp4", AltText: "bad"}}, InstagramOptions{}},
		{[]PublishMedia{{Type: "image", URL: "a.jpg"}}, InstagramOptions{AudioName: "reel only"}},
		{[]PublishMedia{{Type: "image", URL: "a.jpg"}}, InstagramOptions{CommentEnabled: &disabled}},
		{[]PublishMedia{{Type: "image", URL: "a.jpg", AltText: strings.Repeat("🚲", 1001)}}, InstagramOptions{}},
		{[]PublishMedia{{Type: "image", URL: "a.jpg", Crop: &media.InstagramCrop{AspectRatio: "1:1", X: 2, Y: .5, Zoom: 1}}}, InstagramOptions{}},
	} {
		client := mockProvider(t, func(http.ResponseWriter, *http.Request) { t.Error("provider called for invalid settings") })
		if _, status, err := client.PublishMedia(context.Background(), "instagram", "123", Credentials{}, sample.items, "", TikTokOptions{}, sample.options); err == nil || status != "failed" {
			t.Fatalf("accepted invalid metadata: %s %v", status, err)
		}
	}
	if err := ValidateInstagramMedia([]PublishMedia{{Type: "image", AltText: strings.Repeat("🚲", 1000)}}, InstagramOptions{}); err != nil {
		t.Fatal("Unicode limit counts bytes instead of characters", err)
	}
}

func TestOtherProvidersKeepOriginalReferenceWithoutInstagramMetadata(t *testing.T) {
	input := []MediaAttachment{{Type: "image", Reference: "publishing/user/original.png", Name: "original", AltText: "description", Crop: &media.InstagramCrop{AspectRatio: "4:5", X: .5, Y: .5, Zoom: 2}, UserTags: []InstagramUserTag{{Username: "alice", X: .5, Y: .5}}}}
	for _, provider := range []string{"facebook", "tiktok", "youtube", "instagram"} {
		items := attachmentsForProvider(provider, input)
		if items[0].Reference != input[0].Reference {
			t.Fatal("original reference changed")
		}
		if provider != "instagram" && len(items[0].UserTags) > 0 {
			t.Fatalf("Instagram tags leaked to %s", provider)
		}
		if provider != "instagram" && provider != "facebook" && items[0].AltText != "" {
			t.Fatalf("metadata leaked to %s", provider)
		}
		if provider == "youtube" && items[0].Crop != nil {
			t.Fatal("photo crop leaked to YouTube")
		}
		if provider == "tiktok" && items[0].Crop == nil {
			t.Fatal("TikTok photo crop was lost")
		}
	}
	raw, _ := json.Marshal(input)
	var decoded []MediaAttachment
	if err := json.Unmarshal(raw, &decoded); err != nil || decoded[0].Crop.Zoom != 2 || decoded[0].AltText != "description" {
		t.Fatalf("round trip lost metadata: %s %v", raw, err)
	}
}
