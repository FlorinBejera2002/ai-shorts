package story

import (
	"context"
	"math"
	"reflect"
	"strings"
	"testing"
)

func transcriptReviewFixture() Asset {
	a := Asset{ID: "source", Hash: strings.Repeat("a", 64), Duration: 8, HasAudio: true, Candidates: []Candidate{{ID: "source-s1", SourceID: "source", In: 1, Out: 7, Role: "b_roll"}}}
	p := TranscriptProposal{CandidateID: "source-s1", In: 1, Out: 7, Words: []Word{{Text: "Nu", Start: 1.2, End: 1.6}, {Text: "pleca.", Start: 2, End: 2.8}}, TimingVerified: true, Confidence: .5}
	p.ID = TranscriptProposalID(a, p)
	a.TranscriptProposals = []TranscriptProposal{p}
	return a
}

func TestTranscriptReviewBindsOwnerTextToMeasuredClockAndSurvivesRawRefresh(t *testing.T) {
	before := transcriptReviewFixture()
	a, err := ApproveTranscript(before, before.TranscriptProposals[0].ID, []string{"Nu", "uita."})
	if err != nil {
		t.Fatal(err)
	}
	if !a.TranscriptProposals[0].Reviewed || a.Candidates[0].Text != "Nu uita." || a.Candidates[0].Words[1].Start != 2 || a.Candidates[0].Words[1].End != 2.8 {
		t.Fatalf("review changed clocks or failed: %#v", a)
	}
	if before.TranscriptProposals[0].Reviewed || before.TranscriptProposals[0].Words[1].Text != "pleca." || len(before.Candidates[0].Words) != 0 {
		t.Fatal("review mutated immutable ASR suggestions")
	}
	raw := transcriptReviewFixture()
	raw.TranscriptReviews = a.TranscriptReviews
	reloaded := ApplyTranscriptReviews(raw)
	if !reflect.DeepEqual(reloaded.Candidates[0].Words, a.Candidates[0].Words) {
		t.Fatal("durable review lost on raw cache refresh")
	}
	raw.Hash = strings.Repeat("b", 64)
	if got := ApplyTranscriptReviews(raw); got.TranscriptProposals[0].Reviewed || len(got.Candidates[0].Words) > 0 {
		t.Fatal("review crossed source identity")
	}
	raw = transcriptReviewFixture()
	raw.TranscriptReviews = a.TranscriptReviews
	raw.TranscriptProposals[0].Words[1].Start = 2.1
	if got := ApplyTranscriptReviews(raw); got.TranscriptProposals[0].Reviewed || len(got.Candidates[0].Words) > 0 {
		t.Fatal("review crossed changed word timing")
	}
}

func TestDuplicateAnalysisCannotCopyDiscoveredTranscriptAuthority(t *testing.T) {
	analyzed := transcriptReviewFixture()
	analyzed.AnalysisVersion = "fresh-analysis"
	original := analyzed
	original.ID = "other"
	original.TranscriptProposals = nil
	original.TranscriptReviews = nil
	if _, ok := reuseDuplicateAnalysis(analyzed, original); ok {
		t.Fatal("first-run analysis copied a source-scoped review proposal to another upload")
	}
}

func TestTranscriptReviewRejectsUnverifiedAndForgedWordSlots(t *testing.T) {
	for _, change := range []func(*Asset){func(a *Asset) { a.TranscriptProposals[0].TimingVerified = false }, func(a *Asset) { a.TranscriptProposals[0].Words[1].Start = math.NaN() }, func(a *Asset) { a.TranscriptProposals[0].Words[1].End = 9 }, func(a *Asset) { a.TranscriptProposals[0].Words[1].Start = 1.3 }} {
		a := transcriptReviewFixture()
		change(&a)
		if _, err := ApproveTranscript(a, a.TranscriptProposals[0].ID, []string{"No", "change"}); err == nil {
			t.Fatal("invalid source clock accepted")
		}
	}
	for _, words := range [][]string{{"extra", "word", "slot"}, {"", "word"}, {strings.Repeat("a", 257), "word"}, {"line\nbreak", "word"}} {
		a := transcriptReviewFixture()
		if _, err := ApproveTranscript(a, a.TranscriptProposals[0].ID, words); err == nil {
			t.Fatalf("invalid review accepted: %q", words)
		}
	}
	a := transcriptReviewFixture()
	if _, err := ApproveTranscript(a, "stale", []string{"No", "change"}); err == nil {
		t.Fatal("stale proposal accepted")
	}
}

func TestReviewedCaptionsPreserveCutVideoAudioAndUnrelatedWords(t *testing.T) {
	a := transcriptReviewFixture()
	a, err := ApproveTranscript(a, a.TranscriptProposals[0].ID, []string{"Nu", "uita."})
	if err != nil {
		t.Fatal(err)
	}
	base := Version{Number: 4, Accepted: true, Timeline: []Entry{{BlockID: "one", CandidateID: "source-s1", OutputIn: 5, OutputOut: 8, Video: Interval{SourceID: "other-picture", In: 3, Out: 6}, Audio: &Interval{SourceID: "source", In: 1, Out: 4}, Crop: "fit", Words: []Word{{Text: "Wrong", Start: 5.2, End: 5.6}}}, {BlockID: "two", OutputIn: 8, OutputOut: 9, Video: Interval{SourceID: "other-picture", Out: 1}, Words: []Word{{Text: "Unchanged", Start: 8.2, End: 8.5}}}}}
	got, err := RebuildTranscriptCaptions(base, []Asset{a})
	if err != nil {
		t.Fatal(err)
	}
	if got.Parent != 4 || got.Number != 5 || got.Timeline[0].Video != base.Timeline[0].Video || *got.Timeline[0].Audio != *base.Timeline[0].Audio || got.Timeline[0].OutputIn != 5 || got.Timeline[0].OutputOut != 8 {
		t.Fatal("caption review changed selected source cuts")
	}
	if !reflect.DeepEqual(got.Timeline[0].Words, []Word{{Text: "Nu", Start: 5.2, End: 5.6}, {Text: "uita.", Start: 6, End: 6.8}}) || !reflect.DeepEqual(got.Timeline[1], base.Timeline[1]) {
		t.Fatalf("wrong caption projection: %#v", got.Timeline)
	}
	if base.Timeline[0].Words[0].Text != "Wrong" {
		t.Fatal("revision mutated accepted version")
	}
}

func TestTranscriptReviewBuilderRendersRevisionWithoutReplanningOrRetranscription(t *testing.T) {
	req := fixtureRequest()
	req.Options.Captions, req.Options.CaptionMode = true, "all"
	asset := req.Assets[0]
	candidate := asset.Candidates[0]
	proposal := TranscriptProposal{CandidateID: candidate.ID, In: candidate.In, Out: candidate.Out, Words: candidate.Words, TimingVerified: true}
	proposal.ID = TranscriptProposalID(asset, proposal)
	asset.TranscriptProposals = []TranscriptProposal{proposal}
	asset, err := ApproveTranscript(asset, proposal.ID, []string{"Use", "six", "grams."})
	if err != nil {
		t.Fatal(err)
	}
	req.Assets = []Asset{asset}
	req.Base = &Version{Number: 3, Accepted: true, Plan: Plan{Title: "Chosen cut", Blocks: []Block{{ID: "block", CandidateID: candidate.ID, Crop: "fit"}}}, Timeline: []Entry{{BlockID: "block", CandidateID: candidate.ID, OutputOut: 3, Video: Interval{SourceID: asset.ID, In: 1, Out: 4}, Audio: &Interval{SourceID: asset.ID, In: 1, Out: 4}, Crop: "fit"}}, Output: Output{Key: "previous.mp4", Duration: 3, Size: 100}, Report: readyReport(3)}
	req.Action, req.VersionStart = "review_transcript", 4
	media := &fakeMedia{}
	result, err := New(media, &fakeGenerator{}, DefaultLimits()).Run(context.Background(), req, &memoryCheckpoints{})
	if err != nil {
		t.Fatal(err)
	}
	if media.analyses != 0 || len(media.renders) != 1 || result.Best.Number != 4 || !result.Best.Accepted || result.Best.Timeline[0].Words[1].Text != "six" || result.Best.Timeline[0].Video != req.Base.Timeline[0].Video || !reflect.DeepEqual(result.Best.Plan.Blocks, req.Base.Plan.Blocks) {
		t.Fatalf("caption-only revision changed planning or failed: %+v", result)
	}
	req.Base.Plan.Blocks[0].LockText = true
	if err := ValidateEdit(req); err == nil {
		t.Fatal("review bypassed a text lock")
	}
}
