package story

import (
	"context"
	"strings"
	"testing"
)

func TestFallbackVisualPlanBalancesSourcesAndAvoidsUnverifiedCaptions(t *testing.T) {
	assets := []Asset{
		{ID: "one", Order: 1, Candidates: []Candidate{{ID: "one-a", SourceID: "one", In: 0, Out: 4, Role: "b_roll"}, {ID: "one-b", SourceID: "one", In: 4, Out: 8, Role: "b_roll"}}},
		{ID: "two", Order: 2, Candidates: []Candidate{{ID: "two-a", SourceID: "two", In: 0, Out: 3, Role: "b_roll"}, {ID: "two-b", SourceID: "two", In: 3, Out: 6, Role: "b_roll"}}},
		{ID: "three", Order: 3, Candidates: []Candidate{{ID: "three-a", SourceID: "three", In: 0, Out: 4, Role: "b_roll"}}},
	}
	plan := fallbackPlan(Request{Assets: assets, Options: Options{TargetSeconds: 11}})
	if plan.Title != "Visual story" || len(plan.Blocks) != 3 {
		t.Fatalf("unexpected visual fallback: %#v", plan)
	}
	if len(plan.Gaps) != 0 {
		t.Fatalf("missing speech is expected for a visual montage and must not be reported as missing material: %#v", plan.Gaps)
	}
	want := []string{"one-a", "two-a", "three-a"}
	for i, block := range plan.Blocks {
		if block.CandidateID != want[i] {
			t.Fatalf("fallback did not balance sources: %#v", plan.Blocks)
		}
		candidate := indexCandidates(assets)[block.CandidateID]
		if candidate.Text != "" || len(candidate.Words) != 0 {
			t.Fatalf("visual fallback retained unverified captions: %#v", candidate)
		}
	}
	if plan.Blocks[0].Role != "hook" || plan.Blocks[len(plan.Blocks)-1].Role != "conclusion" {
		t.Fatalf("visual structure missing: %#v", plan.Blocks)
	}
}

func TestFallbackKeepsReliableSpeechStoryBehavior(t *testing.T) {
	assets := []Asset{{ID: "spoken", Candidates: []Candidate{{ID: "speech", SourceID: "spoken", In: 0, Out: 2, Text: "Verified phrase.", Words: []Word{{Text: "Verified phrase.", Start: 0, End: 2}}, Role: "a_roll"}}}}
	plan := fallbackPlan(Request{Assets: assets, Options: Options{TargetSeconds: 10}})
	if plan.Title != "Source-backed story" || len(plan.Blocks) != 1 || plan.Blocks[0].CandidateID != "speech" {
		t.Fatalf("speech fallback changed: %#v", plan)
	}
}

func TestVisualOnlyPlanningDoesNotSpendAIOnUnknownImagery(t *testing.T) {
	assets := []Asset{{ID: "visual", Candidates: []Candidate{{ID: "shot", SourceID: "visual", In: 0, Out: 3, Role: "b_roll"}}}}
	generator := &fakeGenerator{}
	plan, err := New(&fakeMedia{}, generator, DefaultLimits()).plan(context.Background(), Request{Assets: assets, Options: Options{TargetSeconds: 10}}, &runBudget{max: 12})
	if err != nil || plan.Title != "Visual story" || len(plan.Blocks) != 1 {
		t.Fatalf("visual-only fallback failed: %#v %v", plan, err)
	}
	if len(generator.prompts) != 0 {
		t.Fatalf("visual-only IDs were sent to a text planner: %d calls", len(generator.prompts))
	}
}

func TestVisualOnlyPlanningUsesUserDirectionWhenFramesAreDescribed(t *testing.T) {
	brief := "Start with the lake, keep the family moments, and finish at the cabin."
	assets := []Asset{{ID: "visual", Candidates: []Candidate{
		{ID: "lake", SourceID: "visual", In: 0, Out: 3, Role: "b_roll", Idea: "Wide view of a mountain lake."},
		{ID: "cabin", SourceID: "visual", In: 3, Out: 6, Role: "b_roll", Idea: "Cabin reflected in the lake."},
	}}}
	selected := Plan{Title: "Directed visual story", Blocks: []Block{{CandidateID: "lake", Role: "hook"}, {CandidateID: "cabin", Role: "conclusion"}}}
	generator := &fakeGenerator{responses: []string{proposal(selected)}}
	plan, err := New(&fakeMedia{}, generator, DefaultLimits()).plan(context.Background(), Request{Assets: assets, Options: Options{Brief: brief, TargetSeconds: 15}}, &runBudget{max: 12})
	if err != nil || plan.Title != selected.Title || len(plan.Blocks) != 2 {
		t.Fatalf("described visual direction was not planned: %#v %v", plan, err)
	}
	if len(generator.prompts) != 1 || !strings.Contains(generator.prompts[0], brief) || !strings.Contains(generator.prompts[0], "user's editing direction") {
		t.Fatalf("user direction was not sent as bounded editorial intent: %#v", generator.prompts)
	}
}
