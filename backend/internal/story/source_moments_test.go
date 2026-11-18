package story

import (
	"context"
	"errors"
	"math"
	"reflect"
	"testing"
)

func TestSavedMusicWindowKeepsBoundActionWhenSemanticRefreshWithdrawsEvidence(t *testing.T) {
	for _, unavailable := range []bool{false, true} {
		t.Run(map[bool]string{false: "partial refresh", true: "unavailable"}[unavailable], func(t *testing.T) {
			moment := &VisualMoment{In: 2, Out: 6, Confidence: .9, Evidence: "Observed preparation and completion with protected sampling uncertainty."}
			assets := []Asset{{ID: "source", Duration: 8, Candidates: []Candidate{{ID: "action", SourceID: "source", In: 0, Out: 8, Role: "b_roll", Moment: cloneVisualMoment(moment)}, {ID: "unapproved", SourceID: "source", In: 0, Out: 8, Role: "b_roll", Moment: cloneVisualMoment(moment)}}}}
			media := &semanticMedia{mutate: func(a []Asset) {
				for i := range a[0].Candidates {
					a[0].Candidates[i].Moment = nil
				}
			}}
			if unavailable {
				media.err = errors.New("model temporarily unavailable")
			}
			req := Request{Assets: assets, Base: &Version{Plan: Plan{Blocks: []Block{{CandidateID: "action", MusicWindow: &Interval{SourceID: "source", In: 1, Out: 7}}}}}}
			state := runState{builder: New(media, nil, DefaultLimits()), req: req, budget: &runBudget{max: 12}}
			if err := state.analyzeSourceMeaning(context.Background()); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(state.req.Assets[0].Candidates[0].Moment, moment) || state.req.Assets[0].Candidates[1].Moment != nil {
				t.Fatal("saved action evidence was withdrawn or unrelated stale evidence survived", state.req.Assets[0].Candidates)
			}
		})
	}
}

func TestSavedActionEvidenceDoesNotFollowChangedSourceProvenance(t *testing.T) {
	for _, mutate := range []func(*Request){
		func(r *Request) { r.Assets[0].Hash = "changed" },
		func(r *Request) { r.Assets[0].Candidates[0].In = .5 },
		func(r *Request) { r.Assets[0].Candidates[0].SourceID = "other" },
		func(r *Request) { r.Assets[0].Candidates[0].Text = "changed" },
	} {
		moment := &VisualMoment{In: 2, Out: 6, Confidence: .9, Evidence: "Observed preparation and completion with protected sampling uncertainty."}
		req := Request{Assets: []Asset{{ID: "source", Hash: "original", Duration: 8, Candidates: []Candidate{{ID: "action", SourceID: "source", In: 0, Out: 8, Role: "b_roll", Moment: moment}}}}, Base: &Version{Plan: Plan{Blocks: []Block{{CandidateID: "action", MusicWindow: &Interval{SourceID: "source", In: 1, Out: 7}}}}}}
		restore := pinStoryActionEvidence(&req)
		req.Assets[0].Candidates[0].Moment = nil
		mutate(&req)
		restore()
		if req.Assets[0].Candidates[0].Moment != nil {
			t.Fatal("saved action evidence was rebound to changed source provenance")
		}
	}
}

func TestSourceMeaningMergesActionWithoutChangingSourceOrSharingPointers(t *testing.T) {
	assets := []Asset{{ID: "source", Duration: 8, Candidates: []Candidate{{ID: "action", SourceID: "source", In: 0, Out: 8, Role: "b_roll"}}}}
	annotated := cloneAssets(assets)
	peak := 4.0
	annotated[0].Candidates[0].Moment = &VisualMoment{In: 2, Out: 6, Peak: &peak, Confidence: .9, Evidence: "Observed preparation and completion with protected sampling uncertainty."}
	merged, err := mergeSourceMeaning(assets, annotated)
	if err != nil || merged[0].Candidates[0].Moment == nil {
		t.Fatal("valid action metadata was rejected", err)
	}
	got := merged[0].Candidates[0]
	got.Moment = nil
	if !reflect.DeepEqual(got, assets[0].Candidates[0]) || assets[0].Candidates[0].Moment != nil {
		t.Fatal("action enrichment changed original source evidence")
	}
	*merged[0].Candidates[0].Moment.Peak = 5
	if *annotated[0].Candidates[0].Moment.Peak != 4 {
		t.Fatal("merged action shares caller-owned peak")
	}
	cloned := cloneAssets(merged)
	*cloned[0].Candidates[0].Moment.Peak = 3
	if *merged[0].Candidates[0].Moment.Peak != 5 {
		t.Fatal("asset clone shares action evidence")
	}
	annotated[0].Candidates[0].Moment = nil
	refreshed, err := mergeSourceMeaning(merged, annotated)
	if err != nil || refreshed[0].Candidates[0].Moment != nil {
		t.Fatal("refresh retained stale action evidence", err)
	}
}

func TestSourceMeaningRejectsInvalidActionEvidence(t *testing.T) {
	assets := []Asset{{ID: "source", Duration: 8, Candidates: []Candidate{{ID: "action", SourceID: "source", In: 0, Out: 8, Role: "b_roll"}}}}
	for _, change := range []func(*VisualMoment){
		func(m *VisualMoment) { m.In = -1 },
		func(m *VisualMoment) { m.Out = 9 },
		func(m *VisualMoment) { m.Out = m.In },
		func(m *VisualMoment) { m.Confidence = .5 },
		func(m *VisualMoment) { m.In = math.NaN() },
		func(m *VisualMoment) { m.Evidence = "" },
		func(m *VisualMoment) { peak := 7.0; m.Peak = &peak },
	} {
		annotated := cloneAssets(assets)
		moment := &VisualMoment{In: 2, Out: 6, Confidence: .9, Evidence: "Observed preparation and completion with protected sampling uncertainty."}
		change(moment)
		annotated[0].Candidates[0].Moment = moment
		if _, err := mergeSourceMeaning(assets, annotated); err == nil {
			t.Fatal("untrusted action evidence was merged", moment)
		}
	}
}

func TestSemanticBatchExpansionRetainsActionEvidence(t *testing.T) {
	assets := []Asset{{ID: "source", Duration: 8, Candidates: []Candidate{{ID: "action", SourceID: "source", In: 0, Out: 8, Role: "b_roll"}}}}
	batch := duplicateSemanticBatch(assets)
	annotated := cloneAssets(batch.assets)
	annotated[0].Candidates[0].Moment = &VisualMoment{In: 2, Out: 6, Confidence: .9, Evidence: "Observed preparation and completion with protected sampling uncertainty."}
	result, err := batch.expand(annotated)
	if err != nil || result[0].Candidates[0].Moment == nil || result[0].Candidates[0].Moment.In != 2 {
		t.Fatal("batch expansion dropped valid action evidence", err)
	}
}
