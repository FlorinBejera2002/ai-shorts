package publishing

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"reflect"
	"strings"
	"testing"
)

func TestYouTubeAdvancedOptionsValidation(t *testing.T) {
	for _, tc := range []struct {
		name    string
		options YouTubeOptions
		valid   bool
	}{
		{"legacy draft", YouTubeOptions{}, true},
		{"standard license", YouTubeOptions{License: "youtube"}, true},
		{"creative commons", YouTubeOptions{License: "creativeCommon"}, true},
		{"unknown license", YouTubeOptions{License: "cc-by"}, false},
		{"unicode boundary", YouTubeOptions{Tags: []string{strings.Repeat("ș", 500)}}, true},
		{"unicode overflow", YouTubeOptions{Tags: []string{strings.Repeat("ș", 501)}}, false},
		{"separator boundary", YouTubeOptions{Tags: []string{strings.Repeat("a", 498), "b"}}, true},
		{"separator overflow", YouTubeOptions{Tags: []string{strings.Repeat("a", 499), "b"}}, false},
		{"quoted space boundary", YouTubeOptions{Tags: []string{"x y", strings.Repeat("é", 494)}}, true},
		{"quoted space overflow", YouTubeOptions{Tags: []string{"x y", strings.Repeat("é", 495)}}, false},
		{"empty tag", YouTubeOptions{Tags: []string{""}}, false},
		{"blank tag", YouTubeOptions{Tags: []string{" \u00a0"}}, false},
		{"invalid unicode", YouTubeOptions{Tags: []string{string([]byte{0xff})}}, false},
		{"angle brackets", YouTubeOptions{Tags: []string{"<tag>"}}, false},
		{"newline", YouTubeOptions{Tags: []string{"first\nsecond"}}, false},
		{"null", YouTubeOptions{Tags: []string{"tag\x00"}}, false},
		{"unicode control", YouTubeOptions{Tags: []string{"tag\u0085"}}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			err := ValidateYouTubeAdvancedOptions(tc.options)
			if (err == nil) != tc.valid {
				t.Fatalf("valid=%v: %v", tc.valid, err)
			}
			publish := youtubeTestOptions()
			publish.Tags, publish.License = tc.options.Tags, tc.options.License
			if err := ValidateYouTubeOptions(publish, false); (err == nil) != tc.valid {
				t.Fatalf("publish valid=%v: %v", tc.valid, err)
			}
		})
	}
}

func TestYouTubeUploadAdvancedMetadataAndDefaults(t *testing.T) {
	no, yes := false, true
	for _, tc := range []struct {
		name       string
		license    string
		embeddable *bool
		tags       []string
	}{
		{name: "legacy defaults omitted"},
		{name: "explicit embedding disabled", license: "creativeCommon", embeddable: &no, tags: []string{"Sneep Cut", "română"}},
		{name: "explicit embedding enabled", license: "youtube", embeddable: &yes, tags: []string{"video"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			requests := 0
			p := mockProvider(t, func(w http.ResponseWriter, r *http.Request) {
				requests++
				if r.URL.Path == "/video.mp4" {
					w.Header().Set("Content-Type", "video/mp4")
					io.WriteString(w, "video")
					return
				}
				if r.Method == http.MethodPost {
					var body struct {
						Snippet map[string]json.RawMessage `json:"snippet"`
						Status  map[string]json.RawMessage `json:"status"`
					}
					if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
						t.Error(err)
						w.WriteHeader(http.StatusBadRequest)
						return
					}
					var tags []string
					if raw, present := body.Snippet["tags"]; present {
						if len(tc.tags) == 0 {
							t.Error("empty tags must be omitted")
						}
						if err := json.Unmarshal(raw, &tags); err != nil {
							t.Error(err)
						}
					} else if len(tc.tags) > 0 {
						t.Error("missing tags")
					}
					if !reflect.DeepEqual(tags, tc.tags) {
						t.Errorf("tags = %v, want %v", tags, tc.tags)
					}
					license, present := body.Status["license"]
					if tc.license == "" {
						if present {
							t.Error("legacy default license must be omitted")
						}
					} else if string(license) != `"`+tc.license+`"` {
						t.Errorf("license = %s", license)
					}
					embeddable, present := body.Status["embeddable"]
					if tc.embeddable == nil {
						if present {
							t.Error("legacy default embedding must be omitted")
						}
					} else {
						want, _ := json.Marshal(*tc.embeddable)
						if !present || string(embeddable) != string(want) {
							t.Errorf("embeddable = %s, want %s", embeddable, want)
						}
					}
					w.Header().Set("Location", "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=session")
					return
				}
				io.WriteString(w, `{"id":"video-id"}`)
			})
			p.config.YouTubeMediaURLPrefix = "https://media.example/"
			o := youtubeTestOptions()
			o.Tags, o.License, o.Embeddable = tc.tags, tc.license, tc.embeddable
			// The worker receives options through the saved calendar JSON payload.
			data, err := json.Marshal(o)
			if err != nil {
				t.Fatal(err)
			}
			var restored YouTubeOptions
			if err := json.Unmarshal(data, &restored); err != nil {
				t.Fatal(err)
			}
			id, state, err := p.PublishYouTube(context.Background(), Credentials{AccessToken: "access"}, []PublishMedia{{Type: "video", URL: "https://media.example/video.mp4"}}, restored)
			if err != nil || id != "video-id" || state != "processing" || requests != 3 {
				t.Fatalf("id=%s state=%s requests=%d: %v", id, state, requests, err)
			}
		})
	}
}

func TestYouTubeRejectsInvalidAdvancedOptionsBeforeReadingMedia(t *testing.T) {
	requests := 0
	p := mockProvider(t, func(w http.ResponseWriter, r *http.Request) {
		requests++
		t.Error("invalid advanced options reached the provider")
	})
	p.config.YouTubeMediaURLPrefix = "https://media.example/"
	o := youtubeTestOptions()
	o.Tags = []string{strings.Repeat("a", 501)}
	_, state, err := p.PublishYouTube(context.Background(), Credentials{}, []PublishMedia{{Type: "video", URL: "https://media.example/video.mp4"}}, o)
	if err == nil || state != "failed" || requests != 0 {
		t.Fatalf("state=%s requests=%d: %v", state, requests, err)
	}
}
