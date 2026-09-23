package story

import (
	"context"
	"strings"
	"testing"
)

func TestGlobalPlannerKeepsDependentPhraseForBoundedPreRenderRepair(t *testing.T) {
	req := fixtureRequest()
	req.Assets[0].Candidates[2].Text = "Therefore mix thoroughly."
	req.Assets[0].Candidates[2].Dependencies = []string{"a"}
	selected := Plan{Title: "Supported recipe conclusion", Blocks: []Block{{CandidateID: "b", Role: "conclusion"}}}
	media := &fakeMedia{}
	checkpoint := &memoryCheckpoints{}
	result, err := New(media, &fakeGenerator{responses: []string{proposal(selected)}}, DefaultLimits()).Run(context.Background(), req, checkpoint)
	if err != nil {
		t.Fatal(err)
	}
	if len(media.renders) != 1 || result.Best.Report.Status != "ready" || len(result.Attempts) != 1 || !result.Attempts[0].Accepted || result.Attempts[0].Operation != "restore_context" {
		t.Fatalf("global context repair did not happen before the first render: %+v", result)
	}
	plan := media.renders[0].Plan
	if plan.Title != selected.Title || len(plan.Gaps) != 0 || len(plan.Blocks) != 2 || plan.Blocks[0].CandidateID != "a" || plan.Blocks[1].CandidateID != "b" || plan.Blocks[1].Role != "conclusion" {
		t.Fatalf("source-order fallback replaced the original editorial selection: %+v", plan)
	}
	if checkpoint.versions[0].Plan.Title != selected.Title || len(checkpoint.versions[0].Plan.Blocks) != 1 || !hasBlocking(checkpoint.versions[0].Report.Issues) {
		t.Fatal("original repairable proposal and its evidence were not checkpointed")
	}
}

func TestGlobalPlannerRetainsExplicitContextIssueWhenNoRepairBudget(t *testing.T) {
	req := fixtureRequest()
	req.Assets[0].Candidates[2].Dependencies = []string{"a"}
	limits := DefaultLimits()
	limits.MaxRepairCycles = 0
	selected := Plan{Title: "Needs source context", Blocks: []Block{{CandidateID: "b"}}}
	media := &fakeMedia{}
	result, err := New(media, &fakeGenerator{responses: []string{proposal(selected)}}, limits).Run(context.Background(), req, &memoryCheckpoints{})
	if err != nil {
		t.Fatal(err)
	}
	if result.Best.Plan.Title != selected.Title || len(result.Best.Plan.Gaps) != 0 || result.Best.Report.Status != "needs_review" || len(result.Attempts) != 0 {
		t.Fatalf("exhausted repair budget hid the actual context finding: %+v", result)
	}
	if len(result.Best.Report.Issues) != 1 || result.Best.Report.Issues[0].Type != "dependency" || result.Best.Report.Issues[0].CandidateID != "a" {
		t.Fatalf("missing source prerequisite was replaced by a generic fallback gap: %+v", result.Best.Report)
	}
}

func TestGlobalPlannerUnsafeConstraintsStillFallbackWithExactReason(t *testing.T) {
	for _, test := range []struct {
		name                 string
		change               func(*Request, *Plan)
		constraint, evidence string
	}{
		{"unknown source", func(_ *Request, p *Plan) { p.Blocks[0].CandidateID = "invented-candidate" }, "source", "invented-candidate"},
		{"short B-roll", func(_ *Request, p *Plan) { p.Blocks = []Block{{CandidateID: "b", BRollID: "a"}} }, "b_roll", "shorter than its audio"},
		{"unsafe B-roll role", func(_ *Request, p *Plan) { p.Blocks[0].BRollID = "b" }, "b_roll_role", "not classified as B-roll"},
		{"duplicate phrase", func(_ *Request, p *Plan) { p.Blocks = append(p.Blocks, p.Blocks[0]) }, "duplicate", "occurs twice"},
		{"order constraint", func(req *Request, p *Plan) {
			req.Options.PreserveOrder = true
			p.Blocks = []Block{{CandidateID: "b"}, {CandidateID: "a"}}
		}, "order", "Preserve source order"},
	} {
		t.Run(test.name, func(t *testing.T) {
			req := fixtureRequest()
			p := fixturePlan()
			test.change(&req, &p)
			plan, err := New(&fakeMedia{}, &fakeGenerator{responses: []string{proposal(p)}}, DefaultLimits()).plan(context.Background(), req, &runBudget{max: 12})
			if err != nil {
				t.Fatal(err)
			}
			gaps := strings.Join(plan.Gaps, " ")
			if plan.Title != "Source-backed story" || !strings.Contains(gaps, "("+test.constraint) || !strings.Contains(gaps, test.evidence) {
				t.Fatalf("unsafe plan was retained or fallback omitted the concrete constraint: %+v", plan)
			}
			if hasCritical(ValidatePlan(plan, req.Assets, req.Options, nil)) {
				t.Fatal("source-order fallback introduced unsafe executable constraints")
			}
		})
	}
}
