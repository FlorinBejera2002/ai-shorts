package story

import (
	"reflect"
	"slices"
	"testing"
)

func TestVisualFallbackPreservesChronologyWithAppendedGapCandidates(t *testing.T) {
	req := fixtureRequest()
	req.Options.PreserveOrder = true
	req.Assets[0].Duration = 24
	req.Assets[0].Candidates = []Candidate{
		{ID: "source-a-s1", SourceID: "source-a", In: 14, Out: 16, Role: "b_roll", Reason: "Unreliable speech was withheld; original audio remains."},
		{ID: "source-a-g3", SourceID: "source-a", In: 16, Out: 24, Role: "b_roll"},
		{ID: "source-a-g1", SourceID: "source-a", In: 0, Out: 7, Role: "b_roll"},
		{ID: "source-a-g2", SourceID: "source-a", In: 7, Out: 14, Role: "b_roll"},
	}
	original := cloneAssets(req.Assets)
	plan := fallbackPlan(req)
	var selected []string
	for _, block := range plan.Blocks {
		selected = append(selected, block.CandidateID)
	}
	if !slices.Equal(selected, []string{"source-a-g1", "source-a-g2", "source-a-s1", "source-a-g3"}) {
		t.Fatalf("visual fallback moved backward through the original recording: %v", selected)
	}
	if issues := ValidatePlan(plan, req.Assets, req.Options, nil); hasBlocking(issues) {
		t.Fatalf("chronological fallback violated source order: %+v", issues)
	}
	if !reflect.DeepEqual(original, req.Assets) {
		t.Fatal("fallback changed the caller's catalog ordering or source evidence")
	}
}

func TestDependentPhraseUsesSpokenAntecedentAcrossVisualGap(t *testing.T) {
	asset := fixtureAsset()
	asset.Candidates = []Candidate{
		{ID: "dependent", SourceID: asset.ID, In: 10, Out: 13, Text: "Therefore stir the mixture.", Role: "a_roll"},
		{ID: "context", SourceID: asset.ID, In: 1, Out: 4, Text: "Add flour to the bowl.", Role: "a_roll"},
		{ID: "gap", SourceID: asset.ID, In: 4, Out: 10, Role: "b_roll"},
	}
	assets := []Asset{asset}
	plan := Plan{Blocks: []Block{{ID: "context-block", CandidateID: "context", Crop: "fit"}, {ID: "locked-dependent", CandidateID: "dependent", Crop: "fit", Locked: true}}}
	before, err := BuildTimeline(plan, assets)
	if err != nil {
		t.Fatal(err)
	}
	base := Version{Accepted: true, Plan: plan, Timeline: before}
	if err := prepareCandidates(assets); err != nil {
		t.Fatal(err)
	}
	all := indexCandidates(assets)
	if !slices.Equal(all["dependent"].Dependencies, []string{"context"}) || len(all["gap"].Dependencies) != 0 {
		t.Fatalf("visual interval was mistaken for spoken context: %+v", all["dependent"])
	}
	after, err := BuildTimeline(plan, assets)
	if err != nil || !reflect.DeepEqual(before, after) {
		t.Fatal("chronological normalization changed a locked block's source intervals or words")
	}
	if issues := ValidatePlan(plan, assets, DefaultOptions(), &base); hasBlocking(issues) {
		t.Fatalf("correct spoken context or immutable locks were lost: %+v", issues)
	}
	wrong := clonePlan(plan)
	wrong.Blocks[0].CandidateID = "gap"
	if issues := ValidatePlan(wrong, assets, DefaultOptions(), nil); !hasBlocking(issues) {
		t.Fatal("a silent visual gap incorrectly satisfied the spoken context dependency")
	}
}

func TestVisualIntroCannotSatisfyMissingSpokenContext(t *testing.T) {
	asset := fixtureAsset()
	asset.Candidates = []Candidate{
		{ID: "gap", SourceID: asset.ID, In: 0, Out: 8, Role: "b_roll"},
		{ID: "dependent", SourceID: asset.ID, In: 8, Out: 12, Text: "Therefore stir the mixture.", Role: "a_roll"},
	}
	assets := []Asset{asset}
	if err := prepareCandidates(assets); err != nil {
		t.Fatal(err)
	}
	if len(indexCandidates(assets)["dependent"].Dependencies) != 0 {
		t.Fatal("normalization invented a spoken antecedent from visual footage")
	}
	plan := Plan{Blocks: []Block{{ID: "intro", CandidateID: "gap"}, {ID: "statement", CandidateID: "dependent"}}}
	found := false
	for _, issue := range ValidatePlan(plan, assets, DefaultOptions(), nil) {
		found = found || issue.Type == "context" && issue.BlockID == "statement" && issue.Severity == "major"
	}
	if !found {
		t.Fatal("missing spoken context was hidden by an introductory visual")
	}
}

func TestContextInferencePreservesExplicitSourceDependencies(t *testing.T) {
	asset := fixtureAsset()
	asset.Candidates[2].Text = "Therefore mix thoroughly."
	asset.Candidates[2].Dependencies = []string{"a"}
	assets := []Asset{asset}
	if err := prepareCandidates(assets); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(indexCandidates(assets)["b"].Dependencies, []string{"a"}) {
		t.Fatal("heuristic nearest-phrase inference replaced an explicit source context requirement")
	}
}
