package story

import (
	"context"
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func TestBlockingFindingsMatchOneToOneByEvidenceAndLocation(t *testing.T) {
	original := Issue{Type: "caption_text", Severity: "major", BlockID: "block-a", SourceIDs: []string{"source-a"}, Start: 1, End: 2, Evidence: `Caption says "Nadia Comuneci" instead of "Nadia Comăneci".`}
	paraphrase := original
	paraphrase.ID = "different-model-id"
	paraphrase.Evidence = `The spoken name is “Nadia Comăneci”; the subtitle incorrectly displays “Nadia Comuneci”.`
	if introducesBlockingRegression(Report{Issues: []Issue{original}}, Report{Issues: []Issue{paraphrase}}) {
		t.Fatal("equivalent quoted evidence was rejected because of paraphrasing")
	}
	for _, test := range []struct {
		name   string
		change func(*Issue)
	}{
		{"different wrong word", func(i *Issue) { i.Evidence = `Caption says "Black Stea" instead of "Vlad Țepeș".` }},
		{"different original source", func(i *Issue) { i.SourceIDs = []string{"source-b"} }},
		{"different source interval", func(i *Issue) { i.Start = 4; i.End = 5 }},
		{"increased severity", func(i *Issue) { i.Severity = "critical" }},
	} {
		t.Run(test.name, func(t *testing.T) {
			changed := original
			test.change(&changed)
			if !introducesBlockingRegression(Report{Issues: []Issue{original}}, Report{Issues: []Issue{changed}}) {
				t.Fatal("new blocking defect collided with old finding")
			}
		})
	}
	if !introducesBlockingRegression(Report{Issues: []Issue{original}}, Report{Issues: []Issue{paraphrase, paraphrase}}) {
		t.Fatal("one old finding matched multiple new findings")
	}
	if !comparableEvidence("The final phoneme is clipped in the output.", "Rendered output cuts the final phoneme.") {
		t.Fatal("stable unquoted evidence was rejected because of ordinary paraphrasing")
	}
	if comparableEvidence("The crop cuts off the left hand.", "The crop cuts off the product.") {
		t.Fatal("shared generic terms concealed a different damaged subject")
	}
}

func TestFindingIdentityUsesBlockLocalTimeAfterReflow(t *testing.T) {
	before := Issue{Type: "audio_cut", Severity: "major", BlockID: "tail", Start: 5.2, End: 5.8, Evidence: "The final phoneme is clipped."}
	after := before
	after.Start = 8.2
	after.End = 8.8
	after.Evidence = "The final phoneme is truncated."
	oldTimeline := []Entry{{BlockID: "tail", OutputIn: 5, OutputOut: 7}}
	newTimeline := []Entry{{BlockID: "tail", OutputIn: 8, OutputOut: 10}}
	if introducesBlockingRegression(Report{Issues: []Issue{before}}, Report{Issues: []Issue{after}}, oldTimeline, newTimeline) {
		t.Fatal("downstream reflow masqueraded as a new source defect")
	}
	first := Issue{Type: "crop", Severity: "major", BlockID: "first", Evidence: "The product label is missing."}
	beforeReport := readyReport(1)
	beforeReport.Issues = []Issue{first, before}
	afterReport := readyReport(2)
	afterReport.Issues = []Issue{after}
	if !repairImproves(beforeReport, afterReport, first, oldTimeline, newTimeline) {
		t.Fatal("resolving one issue without changing another should improve")
	}
	if repairImproves(beforeReport, afterReport, before, oldTimeline, newTimeline) {
		t.Fatal("target persistence was hidden by paraphrasing or reflow")
	}
}

func TestCaptionLexicalErrorsAndUnchangedTimingNeverTriggerRenders(t *testing.T) {
	for _, kind := range []string{"captions", "caption_text", "transcription", "caption_timing"} {
		t.Run(kind, func(t *testing.T) {
			req := fixtureRequest()
			base := fixtureBase(t, req)
			req.Base = &base
			req.Action = "resume"
			req.VersionStart = 2
			report := readyReport(2)
			report.Issues = []Issue{{ID: "word-error", Type: kind, Severity: "critical", BlockID: "block-a", Start: 0, End: 3, SourceIDs: []string{"source-a"}, Evidence: `Caption contains "Nadia Comuneci" instead of the actual spoken name.`, Operation: "retime_captions", Confidence: 1}}
			media := &fakeMedia{reports: []Report{report}}
			ai := &fakeGenerator{}
			checkpoint := &memoryCheckpoints{}
			result, err := New(media, ai, DefaultLimits()).Run(context.Background(), req, checkpoint)
			if err != nil {
				t.Fatal(err)
			}
			if len(media.renders) != 1 || media.reviews != 1 || ai.calls != 1 || len(result.Attempts) != 0 || len(checkpoint.attempts) != 0 {
				t.Fatalf("an inapplicable operation spent repair/render budget: renders=%d reviews=%d ai=%d attempts=%+v", len(media.renders), media.reviews, ai.calls, result.Attempts)
			}
			if result.Best.Report.Status != "needs_review" || result.Best.Report.Issues[0].Resolved || result.Best.Report.Issues[0].RepairNote == "" {
				t.Fatalf("lexical defect concealed instead of remaining actionable: %+v", result.Best.Report)
			}
			if checkpoint.versions[len(checkpoint.versions)-1].Report.Issues[0].RepairNote == "" {
				t.Fatal("skipped repair explanation was not checkpointed")
			}
		})
	}
}

func TestCaptionRepairCanOnlyRestoreSourceWordClocks(t *testing.T) {
	req := fixtureRequest()
	base := fixtureBase(t, req)
	base.Timeline[0].Words[0].Start += .1
	base.Report.Issues = []Issue{{ID: "timing", Type: "caption_timing", Severity: "major", BlockID: "block-a", Evidence: "Caption lags the spoken word.", Operation: "retime_captions"}}
	state := runState{builder: New(&fakeMedia{}, &fakeGenerator{}, DefaultLimits()), req: req, tried: make(map[string]bool), next: 2}
	candidate, _, op, ok := state.nextRepair(base)
	if !ok || op.name != "retime_captions" {
		t.Fatal("stale source-derived caption clock could not be repaired")
	}
	expected, err := BuildTimeline(base.Plan, req.Assets)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(candidate.Timeline, expected) || candidate.Timeline[0].Words[0].Text != base.Timeline[0].Words[0].Text {
		t.Fatal("retime changed source words or failed to restore exact source clock")
	}
	base.Report.Issues[0].Type = "caption_text"
	if _, ok := operationFor(base.Report.Issues[0], base.Plan, req.Assets, map[string]bool{}, 2); ok {
		t.Fatal("lexical correction was accepted as timing repair")
	}
}

func TestUnchangedTransitionRepairDoesNotAllocateAttemptVersion(t *testing.T) {
	req := fixtureRequest()
	base := fixtureBase(t, req)
	base.Timeline[0].Transition = "cut"
	base.Report.Issues = []Issue{{Type: "transition", Severity: "major", BlockID: "block-a", Operation: "remove_transition", Evidence: "There is a visible jump."}}
	state := runState{builder: New(&fakeMedia{}, &fakeGenerator{}, DefaultLimits()), req: req, tried: make(map[string]bool), next: 2}
	if _, _, _, ok := state.nextRepair(base); ok || state.next != 2 {
		t.Fatal("identical EDL reserved an expensive intervention")
	}
}

func TestCaptionRetimeCannotChangeTextSourcesOrDisabledCaptions(t *testing.T) {
	for _, test := range []struct {
		name   string
		change func(*Request, *Version)
	}{
		{"disabled captions", func(req *Request, base *Version) { req.Options.Captions = false; base.Timeline[0].Words[0].Start += .1 }},
		{"different text", func(_ *Request, base *Version) { base.Timeline[0].Words[0].Text = "Invented" }},
		{"different source edit", func(_ *Request, base *Version) { base.Timeline[0].Video.In = .8 }},
	} {
		t.Run(test.name, func(t *testing.T) {
			req := fixtureRequest()
			base := fixtureBase(t, req)
			test.change(&req, &base)
			base.Report.Issues = []Issue{{ID: "timing", Type: "caption_timing", Severity: "major", BlockID: "block-a", Operation: "retime_captions"}}
			state := runState{builder: New(&fakeMedia{}, &fakeGenerator{}, DefaultLimits()), req: req, tried: make(map[string]bool), next: 2}
			if _, _, _, ok := state.nextRepair(base); ok || state.next != 2 {
				t.Fatal("retime operation changed text, source edits, or disabled captions")
			}
		})
	}
}

func TestSemanticReviewDerivesKnownBlockTimeAndReportsInvalidField(t *testing.T) {
	req := fixtureRequest()
	version := fixtureBase(t, req)
	issue := Issue{Type: "context", Severity: "major", BlockID: "block-b", SourceIDs: []string{"source-a"}, Start: 100, End: 104, Evidence: "The preceding source qualifier is required.", Confidence: .9}
	raw, _ := json.Marshal(semanticReview{Complete: true, Issues: []Issue{issue}})
	ai := &fakeGenerator{responses: []string{string(raw)}}
	report := New(&fakeMedia{}, ai, DefaultLimits()).preReview(context.Background(), req, version, &runBudget{max: 12})
	if !report.Coverage.Semantics || len(report.Issues) != 1 || report.Issues[0].Start != 3 || report.Issues[0].End != 7 {
		t.Fatalf("semantic source interval was confused with output time: %+v", report)
	}
	if !strings.Contains(ai.prompts[0], `"timeline"`) || !strings.Contains(ai.prompts[0], `"output_in":3`) || strings.Contains(ai.prompts[0], `"words"`) {
		t.Fatal("compact semantic review payload lost timeline clocks or reintroduced word arrays")
	}
	issue.BlockID = "hallucinated-block"
	raw, _ = json.Marshal(semanticReview{Complete: true, Issues: []Issue{issue}})
	ai.responses = []string{string(raw)}
	report = New(&fakeMedia{}, ai, DefaultLimits()).preReview(context.Background(), req, version, &runBudget{max: 12})
	if report.Coverage.Semantics || !strings.Contains(strings.Join(report.Coverage.Incomplete, " "), `issues[0].block_id "hallucinated-block"`) {
		t.Fatalf("invalid evidence diagnostic omitted the actual field: %+v", report)
	}
	issue.BlockID = "block-b"
	if err := validateReviewIssues([]Issue{issue}, req, version); err == nil || !strings.Contains(err.Error(), "outside output clock") {
		t.Fatalf("actual-media review source-clock interval must still be rejected: %v", err)
	}
}
