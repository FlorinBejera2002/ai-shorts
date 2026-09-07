package scripts

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

func TestNormalizeAndPromptsMatchPythonFixtures(t *testing.T) {
	var fixture struct {
		Cases []struct {
			Input    map[string]any `json:"input"`
			Expected map[string]any `json:"expected"`
		} `json:"cases"`
		Prompts []struct {
			Input    Request `json:"input"`
			Expected string  `json:"expected"`
		} `json:"prompts"`
	}
	raw, e := os.ReadFile("testdata/python-contracts.json")
	if e != nil {
		t.Fatal(e)
	}
	if e = json.Unmarshal(raw, &fixture); e != nil {
		t.Fatal(e)
	}
	for i, tc := range fixture.Cases {
		result := Normalize(tc.Input)
		encoded, e := json.Marshal(result)
		if e != nil {
			t.Fatalf("case %d invalid response JSON: %v", i, e)
		}
		var decoded map[string]any
		_ = json.Unmarshal(encoded, &decoded)
		if !reflect.DeepEqual(decoded, tc.Expected) {
			t.Errorf("case %d differs from Python\nwant: %+v\ngot: %+v", i, tc.Expected, decoded)
		}
	}
	for i, tc := range fixture.Prompts {
		if got := BuildPrompt(tc.Input); got != tc.Expected {
			t.Errorf("prompt %d differs from Python", i)
		}
	}
}
