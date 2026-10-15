package story

import (
	"context"
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func TestSemanticReviewSeesUncaptionedOriginalAudioWithoutWaivingFindings(t *testing.T) {
	req := Request{Options: Options{PreserveOriginalSpeech: true, CaptionMode: "all"}, Assets: []Asset{{
		ID: "voice", Duration: 5, HasAudio: true,
		VoiceIntervals:      []Interval{{SourceID: "voice", In: 1, Out: 2}},
		Candidates:          []Candidate{{ID: "uncaptioned", SourceID: "voice", In: 1, Out: 4, Role: "b_roll"}},
		TranscriptProposals: []TranscriptProposal{{ID: "uncertain", CandidateID: "uncaptioned", In: 3, Out: 4, TimingVerified: false, Words: []Word{{Text: "UNVERIFIED", Start: 3, End: 4}}}},
	}}}
	plan := Plan{Blocks: []Block{{ID: "block-voice", CandidateID: "uncaptioned", Crop: "fit"}}}
	timeline, err := BuildTimeline(plan, req.Assets)
	if err != nil {
		t.Fatal(err)
	}
	if len(timeline[0].Words) != 0 {
		t.Fatal("fixture unexpectedly contains verified captions")
	}
	judgment, _ := json.Marshal(semanticReview{Complete: true, Issues: []Issue{{Type: "meaning", Severity: "critical", BlockID: "block-voice", SourceIDs: []string{"voice"}, Evidence: "The source message contradicts the requested subject.", Confidence: 1, Resolved: true}}})
	ai := &fakeGenerator{responses: []string{string(judgment)}}
	report := New(&fakeMedia{}, ai, DefaultLimits()).preReview(context.Background(), req, Version{Number: 1, Plan: plan, Timeline: timeline}, &runBudget{max: 12})
	if ai.calls != 1 {
		t.Fatalf("semantic review did not receive the complete audio plan: %+v", report)
	}
	var payload struct {
		Coverage *originalSpeechReviewEvidence `json:"original_speech_coverage"`
	}
	_, data, found := strings.Cut(ai.prompts[0], "DATA:\n")
	if !found || json.Unmarshal([]byte(data), &payload) != nil || payload.Coverage == nil {
		t.Fatalf("semantic review lacks the explicit original audio evidence: %s", ai.prompts[0])
	}
	expectedRequired := []Interval{{SourceID: "voice", In: 1, Out: 2}, {SourceID: "voice", In: 3, Out: 4}}
	expectedAudio := []Interval{{SourceID: "voice", In: 1, Out: 4}}
	if !payload.Coverage.Complete || !reflect.DeepEqual(payload.Coverage.RequiredSourceIntervals, expectedRequired) || !reflect.DeepEqual(payload.Coverage.TimelineAudioIntervals, expectedAudio) {
		t.Fatalf("uncaptioned voice or uncertain timing envelope was confused with omitted audio: %+v", payload.Coverage)
	}
	if strings.Contains(data, "UNVERIFIED") {
		t.Fatal("interval evidence promoted unverified proposal text into semantic evidence")
	}
	if !hasCritical(report.Issues) || len(report.Issues) != 1 || report.Issues[0].Resolved {
		t.Fatalf("complete interval inclusion waived a real semantic finding: %+v", report)
	}
	// Even independently complete media coverage cannot clear a current critical
	// semantic finding simply because all source audio intervals are present.
	report.Coverage = readyReport(1).Coverage
	if reportStatus(report) != "needs_review" {
		t.Fatal("complete source intervals incorrectly certified the story")
	}
}

func TestOriginalSpeechReviewCoverageUsesAudioAndSharedSourceRequirements(t *testing.T) {
	req := Request{Options: Options{PreserveOriginalSpeech: true}, Assets: []Asset{{
		ID: "voice", Duration: 8, HasAudio: true,
		VoiceIntervals:      []Interval{{SourceID: "voice", In: 1, Out: 2}},
		Candidates:          []Candidate{{ID: "verified", SourceID: "voice", In: 3, Out: 4, Text: "Verified.", Words: []Word{{Text: "Verified.", Start: 3.1, End: 3.8}}}},
		TranscriptProposals: []TranscriptProposal{{ID: "proposal", In: 5, Out: 6, TimingVerified: false}},
	}}}
	timeline := []Entry{{Video: Interval{SourceID: "voice", In: 0, Out: 8}, Audio: &Interval{SourceID: "other", In: 0, Out: 8}}}
	evidence := originalSpeechReviewCoverage(req, timeline)
	expected := []Interval{{SourceID: "voice", In: 1, Out: 2}, {SourceID: "voice", In: 3, Out: 4}, {SourceID: "voice", In: 5, Out: 6}}
	if evidence.Complete || !reflect.DeepEqual(evidence.RequiredSourceIntervals, expected) || !reflect.DeepEqual(evidence.Issues, OriginalSpeechCoverage(req.Assets, timeline)) || len(evidence.Issues) != 3 {
		t.Fatalf("B-roll or partial evidence falsely certified original voice: %+v", evidence)
	}
	timeline[0].Audio = &Interval{SourceID: "voice", In: 0, Out: 8}
	if evidence = originalSpeechReviewCoverage(req, timeline); !evidence.Complete || len(evidence.Issues) != 0 {
		t.Fatalf("actual original audio coverage was not recognized: %+v", evidence)
	}
}

func TestSemanticReviewOmitsSpeechCoverageWithoutExplicitContract(t *testing.T) {
	req := fixtureRequest()
	req.Options.CaptionMode = "all"
	version := fixtureBase(t, req)
	ai := &fakeGenerator{}
	New(&fakeMedia{}, ai, DefaultLimits()).preReview(context.Background(), req, version, &runBudget{max: 12})
	if ai.calls != 1 {
		t.Fatal("semantic review did not run")
	}
	_, data, _ := strings.Cut(ai.prompts[0], "DATA:\n")
	var payload map[string]json.RawMessage
	if err := json.Unmarshal([]byte(data), &payload); err != nil {
		t.Fatal(err)
	}
	if _, exists := payload["original_speech_coverage"]; exists {
		t.Fatal("all-dialogue captions invented a preserve-all-original-audio contract")
	}
	req.Options.PreserveOriginalSpeech, req.Options.Narration = true, true
	if originalSpeechReviewCoverage(req, version.Timeline) != nil {
		t.Fatal("source audio contract was applied to the separate recorded narration workflow")
	}
}
