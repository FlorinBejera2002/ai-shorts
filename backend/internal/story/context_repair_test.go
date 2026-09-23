package story

import (
	"context"
	"reflect"
	"strings"
	"testing"
)

func chainedContextRequest() Request {
	req := fixtureRequest()
	req.Assets[0].Candidates[1].Text = "The mixing method follows this measurement."
	req.Assets[0].Candidates[1].Dependencies = []string{"a"}
	req.Assets[0].Candidates[2].Dependencies = []string{"a-alt"}
	return req
}

func TestContextRepairRestoresPrerequisiteClosureInOneIntervention(t *testing.T) {
	req := chainedContextRequest()
	selected := Plan{Title: "Complete instruction", Blocks: []Block{{CandidateID: "b", Role: "conclusion"}}}
	media := &fakeMedia{}
	result, err := New(media, &fakeGenerator{responses: []string{proposal(selected)}}, DefaultLimits()).Run(context.Background(), req, &memoryCheckpoints{})
	if err != nil {
		t.Fatal(err)
	}
	if result.Best.Report.Status != "ready" || len(result.Attempts) != 1 || !result.Attempts[0].Accepted || len(media.renders) != 1 {
		t.Fatalf("prerequisite closure was incorrectly treated as a new regression: %+v", result)
	}
	var ids []string
	for _, block := range result.Best.Plan.Blocks {
		ids = append(ids, block.CandidateID)
	}
	if !reflect.DeepEqual(ids, []string{"a", "a-alt", "b"}) {
		t.Fatalf("prerequisites were not restored before dependents: %v", ids)
	}
	for _, entry := range result.Best.Timeline {
		original := indexCandidates(req.Assets)[entry.CandidateID]
		if entry.Audio == nil || entry.Audio.In != original.In || entry.Audio.Out != original.Out || entry.Audio.SourceID != original.SourceID {
			t.Fatal("restoring context rewrote source provenance")
		}
	}
}

func TestContextRepairReordersExistingWholePrerequisiteWithoutDuplication(t *testing.T) {
	req := chainedContextRequest()
	plan := Plan{Blocks: []Block{{ID: "target", CandidateID: "b", Crop: "track"}, {ID: "existing", CandidateID: "a-alt", Crop: "fit", LockText: true, Reason: "Keep this source evidence."}}}
	updated, err := applyOperation(plan, repairOperation{"restore_context", "target", "a-alt"}, req.Assets)
	if err != nil {
		t.Fatal(err)
	}
	if len(updated.Blocks) != 3 || updated.Blocks[0].CandidateID != "a" || !reflect.DeepEqual(updated.Blocks[1], plan.Blocks[1]) || updated.Blocks[2].ID != "target" {
		t.Fatalf("existing context duplicated or lost metadata: %+v", updated)
	}
	if hasBlocking(ValidatePlan(updated, req.Assets, req.Options, nil)) {
		t.Fatal("reordered context still violates prerequisites")
	}
}

func TestContextRepairRejectsCyclesExcludedSourcesAndLockedOrder(t *testing.T) {
	for _, test := range []struct {
		name   string
		change func(*Request, *Plan)
		reason string
	}{
		{"cycle", func(req *Request, _ *Plan) { req.Assets[0].Candidates[0].Dependencies = []string{"b"} }, "cyclic source context"},
		{"excluded upstream", func(req *Request, _ *Plan) {
			a := fixtureAsset()
			a.ID = "excluded"
			a.Include = "excluded"
			a.Candidates = []Candidate{{ID: "hidden", SourceID: "excluded", In: 0, Out: 1}}
			req.Assets = append(req.Assets, a)
			req.Assets[0].Candidates[0].Dependencies = []string{"hidden"}
		}, "unavailable or excluded"},
		{"locked existing context", func(_ *Request, p *Plan) {
			p.Blocks = append(p.Blocks, Block{ID: "locked-context", CandidateID: "a-alt", LockOrder: true})
		}, "locked order"},
		{"locked downstream position", func(_ *Request, p *Plan) {
			p.Blocks = append(p.Blocks, Block{ID: "locked-tail", CandidateID: "a", Locked: true})
		}, "locked order"},
	} {
		t.Run(test.name, func(t *testing.T) {
			req := chainedContextRequest()
			plan := Plan{Blocks: []Block{{ID: "target", CandidateID: "b"}}}
			test.change(&req, &plan)
			if _, err := applyOperation(plan, repairOperation{"restore_context", "target", "a-alt"}, req.Assets); err == nil || !strings.Contains(err.Error(), test.reason) {
				t.Fatalf("unsafe closure was accepted or omitted exact reason: %v", err)
			}
		})
	}
}

func TestContextRepairReportsExactOrderAndDurationConstraints(t *testing.T) {
	for _, durationLimit := range []bool{false, true} {
		req := chainedContextRequest()
		plan := Plan{Blocks: []Block{{ID: "target", CandidateID: "a", Crop: "fit"}}}
		// The valid original phrase depends on a later source phrase, so source
		// order cannot be preserved by blindly adding that prerequisite before it.
		req.Assets[0].Candidates[0].Dependencies = []string{"b"}
		req.Assets[0].Candidates[1].Dependencies = nil
		req.Assets[0].Candidates[2].Dependencies = nil
		req.Options.PreserveOrder = !durationLimit
		limits := DefaultLimits()
		if durationLimit {
			limits.MaxTotalSeconds = 6
		}
		timeline, _ := BuildTimeline(plan, req.Assets)
		base := Version{Plan: plan, Timeline: timeline, Report: Report{Issues: ValidatePlan(plan, req.Assets, req.Options, nil)}}
		state := runState{builder: New(&fakeMedia{}, nil, limits), req: req, tried: make(map[string]bool), next: 2}
		if _, _, _, ok := state.nextRepair(base); ok {
			t.Fatal("constraint-violating repair was accepted")
		}
		note := base.Report.Issues[0].RepairNote
		if durationLimit && !strings.Contains(note, "7.00s exceeds 6.00s") {
			t.Fatalf("duration conflict lacked exact bounds: %q", note)
		}
		if !durationLimit && (!strings.Contains(note, "violate order") || !strings.Contains(note, "Preserve source order")) {
			t.Fatalf("order conflict lacked exact evidence: %q", note)
		}
	}
}

func TestOverlappingContextTextRequiresReviewWithoutAssumingIdentity(t *testing.T) {
	fragment := Candidate{ID: "source-002-s4", SourceID: "source-002", Text: "Dar nu sunt un papir,"}
	complete := Candidate{ID: "source-004-s1", SourceID: "source-004", Text: "Dar nu sunt un papir, așa că stați liniștiți.", Dependencies: []string{fragment.ID}}
	if !overlappingContextText(fragment, complete) {
		t.Fatal("actual RO repeated-prefix dependency was not recognized")
	}
	if EquivalentTakes(fragment, complete) || CompatibleTake(fragment, complete) {
		t.Fatal("repetition warning must not certify take or speaker equivalence")
	}
	assets := []Asset{{ID: fragment.SourceID, Candidates: []Candidate{fragment}}, {ID: complete.SourceID, Candidates: []Candidate{complete}}}
	plan := Plan{Blocks: []Block{{ID: "target", CandidateID: complete.ID}}}
	if _, err := applyOperation(plan, repairOperation{"restore_context", "target", fragment.ID}, assets); err == nil || !strings.Contains(err.Error(), "repeats wording already contained") {
		t.Fatalf("uncertain source overlap was inserted automatically: %v", err)
	}
	plan.Blocks = append([]Block{{ID: "context", CandidateID: fragment.ID}}, plan.Blocks...)
	issues := ValidatePlan(plan, assets, DefaultOptions(), nil)
	found := false
	for _, issue := range issues {
		if issue.Type == "context_overlap" && issue.Severity == "major" {
			found = true
		}
	}
	if !found {
		t.Fatal("already rendered overlapping context could falsely clear review")
	}
	if overlappingContextText(Candidate{Text: "Do not use 1.5 grams."}, Candidate{Text: "Do use 1.5 grams before mixing."}) || overlappingContextText(Candidate{Text: "Do not use 1.5 grams."}, Candidate{Text: "Do not use 15 grams before mixing."}) {
		t.Fatal("overlap warning blurred negation or number boundaries")
	}
}
