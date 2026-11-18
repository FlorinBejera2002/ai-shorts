package openrouter

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/aiprovider"
)

type transportFunc func(*http.Request) (*http.Response, error)

func (f transportFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func response(status int, body string) *http.Response {
	return &http.Response{StatusCode: status, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(body))}
}

func TestGenerateUsesOpenRouterContract(t *testing.T) {
	c := New("provider-test-secret", "anthropic/claude-test", "https://sneepcut.example")
	c.HTTP = &http.Client{Transport: transportFunc(func(r *http.Request) (*http.Response, error) {
		if r.Method != http.MethodPost || r.URL.String() != "https://openrouter.ai/api/v1/chat/completions" {
			t.Fatal("invalid request", r.Method, r.URL)
		}
		if r.Header.Get("Authorization") != "Bearer provider-test-secret" || r.Header.Get("HTTP-Referer") != "https://sneepcut.example" || r.Header.Get("X-Title") != "Sneepcut" {
			t.Fatal("invalid OpenRouter headers")
		}
		var input map[string]any
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
			t.Fatal(err)
		}
		if input["model"] != "anthropic/claude-test" {
			t.Fatal("model changed", input["model"])
		}
		if input["max_tokens"] != float64(maxOutputTokens) {
			t.Fatal("output budget omitted; provider may reserve its full model window")
		}
		messages := input["messages"].([]any)
		if messages[0].(map[string]any)["content"] != "Synthetic prompt" {
			t.Fatal("prompt changed")
		}
		return response(200, `{"choices":[{"message":{"content":"{\"ok\":true}"}}]}`), nil
	})}
	got, err := c.Generate(context.Background(), "Synthetic prompt")
	if err != nil || got != `{"ok":true}` {
		t.Fatalf("result %q %v", got, err)
	}
}

func TestGenerateClassifiesHTTPFailuresWithoutLeakingBodies(t *testing.T) {
	for _, status := range []int{400, 401, 402, 403, 404, 408, 429, 500, 502, 503} {
		c := New("private-key", "test/model", "")
		calls := 0
		c.HTTP = &http.Client{Transport: transportFunc(func(*http.Request) (*http.Response, error) {
			calls++
			return response(status, `{"error":{"message":"private-key secret source and account URL"}}`), nil
		})}
		_, err := c.Generate(context.Background(), "private source prompt")
		var request *aiprovider.RequestError
		if !errors.As(err, &request) || request.StatusCode != status || calls != 1 || strings.Contains(err.Error(), "private") {
			t.Fatalf("status=%d calls=%d unsafe/unclassified error=%v", status, calls, err)
		}
	}
}

func TestGenerateIdentifiesExhaustedKey403(t *testing.T) {
	c := New("private-key", "test/model", "")
	c.HTTP = &http.Client{Transport: transportFunc(func(*http.Request) (*http.Response, error) {
		return response(403, `{"error":{"message":"private key account details","metadata":{"limit_source":"openrouter_key_limit"}}}`), nil
	})}
	_, err := c.Generate(context.Background(), "private source prompt")
	var request *aiprovider.RequestError
	if !errors.As(err, &request) || request.StatusCode != 403 || request.LimitSource != "openrouter_key_limit" || !strings.Contains(err.Error(), "spending limit") {
		t.Fatalf("exhausted key misreported: %v", err)
	}
}

func TestGenerateRejectsTruncatedJSONBeforeItCanBecomeAPlan(t *testing.T) {
	c := New("private-key", "test/model", "")
	c.HTTP = &http.Client{Transport: transportFunc(func(*http.Request) (*http.Response, error) {
		return response(200, `{"choices":[{"finish_reason":"length","message":{"content":"{\"blocks\":[]}"}}]}`), nil
	})}
	got, err := c.Generate(context.Background(), "prompt")
	if got != "" || !errors.Is(err, aiprovider.ErrOutputLimit) {
		t.Fatalf("truncated generation accepted: %q %v", got, err)
	}
}

func TestGenerateRedactsTransportErrorAndPreservesCancellation(t *testing.T) {
	c := New("private-key", "test/model", "")
	c.HTTP = &http.Client{Transport: transportFunc(func(*http.Request) (*http.Response, error) {
		return nil, errors.New("private-key sensitive upstream URL")
	})}
	_, err := c.Generate(context.Background(), "prompt")
	if !errors.Is(err, aiprovider.ErrUnavailable) || !aiprovider.RetryableRequest(err) || strings.Contains(err.Error(), "private") {
		t.Fatalf("transport failure unsafe or unclassified: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err = c.Generate(ctx, "prompt")
	if !errors.Is(err, context.Canceled) || aiprovider.RetryableRequest(err) {
		t.Fatalf("cancellation should not retry: %v", err)
	}
}

func TestProviderFailuresAreBoundedAndRedacted(t *testing.T) {
	for _, test := range []struct {
		name, body string
		status     int
	}{
		{name: "status", body: `{"error":"provider-test-secret upstream diagnostics"}`, status: 429},
		{name: "malformed", body: "broken", status: 200},
		{name: "no choices", body: `{"choices":[]}`, status: 200},
		{name: "empty content", body: `{"choices":[{"message":{"content":""}}]}`, status: 200},
		{name: "oversized", body: strings.Repeat("x", 2*1024*1024+1), status: 200},
	} {
		t.Run(test.name, func(t *testing.T) {
			c := New("provider-test-secret", "test/model", "")
			c.HTTP = &http.Client{Transport: transportFunc(func(*http.Request) (*http.Response, error) {
				return response(test.status, test.body), nil
			})}
			got, err := c.Generate(context.Background(), "prompt")
			if err == nil || got != "" || strings.Contains(err.Error(), "provider-test-secret") {
				t.Fatalf("unsafe failure %q %v", got, err)
			}
		})
	}
	c := New("", "", "")
	c.HTTP = &http.Client{Transport: transportFunc(func(*http.Request) (*http.Response, error) {
		t.Fatal("called unconfigured provider")
		return nil, nil
	})}
	if _, err := c.Generate(context.Background(), "prompt"); !errors.Is(err, aiprovider.ErrNotConfigured) {
		t.Fatal(err)
	}
}

func TestProviderRedirectCannotExfiltrateCredentials(t *testing.T) {
	c := New("provider-test-secret", "test/model", "")
	calls := 0
	c.HTTP = &http.Client{Transport: transportFunc(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.URL.Host != "openrouter.ai" {
			t.Fatal("credential forwarded to redirect target")
		}
		result := response(302, "")
		result.Header.Set("Location", "https://evil.invalid/collect")
		return result, nil
	})}
	if _, err := c.Generate(context.Background(), "prompt"); err == nil || calls != 1 {
		t.Fatalf("redirect followed %d %v", calls, err)
	}
}
