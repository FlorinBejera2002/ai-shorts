package openrouter

import (
	"context"
	"encoding/json"
	"errors"
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
		if payload["max_tokens"] != float64(maxOutputTokens) {
			t.Fatal("media output token reservation is not bounded")
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

func TestReviewMediaReportsCreditFailureAndRejectsTruncation(t *testing.T) {
	parts := []aiprovider.MediaPart{{MIME: "image/jpeg", Data: []byte("image")}}
	c := New("private-key", "test/model", "")
	c.HTTP = &http.Client{Transport: transportFunc(func(*http.Request) (*http.Response, error) {
		return response(402, `{"error":"private-key private account URL"}`), nil
	})}
	_, err := c.ReviewMedia(context.Background(), "review", parts)
	var request *aiprovider.RequestError
	if !errors.As(err, &request) || request.StatusCode != 402 || strings.Contains(err.Error(), "private") || aiprovider.RetryableRequest(err) {
		t.Fatalf("credit failure is unsafe or retryable: %v", err)
	}
	c.HTTP.Transport = transportFunc(func(*http.Request) (*http.Response, error) {
		return response(403, `{"error":{"message":"private account details","metadata":{"limit_source":"openrouter_key_limit"}}}`), nil
	})
	_, err = c.ReviewMedia(context.Background(), "review", parts)
	if !errors.As(err, &request) || request.LimitSource != "openrouter_key_limit" || aiprovider.RetryableRequest(err) {
		t.Fatalf("media budget403 misclassified: %v", err)
	}
	c.HTTP.Transport = transportFunc(func(*http.Request) (*http.Response, error) {
		return response(200, `{"choices":[{"finish_reason":"length","message":{"content":"{\"coverage\":{}}"}}]}`), nil
	})
	got, err := c.ReviewMedia(context.Background(), "review", parts)
	if got != "" || !errors.Is(err, aiprovider.ErrOutputLimit) {
		t.Fatalf("truncated review accepted: %q %v", got, err)
	}
}

func TestQwenOmniRejectsOversizedInlineMediaBeforeRequest(t *testing.T) {
	client := New("fixture", "qwen/qwen3.8-omni-flash", "")
	client.HTTP = &http.Client{Transport: transportFunc(func(*http.Request) (*http.Response, error) {
		t.Fatal("oversized media was sent")
		return nil, nil
	})}
	for _, mime := range []string{"video/mp4", "audio/mpeg"} {
		if _, err := client.ReviewMedia(context.Background(), "review", []aiprovider.MediaPart{{MIME: mime, Data: make([]byte, 7_500_000)}}); err == nil {
			t.Fatal("accepted inline file at or above encoded size limit")
		}
	}
}
