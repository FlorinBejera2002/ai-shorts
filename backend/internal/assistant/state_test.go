package assistant

import (
	"context"
	"encoding/json"
	"math"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestStateDefaultsAndNestedAllowlistsMatchPythonModels(t *testing.T) {
	create, ok := normalizeCreateState(map[string]any{"subtitle_style": "bold", "user_id": "untrusted", "plan": "agency"})
	if !ok || len(create) != 7 || create["clips"] != 5 || create["smart_crop"] != true || create["subtitle_style"] != "bold" || create["language"] != nil {
		t.Fatal(create)
	}
	editor, ok := normalizeEditorState(map[string]any{"video_duration": "12.5", "segments": []any{map[string]any{"start": "0", "end": 3.0, "private": "discard"}}})
	if !ok || editor["video_duration"] != 12.5 || editor["current_time"] != 0.0 {
		t.Fatal(editor)
	}
	encoded, _ := json.Marshal(editor)
	if strings.Contains(string(encoded), "private") {
		t.Fatal("unknown state reached provider")
	}
	if state, ok := normalizeCreateState(nil); !ok || state != nil {
		t.Fatal("absent state gained defaults")
	}
}
func TestInvalidStateStopsBeforeDatabaseOrProvider(t *testing.T) {
	for _, payload := range []string{
		`{"context":"create","message":"hello","create_state":{"clips":16}}`,
		`{"context":"create","message":"hello","create_state":{"clips":1.5}}`,
		`{"context":"create","message":"hello","create_state":{"include_brand":"true"}}`,
		`{"context":"create","message":"hello","editor_state":{"current_time":-1}}`,
		`{"context":"create","message":"hello","editor_state":{"segments":[{"start":-1,"end":2}]}}`,
		`{"context":"create","message":"hello","editor_state":{"segments":[{"start":0,"end":0}]}}`,
		`{"context":"create","message":"hello","editor_state":{"segments":null}}`,
	} {
		h := New(nil, nil, generatorFunc(func(context.Context, string) (string, error) {
			t.Fatal("invalid state reached provider")
			return "", nil
		}))
		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "/api/assistant/chat", strings.NewReader(payload))
		r.Header.Set("Content-Type", "application/json")
		h.chat(w, r)
		if w.Code != 422 {
			t.Fatalf("invalid state status %d: %s", w.Code, w.Body.String())
		}
	}
	for _, value := range []any{math.Inf(1), math.NaN(), "NaN", "Infinity"} {
		if _, ok := normalizeEditorState(map[string]any{"video_duration": value}); ok {
			t.Fatal("nonfinite state accepted")
		}
	}
}
