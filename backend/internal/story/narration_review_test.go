package story

import (
	"context"
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func paddedNarrationReviewFixture() (Request, Version) {
	req := narrationFixture()
	req.Assets[0].Duration = 8.158375
	req.Assets[0].Candidates = []Candidate{
		{ID: "voice-s1", SourceID: "voice", In: 0, Out: 3.72, Text: "First a young woman speaks to the camera.", Words: []Word{{"First", .11, .4}, {"a young woman", .4, 1.8}, {"speaks to the camera.", 1.8, 3.54}}},
		{ID: "voice-s2", SourceID: "voice", In: 3.53, Out: 8.158375, Text: "Then an older man in glasses appears during an interview.", Words: []Word{{"Then", 3.65, 4}, {"an older man in glasses", 4, 6}, {"appears during an interview.", 6, 8.04}}},
	}
	plan := Plan{Blocks: []Block{{ID: "young", CandidateID: "forest-scene", Crop: "fit", Narration: &Interval{"voice", 0, 3.54}, Visual: &Interval{"forest", 0, 3.54}}, {ID: "older", CandidateID: "river-scene", Crop: "fit", Narration: &Interval{"voice", 3.54, 8.158375}, Visual: &Interval{"river", 0, 8.158375 - 3.54}}}}
	timeline, _ := BuildNarrationTimeline(plan, req.Assets)
	return req, Version{Number: 1, Plan: plan, Timeline: timeline}
}

func TestNarrationReviewUsesWordClocksAndPreservedPauseSemantics(t *testing.T) {
	req, version := paddedNarrationReviewFixture()
	ai := &fakeGenerator{}
	state := runState{builder: New(&fakeMedia{}, ai, DefaultLimits()), req: req, budget: &runBudget{max: 12}}
	report := state.reviewNarrationPlan(context.Background(), version)
	if !report.Coverage.Semantics || len(report.Issues) != 0 || ai.calls != 1 {
		t.Fatalf("word-aligned visual boundary was rejected: %+v", report)
	}
	_, data, found := strings.Cut(ai.prompts[0], "DATA:\n")
	if !found {
		t.Fatal("missing review data")
	}
	var input struct {
		Words      []Word               `json:"narration_words"`
		Gaps       []Interval           `json:"narration_word_gaps"`
		Candidates []editorialCandidate `json:"candidates"`
		Timeline   []editorialEntry     `json:"timeline"`
	}
	if err := json.Unmarshal([]byte(data), &input); err != nil {
		t.Fatal(err)
	}
	wantWords, err := narrationWords(req.Assets[0])
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(input.Words, wantWords) || input.Words[2].End != 3.54 || input.Timeline[0].OutputOut != 3.54 {
		t.Fatal("ASR sentence padding replaced the actual last-word/visual boundary")
	}
	wantGaps := []Interval{{"voice", 0, .11}, {"voice", 3.54, 3.65}, {"voice", 8.04, 8.158375}}
	if !reflect.DeepEqual(input.Gaps, wantGaps) {
		t.Fatalf("original lead-in, pause or tail was misclassified: %+v", input.Gaps)
	}
	for _, candidate := range input.Candidates {
		if candidate.SourceID == "voice" {
			t.Fatal("padded narration candidate intervals leaked into visual timing evidence")
		}
	}
	for _, contract := range []string{"word intervals are authoritative", "NOT spoken-word boundaries", "not itself a continuity defect", "Genuine unsupported visual claims"} {
		if !strings.Contains(ai.prompts[0], contract) {
			t.Fatalf("review omitted clock/quality contract %q", contract)
		}
	}
}

func TestNarrationReviewStillRetainsGenuineVisualMismatch(t *testing.T) {
	req, version := paddedNarrationReviewFixture()
	issue := Issue{ID: "wrong-subject", Type: "visual_match", Severity: "major", BlockID: "young", SourceIDs: []string{"forest", "voice"}, Start: .11, End: 3.54, Evidence: "The narration describes a young woman, but the selected source evidence shows a vehicle throughout those spoken words.", Confidence: 1}
	raw, _ := json.Marshal(semanticReview{Complete: true, Issues: []Issue{issue}})
	state := runState{builder: New(&fakeMedia{}, &fakeGenerator{responses: []string{string(raw)}}, DefaultLimits()), req: req, budget: &runBudget{max: 12}}
	report := state.reviewNarrationPlan(context.Background(), version)
	if len(report.Issues) != 1 || report.Issues[0].Evidence != issue.Evidence || !hasBlocking(report.Issues) || report.Status != "needs_review" {
		t.Fatalf("clock clarification suppressed a real visual defect: %+v", report)
	}
}

func TestNarrationReviewDoesNotTruncateOversizedWordEvidence(t *testing.T) {
	req, version := paddedNarrationReviewFixture()
	req.Assets[0].Candidates[0].Words[0].Text = strings.Repeat("original-word ", maxEditorialJSONBytes/10)
	ai := &fakeGenerator{}
	state := runState{builder: New(&fakeMedia{}, ai, DefaultLimits()), req: req, budget: &runBudget{max: 12}}
	report := state.reviewNarrationPlan(context.Background(), version)
	if ai.calls != 0 || report.Coverage.Semantics || !strings.Contains(strings.Join(report.Coverage.Incomplete, " "), "no words were truncated") {
		t.Fatalf("word context guard silently truncated evidence or exceeded its budget: %+v", report)
	}
}
