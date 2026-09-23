package openrouter

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/aiprovider"
)

func TestReviewMediaUsesConfiguredModelWithActualModalities(t *testing.T) {
	client := New("private-test-key", "google/gemini-existing", "")
	client.HTTP = &http.Client{Transport: transportFunc(func(r *http.Request) (*http.Response, error) {
		var payload map[string]any
		if json.NewDecoder(r.Body).Decode(&payload) != nil {
			t.Fatal("invalid JSON")
		}
		if payload["model"] != "google/gemini-existing" || payload["provider"].(map[string]any)["data_collection"] != "deny" {
			t.Fatal("provider/model policy changed")
		}
		parts := payload["messages"].([]any)[0].(map[string]any)["content"].([]any)
		if len(parts) != 7 || parts[2].(map[string]any)["type"] != "video_url" || parts[4].(map[string]any)["type"] != "input_audio" || parts[6].(map[string]any)["type"] != "image_url" {
			t.Fatal("wrong media request", parts)
		}
		url := parts[2].(map[string]any)["video_url"].(map[string]any)["url"].(string)
		if !strings.HasPrefix(url, "data:video/mp4;base64,") {
			t.Fatal("private source URL disclosed")
		}
		return response(200, `{"choices":[{"message":{"content":"{\"complete\":true}"}}]}`), nil
	})}
	parts := []aiprovider.MediaPart{{MIME: "video/mp4", Data: []byte("video")}, {MIME: "audio/mpeg", Data: []byte("audio")}, {MIME: "image/jpeg", Data: []byte("image")}}
	if got, err := client.ReviewMedia(context.Background(), "review", parts); err != nil || got != `{"complete":true}` {
		t.Fatalf("%q %v", got, err)
	}
	client.HTTP.Transport = transportFunc(func(*http.Request) (*http.Response, error) {
		return response(400, `{"error":"private-test-key model cannot hear audio"}`), nil
	})
	if _, err := client.ReviewMedia(context.Background(), "review", parts); err == nil || strings.Contains(err.Error(), "private-test-key") {
		t.Fatal("unsupported provider accepted or error leaked", err)
	}
}
