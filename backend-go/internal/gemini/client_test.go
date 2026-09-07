package gemini

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
)

type transportFunc func(*http.Request) (*http.Response, error)

func (f transportFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func response(status int, body string) *http.Response {
	return &http.Response{StatusCode: status, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(body))}
}
func TestGenerateUsesProviderContractAndExcludesThoughtParts(t *testing.T) {
	c := New("provider-test-secret", "custom-model")
	c.HTTP = &http.Client{Transport: transportFunc(func(r *http.Request) (*http.Response, error) {
		if r.Method != "POST" || r.URL.String() != "https://generativelanguage.googleapis.com/v1beta/models/custom-model:generateContent" || r.Header.Get("x-goog-api-key") != "provider-test-secret" || strings.Contains(r.URL.String(), "provider-test-secret") {
			t.Fatal("invalid request", r.URL)
		}
		var input map[string]any
		if e := json.NewDecoder(r.Body).Decode(&input); e != nil {
			t.Fatal(e)
		}
		if input["generationConfig"].(map[string]any)["responseMimeType"] != "application/json" {
			t.Fatal("missing JSON response contract")
		}
		contents := input["contents"].([]any)
		part := contents[0].(map[string]any)["parts"].([]any)[0].(map[string]any)
		if part["text"] != "Synthetic prompt" {
			t.Fatal("prompt changed")
		}
		return response(200, `{"candidates":[{"content":{"parts":[{"thought":true,"text":"private reasoning"},{"text":"hello "},{"text":"world"}]}},{"content":{"parts":[{"text":"ignored candidate"}]}}]}`), nil
	})}
	got, e := c.Generate(context.Background(), "Synthetic prompt")
	if e != nil || got != "hello world" {
		t.Fatalf("result %q %v", got, e)
	}
}
func TestProviderFailuresAreBoundedAndRedacted(t *testing.T) {
	for _, tc := range []struct {
		name, body string
		status     int
	}{{"status", `{"error":"provider-test-secret upstream diagnostics"}`, 429}, {"malformed", "broken", 200}, {"trailing", `{"candidates":[]} trailing`, 200}, {"no-candidates", `{"candidates":[]}`, 200}, {"no-text", `{"candidates":[{"content":{"parts":[{"thought":true,"text":"hidden"}]}}]}`, 200}, {"oversized", `{"candidates":[{"content":{"parts":[{"text":"` + strings.Repeat("x", 2*1024*1024) + `"}]}}]}`, 200}} {
		t.Run(tc.name, func(t *testing.T) {
			c := New("provider-test-secret", "")
			c.HTTP = &http.Client{Transport: transportFunc(func(*http.Request) (*http.Response, error) { return response(tc.status, tc.body), nil })}
			got, e := c.Generate(context.Background(), "prompt")
			if e == nil || got != "" || strings.Contains(e.Error(), "provider-test-secret") {
				t.Fatalf("unsafe failure %q %v", got, e)
			}
		})
	}
	c := New("", "")
	c.HTTP = &http.Client{Transport: transportFunc(func(*http.Request) (*http.Response, error) { t.Fatal("called unconfigured provider"); return nil, nil })}
	if _, e := c.Generate(context.Background(), "prompt"); !errors.Is(e, ErrNotConfigured) {
		t.Fatal(e)
	}
	c = New("provider-test-secret", "")
	c.HTTP = &http.Client{Transport: transportFunc(func(*http.Request) (*http.Response, error) {
		return nil, errors.New("provider-test-secret connection error")
	})}
	if _, e := c.Generate(context.Background(), "prompt"); e == nil || strings.Contains(e.Error(), "provider-test-secret") {
		t.Fatal(e)
	}
}
func TestProviderRedirectCannotExfiltrateCredentials(t *testing.T) {
	c := New("provider-test-secret", "")
	calls := 0
	c.HTTP = &http.Client{Transport: transportFunc(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.URL.Host != "generativelanguage.googleapis.com" {
			t.Fatal("credential forwarded to redirect target")
		}
		result := response(302, "")
		result.Header.Set("Location", "https://evil.invalid/collect")
		return result, nil
	})}
	if _, e := c.Generate(context.Background(), "prompt"); e == nil || calls != 1 {
		t.Fatalf("redirect followed %d %v", calls, e)
	}
}
func TestProviderHonorsRequestCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	c := New("test", "")
	c.HTTP = &http.Client{Transport: transportFunc(func(r *http.Request) (*http.Response, error) { return nil, r.Context().Err() })}
	if _, e := c.Generate(ctx, "prompt"); e == nil {
		t.Fatal("cancelled provider call succeeded")
	}
}
func TestExtractJSONMatchesPythonObjectContract(t *testing.T) {
	for _, input := range []string{`{"title":"Example"}`, "```json\n{\"title\":\"Example\"}\n```", `Here is your script: {"title":"Example"} Done.`} {
		out, e := ExtractJSON(input)
		if e != nil || out["title"] != "Example" {
			t.Fatalf("%q %v", input, e)
		}
	}
	for _, input := range []string{"null", "[]", `[{"title":"nested object"}]`, `"text {object}"`, "true", "empty", `{"invalid":`} {
		if _, e := ExtractJSON(input); e == nil {
			t.Fatalf("accepted non-object %q", input)
		}
	}
}
