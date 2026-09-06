package assistant

import (
	"encoding/json"
	"math"
	"os"
	"reflect"
	"strings"
	"testing"
)

func TestActionsAndSystemPromptsMatchPythonFixtures(t *testing.T) {
	var fixture struct {
		Cases []struct {
			Context  string  `json:"context"`
			Duration float64 `json:"duration"`
			Input    []any   `json:"input"`
			Expected []any   `json:"expected"`
		} `json:"cases"`
		CreatePrompt string `json:"createPrompt"`
		EditorPrompt string `json:"editorPrompt"`
	}
	raw, e := os.ReadFile("testdata/python-contracts.json")
	if e != nil {
		t.Fatal(e)
	}
	if e = json.Unmarshal(raw, &fixture); e != nil {
		t.Fatal(e)
	}
	if createPrompt != fixture.CreatePrompt || editorPrompt != fixture.EditorPrompt {
		t.Error("system prompts differ from Python")
	}
	for i, tc := range fixture.Cases {
		actions := Actions(tc.Context, tc.Input, tc.Duration)
		encoded, e := json.Marshal(actions)
		if e != nil {
			t.Fatalf("case %d: %v", i, e)
		}
		var normalized []any
		_ = json.Unmarshal(encoded, &normalized)
		if !reflect.DeepEqual(normalized, tc.Expected) {
			t.Errorf("case %d: want %+v got %+v", i, tc.Expected, normalized)
		}
	}
}
func TestActionsRejectMalformedAndUnsafeProviderOutput(t *testing.T) {
	for _, segments := range []any{nil, []any{}, []any{"invalid"}, []any{map[string]any{"start": math.NaN(), "end": 5.0}}, []any{map[string]any{"start": 0.0, "end": "Infinity"}}, []any{map[string]any{"start": false, "end": 10.0}}, []any{map[string]any{"start": -1.0, "end": 5.0}}} {
		actions := Actions("editor", []any{map[string]any{"type": "apply_segments", "segments": segments}}, 0)
		if len(actions) != 0 {
			t.Fatalf("accepted segments %+v", segments)
		}
	}
	segments := []any{}
	for i := 0; i < 11; i++ {
		segments = append(segments, map[string]any{"start": float64(i * 2), "end": float64(i*2 + 1)})
	}
	if len(Actions("editor", []any{map[string]any{"type": "apply_segments", "segments": segments}}, 30)) != 0 {
		t.Fatal("accepted more than 10 segments")
	}
	for _, value := range []any{math.NaN(), math.Inf(1), "NaN", "Infinity", true, map[string]any{}} {
		if len(Actions("editor", []any{map[string]any{"type": "seek", "time": value}}, 100)) != 0 {
			t.Fatalf("accepted invalid seek %#v", value)
		}
	}
	create := Actions("create", []any{map[string]any{"type": "update_settings", "settings": map[string]any{"credits": 500.0, "plan": "agency", "clips": true, "include_brand": "true"}}, map[string]any{"type": "set_instructions", "instructions": strings.Repeat("ș", 4500)}}, 0)
	if len(create) != 1 || len([]rune(create[0]["instructions"].(string))) != 4000 {
		t.Fatal("create action allowlist or rune limit failed")
	}
}
