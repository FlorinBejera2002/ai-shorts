package scripts

import (
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/gemini"
)

type generatorFunc func(context.Context, string) (string, error)

func (f generatorFunc) Generate(ctx context.Context, prompt string) (string, error) {
	return f(ctx, prompt)
}
func TestGenerateKeepsScriptEnvelopeDefaultsAndZeroCredits(t *testing.T) {
	h := New(nil, generatorFunc(func(ctx context.Context, prompt string) (string, error) {
		for _, text := range []string{"30-second TikTok", "general audience", "Language for ALL text output: English", "Visual style: talking_head"} {
			if !strings.Contains(prompt, text) {
				t.Fatalf("missing default %q", text)
			}
		}
		return "```json\n{\"title\":\"Script\",\"scenes\":[{\"duration_seconds\":8,\"camera_movement\":\"Filmare din mână\"}]}\n```", nil
	}))
	r := httptest.NewRequest("POST", "/api/scripts/generate", strings.NewReader(`{"topic":"Interesting story"}`))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.generate(w, r)
	if w.Code != 200 {
		t.Fatalf("%d %s", w.Code, w.Body.String())
	}
	var body map[string]any
	if e := json.Unmarshal(w.Body.Bytes(), &body); e != nil {
		t.Fatal(e)
	}
	script := body["script"].(map[string]any)
	if body["credits_charged"] != float64(0) || script["total_duration_seconds"] != float64(8) {
		t.Fatal(body)
	}
	scene := script["scenes"].([]any)[0].(map[string]any)
	if scene["camera_movement_type"] != "handheld" || scene["camera_movement_direction"] != "none" {
		t.Fatal(scene)
	}
}
func TestGenerateValidationAndProviderFailure(t *testing.T) {
	for _, tc := range []struct {
		input  string
		status int
	}{{`{"topic":"hi"}`, 422}, {`{"topic":"good topic","duration":14}`, 422}, {`{"topic":"good topic","duration":181}`, 422}, {`{"topic":"good topic","user_id":"foreign"}`, 400}, {`{"topic":"` + strings.Repeat("x", 17000) + `"}`, 413}} {
		h := New(nil, generatorFunc(func(context.Context, string) (string, error) {
			t.Fatal("provider called for invalid input")
			return "", nil
		}))
		r := httptest.NewRequest("POST", "/api/scripts/generate", strings.NewReader(tc.input))
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		h.generate(w, r)
		if w.Code != tc.status {
			t.Fatalf("validation got %d want %d", w.Code, tc.status)
		}
	}
	for _, tc := range []struct {
		raw    string
		err    error
		status int
	}{{"", gemini.ErrNotConfigured, 503}, {"", errors.New("sensitive upstream failure"), 502}, {`[{"title":"nested"}]`, nil, 502}, {"plain prose", nil, 502}} {
		h := New(nil, generatorFunc(func(context.Context, string) (string, error) { return tc.raw, tc.err }))
		r := httptest.NewRequest("POST", "/api/scripts/generate", strings.NewReader(`{"topic":"Good topic"}`))
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		h.generate(w, r)
		if w.Code != tc.status || strings.Contains(w.Body.String(), "sensitive") {
			t.Fatalf("provider error %d %s", w.Code, w.Body.String())
		}
	}
}
