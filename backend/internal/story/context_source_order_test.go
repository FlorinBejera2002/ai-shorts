package story

import (
	"reflect"
	"slices"
	"strings"
	"testing"
)

func orderedCrossSourceContextFixture() (Request, Plan) {
	req := Request{Options: DefaultOptions(), Assets: []Asset{
		{ID: "source-6", Order: 6, Duration: 10, HasAudio: true, Candidates: []Candidate{{ID: "opening", SourceID: "source-6", In: 6, Out: 8}}},
		{ID: "source-7", Order: 7, Duration: 10, HasAudio: true, Candidates: []Candidate{{ID: "continuation", SourceID: "source-7", In: 0, Out: 2}}},
		{ID: "source-8", Order: 8, Duration: 10, HasAudio: true, Candidates: []Candidate{{ID: "closing", SourceID: "source-8", In: 0, Out: 2}}},
	}}
	brief := BuildEditingBrief(req)
	plan := Plan{EditingBrief: &brief, Blocks: []Block{{ID: "anchor", CandidateID: "opening", Crop: "fit"}, {ID: "tail", CandidateID: "closing", Crop: "fit"}}}
	return req, plan
}

func TestOrderedCrossSourceContextRestoresContinuationAfterItsBeginning(t *testing.T) {
	req, plan := orderedCrossSourceContextFixture()
	original := clonePlan(plan)
	updated, err := applyOperation(plan, repairOperation{"restore_context", "anchor", "continuation"}, req.Assets)
	if err != nil || !slices.Equal(continuationIDs(updated), []string{"opening", "continuation", "closing"}) {
		t.Fatalf("following source was placed before its opening despite preserved order: %+v %v", updated, err)
	}
	if issues := ValidatePlan(updated, req.Assets, req.Options, nil); hasBlocking(issues) {
		t.Fatalf("restoration violated the original source order: %+v", issues)
	}
	timeline, err := BuildTimeline(updated, req.Assets)
	if err != nil || timeline[1].Audio == nil || *timeline[1].Audio != (Interval{SourceID: "source-7", In: 0, Out: 2}) || len(timeline[1].Words) != 0 {
		t.Fatalf("restoration changed original audio or invented unverified captions: %+v %v", timeline, err)
	}
	if !reflect.DeepEqual(plan, original) {
		t.Fatal("repair changed its input plan")
	}
}

func TestOrderedCrossSourceContextKeepsPrerequisitesBetweenSources(t *testing.T) {
	req, plan := orderedCrossSourceContextFixture()
	req.Assets[1].Candidates[0].Dependencies = []string{"opening"}
	req.Assets[2].Candidates[0].Dependencies = []string{"continuation"}
	plan.Blocks = plan.Blocks[:1]
	updated, err := applyOperation(plan, repairOperation{"restore_context", "anchor", "closing"}, req.Assets)
	if err != nil || !slices.Equal(continuationIDs(updated), []string{"opening", "continuation", "closing"}) {
		t.Fatalf("cross-source prerequisite chain was moved before the original anchor: %+v %v", updated, err)
	}
	if issues := ValidatePlan(updated, req.Assets, req.Options, nil); hasBlocking(issues) {
		t.Fatalf("restored chain violates dependency or source order: %+v", issues)
	}
}

func TestOrderedCrossSourceContextDoesNotChangeUnorderedOrLegacyPlans(t *testing.T) {
	for _, legacy := range []bool{false, true} {
		req, plan := orderedCrossSourceContextFixture()
		if legacy {
			plan.EditingBrief = nil
		} else {
			plan.EditingBrief.SelectedSettings.PreserveOrder = false
		}
		updated, err := applyOperation(plan, repairOperation{"restore_context", "anchor", "continuation"}, req.Assets)
		if err != nil || !slices.Equal(continuationIDs(updated), []string{"continuation", "opening", "closing"}) {
			t.Fatalf("source order was imposed without a saved contract (legacy=%v): %+v %v", legacy, updated, err)
		}
	}
}

func TestOrderedCrossSourceContextPreservesExplicitDependenciesAndLocks(t *testing.T) {
	req, plan := orderedCrossSourceContextFixture()
	req.Assets[0].Candidates[0].Dependencies = []string{"continuation"}
	updated, err := applyOperation(plan, repairOperation{"restore_context", "anchor", "continuation"}, req.Assets)
	if err != nil || !slices.Equal(continuationIDs(updated), []string{"continuation", "opening", "closing"}) {
		t.Fatalf("explicit prerequisite direction was silently overridden: %+v %v", updated, err)
	}
	if !hasBlocking(ValidatePlan(updated, req.Assets, req.Options, nil)) {
		t.Fatal("conflicting explicit dependency and source order were silently accepted")
	}
	req, plan = orderedCrossSourceContextFixture()
	plan.Blocks[1].LockOrder = true
	if _, err = applyOperation(plan, repairOperation{"restore_context", "anchor", "continuation"}, req.Assets); err == nil || !strings.Contains(err.Error(), "locked") {
		t.Fatalf("restoring cross-source continuation moved a locked block: %v", err)
	}
}
