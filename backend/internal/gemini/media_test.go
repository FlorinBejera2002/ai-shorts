package gemini

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/aiprovider"
)

func TestReviewMediaSendsPrivateBytesAndRejectsRedirects(t *testing.T) {
	client := New("private-test-key", "test-video-model")
	media := []aiprovider.MediaPart{{Label: "actual output", MIME: "video/mp4", Data: []byte("video-bytes")}, {Label: "full output audio", MIME: "audio/mpeg", Data: []byte("audio-bytes")}}
	client.HTTP = &http.Client{Transport: transportFunc(func(r *http.Request) (*http.Response, error) {
		if r.Header.Get("x-goog-api-key") != "private-test-key" {
			t.Fatal("missing authentication")
		}
		var payload map[string]any
		if json.NewDecoder(r.Body).Decode(&payload) != nil {
			t.Fatal("invalid JSON")
		}
		parts := payload["contents"].([]any)[0].(map[string]any)["parts"].([]any)
		if len(parts) != 5 {
			t.Fatal("media parts missing", parts)
		}
		for i, item := range media {
			inline := parts[2+i*2].(map[string]any)["inlineData"].(map[string]any)
			if inline["mimeType"] != item.MIME || inline["data"] != base64.StdEncoding.EncodeToString(item.Data) {
				t.Fatal("media bytes changed")
			}
		}
		return response(200, `{"candidates":[{"content":{"parts":[{"thought":true,"text":"hidden"},{"text":"{\"complete\":true}"}]}}]}`), nil
	})}
	got, err := client.ReviewMedia(context.Background(), "review actual media", media)
	if err != nil || got != `{"complete":true}` {
		t.Fatalf("%q %v", got, err)
	}
	calls := 0
	client.HTTP.Transport = transportFunc(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.URL.Host != "generativelanguage.googleapis.com" {
			t.Fatal("credentials or media forwarded")
		}
		result := response(302, "")
		result.Header.Set("Location", "https://untrusted.invalid")
		return result, nil
	})
	if _, err = client.ReviewMedia(context.Background(), "review", media); err == nil || calls != 1 || strings.Contains(err.Error(), "private-test-key") {
		t.Fatal("unsafe redirect", err, calls)
	}
}

func TestReviewMediaRejectsOversizeBeforeNetwork(t *testing.T) {
	client := New("private-test-key", "")
	client.HTTP = &http.Client{Transport: transportFunc(func(*http.Request) (*http.Response, error) { t.Fatal("oversized request sent"); return nil, nil })}
	if _, err := client.ReviewMedia(context.Background(), "review", []aiprovider.MediaPart{{MIME: "video/mp4", Data: make([]byte, aiprovider.MaxReviewBytes+1)}}); err == nil {
		t.Fatal("unbounded media accepted")
	}
}
