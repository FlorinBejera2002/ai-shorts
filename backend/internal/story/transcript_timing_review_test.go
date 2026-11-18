package story

import (
	"encoding/json"
	"math"
	"reflect"
	"strings"
	"testing"
)

func unverifiedTimingFixture() Asset {
	a := transcriptReviewFixture()
	p := &a.TranscriptProposals[0]
	p.TimingVerified = false
	p.Words[1].Start = p.Words[0].Start
	p.ID = TranscriptProposalID(a, *p)
	return a
}

func TestOwnerTimingReviewPersistsAcrossRawCacheAndSubsequentTextEdits(t *testing.T) {
	raw := unverifiedTimingFixture()
	words := []Word{{Text: " Ascultă ", Start: 1.1, End: 1.4}, {Text: "aici", Start: 1.5, End: 1.9}, {Text: "acum.", Start: 2.1, End: 2.9}}
	approved, err := ApproveTranscriptTiming(raw, raw.TranscriptProposals[0].ID, words, true)
	if err != nil {
		t.Fatal(err)
	}
	p := approved.TranscriptProposals[0]
	if !p.Reviewed || !p.TimingVerified || p.TimingSource != "owner" || p.ID == raw.TranscriptProposals[0].ID || p.Words[0].Text != "Ascultă" || len(approved.Candidates[0].Words) != 3 {
		t.Fatalf("owner correction not applied distinctly: %+v", p)
	}
	if raw.TranscriptProposals[0].TimingVerified || len(raw.TranscriptReviews) != 0 || len(raw.Candidates[0].Words) != 0 || words[0].Text != " Ascultă " {
		t.Fatal("approval mutated immutable source or caller words")
	}
	encoded, err := json.Marshal(approved)
	if err != nil {
		t.Fatal(err)
	}
	var persisted Asset
	if err = json.Unmarshal(encoded, &persisted); err != nil {
		t.Fatal(err)
	}
	if got := ApplyTranscriptReviews(persisted); !reflect.DeepEqual(got, persisted) {
		t.Fatal("applying a persisted correction is not idempotent")
	}
	refreshed := unverifiedTimingFixture()
	refreshed.TranscriptReviews = persisted.TranscriptReviews
	if got := ApplyTranscriptReviews(refreshed); !reflect.DeepEqual(got.Candidates[0].Words, persisted.Candidates[0].Words) || got.TranscriptProposals[0].ID != p.ID {
		t.Fatal("owner timing disappeared on raw ASR refresh")
	}
	edited, err := ApproveTranscript(persisted, p.ID, []string{"Ascultă", "bine", "acum."})
	if err != nil || !edited.TranscriptProposals[0].Reviewed || edited.TranscriptProposals[0].TimingSource != "owner" || edited.Candidates[0].Text != "Ascultă bine acum." || len(edited.TranscriptReviews) != 1 {
		t.Fatalf("ordinary text correction lost owner timing: %+v %v", edited, err)
	}
	refreshed.TranscriptReviews = edited.TranscriptReviews
	if got := ApplyTranscriptReviews(refreshed); got.Candidates[0].Text != "Ascultă bine acum." {
		t.Fatal("later text correction lost on cache refresh")
	}
	removed, err := ApproveTranscriptTiming(edited, edited.TranscriptProposals[0].ID, []Word{{Text: "Ascultă.", Start: 1.1, End: 1.4}}, true)
	if err != nil || len(removed.Candidates[0].Words) != 1 || len(removed.TranscriptReviews) != 1 {
		t.Fatalf("word removal failed: %+v %v", removed, err)
	}
}

func TestOwnerTimingRejectsUnconfirmedInvalidOrStaleEvidence(t *testing.T) {
	good := []Word{{Text: "Hello", Start: 1.2, End: 1.6}}
	for name, words := range map[string][]Word{
		"empty":          nil,
		"too many":       make([]Word, 501),
		"blank":          {{Text: " ", Start: 1.2, End: 1.6}},
		"control":        {{Text: "a\nb", Start: 1.2, End: 1.6}},
		"oversized text": {{Text: strings.Repeat("a", 257), Start: 1.2, End: 1.6}},
		"before passage": {{Text: "a", Start: .9, End: 1.6}},
		"after passage":  {{Text: "a", Start: 6, End: 7.1}},
		"zero":           {{Text: "a", Start: 1.2, End: 1.2}},
		"negative":       {{Text: "a", Start: -1, End: 1.2}},
		"nonfinite":      {{Text: "a", Start: math.NaN(), End: 1.6}},
		"infinite":       {{Text: "a", Start: 1.2, End: math.Inf(1)}},
		"overlap":        {{Text: "a", Start: 1.2, End: 1.6}, {Text: "b", Start: 1.5999, End: 2}},
	} {
		t.Run(name, func(t *testing.T) {
			a := unverifiedTimingFixture()
			if _, err := ApproveTranscriptTiming(a, a.TranscriptProposals[0].ID, words, true); err == nil {
				t.Fatal("invalid corrected timing accepted")
			}
		})
	}
	a := unverifiedTimingFixture()
	if _, err := ApproveTranscriptTiming(a, a.TranscriptProposals[0].ID, good, false); err == nil {
		t.Fatal("timing accepted without explicit confirmation")
	}
	if _, err := ApproveTranscriptTiming(a, "stale", good, true); err == nil {
		t.Fatal("stale proposal accepted")
	}
	approved, err := ApproveTranscriptTiming(a, a.TranscriptProposals[0].ID, good, true)
	if err != nil {
		t.Fatal(err)
	}
	for name, change := range map[string]func(*Asset){
		"source":    func(a *Asset) { a.Hash = strings.Repeat("b", 64) },
		"words":     func(a *Asset) { a.TranscriptProposals[0].Words[0].Text = "Changed" },
		"timing":    func(a *Asset) { a.TranscriptProposals[0].Words[0].Start += .1 },
		"candidate": func(a *Asset) { a.TranscriptProposals[0].CandidateID = "other" },
		"bounds":    func(a *Asset) { a.TranscriptProposals[0].Out -= .5 },
		"duration":  func(a *Asset) { a.Duration = 1 },
	} {
		t.Run(name, func(t *testing.T) {
			raw := unverifiedTimingFixture()
			raw.TranscriptReviews = approved.TranscriptReviews
			change(&raw)
			if got := ApplyTranscriptReviews(raw); got.TranscriptProposals[0].Reviewed || len(got.Candidates[0].Words) != 0 {
				t.Fatal("review crossed changed source evidence")
			}
		})
	}
	cloned := cloneAssets([]Asset{approved})[0]
	cloned.TranscriptReviews[0].TimingEvidence.Words[0].Text = "mutated clone"
	if approved.TranscriptReviews[0].TimingEvidence.Words[0].Text == "mutated clone" {
		t.Fatal("timing evidence was not deeply cloned")
	}
	for _, change := range []func(*Asset){
		func(a *Asset) { a.Hash = strings.Repeat("b", 64) },
		func(a *Asset) { a.TranscriptProposals[0].Words[0].Start += .1 },
		func(a *Asset) { a.TranscriptReviews = nil },
	} {
		checkpoint := cloneAssets([]Asset{approved})[0]
		change(&checkpoint)
		got := ApplyTranscriptReviews(checkpoint)
		if got.TranscriptProposals[0].Reviewed || got.TranscriptProposals[0].TimingVerified || len(got.Candidates[0].Words) != 0 || got.Candidates[0].Text != "" {
			t.Fatal("stale checkpoint retained executable owner caption authority")
		}
	}
}

func TestOwnerTimingRemovalClearsStaleSplitCandidateText(t *testing.T) {
	a := unverifiedTimingFixture()
	a.Candidates = append(a.Candidates, Candidate{ID: "source-s1-cut2", SourceID: a.ID, In: 4, Out: 7, Role: "a_roll", Text: "stale", Words: []Word{{Text: "stale", Start: 5, End: 6}}})
	got, err := ApproveTranscriptTiming(a, a.TranscriptProposals[0].ID, []Word{{Text: "Actual", Start: 1.2, End: 1.6}}, true)
	if err != nil || got.Candidates[1].Text != "" || len(got.Candidates[1].Words) != 0 || got.Candidates[1].Role != "b_roll" {
		t.Fatalf("removed words retained stale semantic text: %+v %v", got.Candidates, err)
	}
}
