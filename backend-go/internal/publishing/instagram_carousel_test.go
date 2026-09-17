package publishing

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestInstagramMixedCarouselWaitsForEveryChildAndPreservesOrder(t *testing.T) {
	media := []PublishMedia{{Type: "video", URL: "https://media.example/first.mp4"}, {Type: "image", URL: "https://media.example/second.jpg"}, {Type: "video", URL: "https://media.example/third.mp4"}}
	created, parents := 0, 0
	ready := false
	caption := "Cover first: + text"
	p := mockProvider(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "GET" {
			status := "FINISHED"
			if !ready && r.URL.Path == "/v23.0/child-0" {
				status = "IN_PROGRESS"
			}
			fmt.Fprintf(w, `{"status_code":%q}`, status)
			return
		}
		if r.URL.Path != "/v23.0/123/media" {
			t.Errorf("unexpected endpoint %s", r.URL.Path)
		}
		_ = r.ParseForm()
		if r.Form.Get("media_type") == "CAROUSEL" {
			parents++
			if !ready || r.Form.Get("children") != "child-0,child-1,child-2" || r.Form.Get("caption") != caption {
				t.Errorf("premature or unordered carousel: %v", r.Form)
			}
			io.WriteString(w, `{"id":"parent"}`)
			return
		}
		item := media[created]
		if r.Form.Get("is_carousel_item") != "true" {
			t.Error("child missing carousel marker")
		}
		if item.Type == "video" {
			if r.Form.Get("media_type") != "VIDEO" || r.Form.Get("video_url") != item.URL || r.Form.Get("image_url") != "" {
				t.Errorf("incorrect video child: %v", r.Form)
			}
		} else if r.Form.Get("image_url") != item.URL || r.Form.Get("video_url") != "" {
			t.Errorf("incorrect image child: %v", r.Form)
		}
		fmt.Fprintf(w, `{"id":"child-%d"}`, created)
		created++
	})
	ctx, creds := context.Background(), Credentials{AccessToken: "token"}
	job, status, err := p.PublishMedia(ctx, "instagram", "123", creds, media, caption, TikTokOptions{})
	if err != nil || status != "processing" || created != 3 || parents != 0 {
		t.Fatalf("children: status=%s created=%d parents=%d err=%v", status, created, parents, err)
	}
	status, _, err = p.Poll(ctx, "instagram", job, creds)
	if err != nil || status != "processing" || parents != 0 {
		t.Fatalf("processing: %s %v", status, err)
	}
	ready = true
	status, _, err = p.Poll(ctx, "instagram", job, creds)
	if err != nil || status != "carousel_ready" || parents != 0 {
		t.Fatalf("read-only poll: %s %v", status, err)
	}
	parent, err := p.CreateCarousel(ctx, job, creds)
	if err != nil || parent != "123:parent" || parents != 1 || created != 3 {
		t.Fatalf("parent: %s %v", parent, err)
	}
	status, _, err = p.Poll(ctx, "instagram", parent, creds)
	if err != nil || status != "ready" {
		t.Fatalf("parent status: %s %v", status, err)
	}
}

func TestInstagramCarouselChildFailureStopsParent(t *testing.T) {
	for _, failure := range []string{"ERROR", "EXPIRED"} {
		t.Run(failure, func(t *testing.T) {
			posts := 0
			p := mockProvider(t, func(w http.ResponseWriter, r *http.Request) {
				if r.Method == "POST" {
					posts++
					fmt.Fprintf(w, `{"id":"child-%d"}`, posts)
					return
				}
				fmt.Fprintf(w, `{"status_code":%q}`, failure)
			})
			job, _, err := p.PublishMedia(context.Background(), "instagram", "123", Credentials{}, []PublishMedia{{Type: "image", URL: "https://media.example/a.jpg"}, {Type: "video", URL: "https://media.example/b.mp4"}}, "", TikTokOptions{})
			if err != nil {
				t.Fatal(err)
			}
			status, _, err := p.Poll(context.Background(), "instagram", job, Credentials{})
			if err == nil || status != "failed" || posts != 2 {
				t.Fatalf("failed child was accepted: %s %v", status, err)
			}
		})
	}
}

func TestPublishMediaRejectsUnsupportedCombinationsBeforeNetwork(t *testing.T) {
	p := mockProvider(t, func(w http.ResponseWriter, r *http.Request) {
		t.Error("invalid selection reached remote provider")
		w.WriteHeader(500)
	})
	for _, sample := range []struct {
		provider string
		types    []string
	}{
		{"facebook", []string{"image", "video"}},
		{"facebook", []string{"video", "video"}},
		{"tiktok", []string{"image", "video"}},
		{"tiktok", []string{"video", "video"}},
		{"youtube", []string{"video"}},
		{"instagram", []string{"audio"}},
		{"instagram", strings.Split(strings.Repeat("image,", 10)+"image", ",")},
	} {
		media := make([]PublishMedia, len(sample.types))
		for i, kind := range sample.types {
			media[i] = PublishMedia{Type: kind, URL: "https://media.example/a.mp4"}
		}
		_, status, err := p.PublishMedia(context.Background(), sample.provider, "123", Credentials{}, media, "", TikTokOptions{})
		if err == nil || status != "failed" {
			t.Errorf("accepted %s %v: %s %v", sample.provider, sample.types, status, err)
		}
	}
}

func TestMetaVideoContainerValidationPreservesUnsupportedOriginal(t *testing.T) {
	for _, provider := range []string{"instagram", "facebook"} {
		for _, suffix := range []string{"mp4", "MOV", "webm", "avi", "mkv"} {
			err := ValidateMediaReferences(provider, []PublishMedia{{Type: "video", URL: "https://media.example/original." + suffix + "?signature=test"}})
			expected := suffix == "mp4" || suffix == "MOV"
			if (err == nil) != expected {
				t.Errorf("%s %s: %v", provider, suffix, err)
			}
		}
	}
}
