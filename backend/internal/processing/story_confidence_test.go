package processing

import (
	"testing"

	"sneepcut/backend-go/internal/story"
)

// Each -sow -ml 1 whisper segment carries one word; punctuation arrives as its
// own low-probability token. Mirrors the car-detailing clip that was withheld.
func TestStoryConfidenceIgnoresPunctuationAndWeakConnectives(t *testing.T) {
	words := []story.Word{{Text: "Și", Start: 1, End: 1.2}, {Text: "avem", Start: 1.2, End: 1.5}, {Text: "zgârieturi,", Start: 1.5, End: 2.2}, {Text: "pe", Start: 2.2, End: 2.4}, {Text: "ușă.", Start: 2.4, End: 2.8}}
	candidates := []story.Candidate{{ID: "car-s1", In: .9, Out: 3, Words: words}}
	raw := []byte(`{"transcription":[
		{"offsets":{"from":1000,"to":1200},"tokens":[{"text":" Și","p":0.26}]},
		{"offsets":{"from":1200,"to":1500},"tokens":[{"text":" avem","p":0.97}]},
		{"offsets":{"from":1500,"to":2200},"tokens":[{"text":" zgârieturi","p":0.91},{"text":",","p":0.46}]},
		{"offsets":{"from":2200,"to":2400},"tokens":[{"text":" pe","p":0.52}]},
		{"offsets":{"from":2400,"to":2800},"tokens":[{"text":" ușă","p":0.88},{"text":".","p":0.31},{"text":"[_EOT_]","p":0.01}]}]}`)
	storyTranscriptConfidence(raw, candidates)
	if candidates[0].Confidence != .88 {
		t.Fatalf("punctuation or a weak connective withheld a confident phrase: %v", candidates[0].Confidence)
	}
}

func TestStoryConfidenceStillWithholdsWeakMeaningfulWords(t *testing.T) {
	cases := map[string]string{
		"weak negation":               `[{"offsets":{"from":1000,"to":1300},"tokens":[{"text":" nu","p":0.31}]},{"offsets":{"from":1300,"to":1700},"tokens":[{"text":" costă","p":0.97}]}]`,
		"connective below floor":      `[{"offsets":{"from":1000,"to":1300},"tokens":[{"text":" și","p":0.12}]},{"offsets":{"from":1300,"to":1700},"tokens":[{"text":" costă","p":0.97}]}]`,
		"connective fragment of word": `[{"offsets":{"from":1000,"to":1700},"tokens":[{"text":" de","p":0.3},{"text":"geaba","p":0.97}]}]`,
	}
	for name, segments := range cases {
		t.Run(name, func(t *testing.T) {
			candidates := []story.Candidate{{ID: "c", In: .9, Out: 1.8, Words: []story.Word{{Text: "x", Start: 1, End: 1.7}}}}
			storyTranscriptConfidence([]byte(`{"transcription":`+segments+`}`), candidates)
			if candidates[0].Confidence >= storyMinimumLexicalProbability {
				t.Fatalf("unsafe word passed the confidence gate: %v", candidates[0].Confidence)
			}
		})
	}
}
