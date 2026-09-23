package story

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"
)

type modelAwareMedia struct {
	fakeMedia
	model             string
	expensiveAnalyses int
}

func (m *modelAwareMedia) Analyze(_ context.Context, _ string, asset Asset, _ Options) (Asset, error) {
	m.analyses++
	digest := "source-content-settings-" + m.model
	if asset.AnalysisVersion != digest {
		m.expensiveAnalyses++
		asset.AnalysisVersion = digest
	}
	return asset, nil
}

func TestSourceAdapterOwnsCacheInvalidationAndDigestPersistence(t *testing.T) {
	media := &modelAwareMedia{model: "base"}
	checkpoint := &memoryCheckpoints{}
	state := runState{builder: New(media, nil, DefaultLimits()), req: fixtureRequest(), checkpoints: checkpoint, budget: &runBudget{max: 12}}
	for _, model := range []string{"base", "base", "large-v3-turbo"} {
		media.model = model
		if err := state.analyze(context.Background()); err != nil {
			t.Fatal(err)
		}
		if state.req.Assets[0].AnalysisVersion != "source-content-settings-"+model {
			t.Fatal("domain replaced the adapter's content/model/settings digest")
		}
	}
	if media.analyses != 3 || media.expensiveAnalyses != 2 {
		t.Fatalf("cache invalidation bypassed the adapter or reanalyzed unchanged media: %+v", media)
	}
	if checkpoint.assets[len(checkpoint.assets)-1].AnalysisVersion != "source-content-settings-large-v3-turbo" {
		t.Fatal("latest model-specific analysis marker was not checkpointed")
	}
}

type semanticMedia struct {
	fakeMedia
	semanticCalls int
	providerCalls int
	mutate        func([]Asset)
	err           error
}

func (m *semanticMedia) AnalyzeStorySources(ctx context.Context, assets []Asset, _ Options) ([]Asset, error) {
	m.semanticCalls++
	if m.err != nil {
		return nil, m.err
	}
	if len(assets) > 0 && assets[0].SemanticAnalysisVersion == "semantic-model-context-digest" {
		return assets, nil
	}
	if err := ReserveAICall(ctx); err != nil {
		return nil, err
	}
	m.providerCalls++
	for i := range assets {
		assets[i].SemanticAnalysisVersion = "semantic-model-context-digest"
		for j := range assets[i].Candidates {
			assets[i].Candidates[j].Idea = "Mixing ingredients in a bowl."
			assets[i].Candidates[j].Reason = "Visible original source evidence."
		}
	}
	if m.mutate != nil {
		m.mutate(assets)
	}
	return assets, nil
}

func TestOptionalSourceSemanticsRunsOnceAndChargesOnlyActualCall(t *testing.T) {
	media := &semanticMedia{}
	checkpoint := &memoryCheckpoints{}
	req := fixtureRequest()
	original := cloneAssets(req.Assets)
	state := runState{builder: New(media, nil, DefaultLimits()), req: req, checkpoints: checkpoint, budget: &runBudget{max: 12}}
	reservations := 0
	ctx := WithAIBudget(context.Background(), func(context.Context) error { reservations++; return nil })
	for i := 0; i < 2; i++ {
		if err := state.analyze(ctx); err != nil {
			t.Fatal(err)
		}
	}
	if media.semanticCalls != 2 || media.providerCalls != 1 || reservations != 1 || state.budget.calls != 1 {
		t.Fatalf("analysis cache hits consumed provider budget: calls=%d provider=%d reservations=%d budget=%d", media.semanticCalls, media.providerCalls, reservations, state.budget.calls)
	}
	if !reflect.DeepEqual(req.Assets, original) {
		t.Fatal("analysis mutated the caller's saved source candidates")
	}
	last := checkpoint.assets[len(checkpoint.assets)-1]
	if last.AnalysisVersion != AlgorithmVersion || last.SemanticAnalysisVersion != "semantic-model-context-digest" || last.Candidates[0].Idea != "Mixing ingredients in a bowl." {
		t.Fatalf("separate local and semantic cache evidence was lost: %+v", last)
	}
}

func TestSourceSemanticsCannotChangeOriginalWordsPathsTimesOrSpeaker(t *testing.T) {
	for _, test := range []struct {
		name   string
		mutate func([]Asset)
	}{
		{"word text", func(a []Asset) { a[0].Candidates[0].Words[0].Text = "Invented" }},
		{"word timing", func(a []Asset) { a[0].Candidates[0].Words[0].Start += .1 }},
		{"phrase text", func(a []Asset) { a[0].Candidates[0].Text = "Use six grams." }},
		{"source interval", func(a []Asset) { a[0].Candidates[0].In = .5 }},
		{"speaker", func(a []Asset) { a[0].Candidates[0].Speaker = "different-person" }},
		{"owner path", func(a []Asset) { a[0].Key = "someone-else/private.mov" }},
		{"cycle", func(a []Asset) {
			a[0].Candidates[0].Dependencies = []string{"b"}
			a[0].Candidates[2].Dependencies = []string{"a"}
		}},
		{"unknown dependency", func(a []Asset) { a[0].Candidates[0].Dependencies = []string{"hallucinated"} }},
	} {
		t.Run(test.name, func(t *testing.T) {
			req := fixtureRequest()
			original := cloneAssets(req.Assets)
			media := &semanticMedia{mutate: test.mutate}
			state := runState{builder: New(media, nil, DefaultLimits()), req: req, checkpoints: &memoryCheckpoints{}, budget: &runBudget{max: 12}}
			if err := state.analyze(context.Background()); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(req.Assets, original) {
				t.Fatal("untrusted semantic annotations mutated original source records")
			}
			if state.req.Assets[0].SemanticAnalysisVersion != "" || !strings.Contains(strings.Join(state.req.Assets[0].Warnings, " "), "Source semantic analysis was unavailable") {
				t.Fatal("invalid enrichment was silently certified")
			}
			if state.req.Assets[0].Key != original[0].Key || state.req.Assets[0].Candidates[0].Text != original[0].Candidates[0].Text || !reflect.DeepEqual(state.req.Assets[0].Candidates[0].Words, original[0].Candidates[0].Words) {
				t.Fatal("usable local evidence was discarded or changed")
			}
		})
	}
}

func TestSemanticMetadataPreservesUserRoleAndExistingDependencies(t *testing.T) {
	assets := []Asset{fixtureAsset()}
	assets[0].Role = "reaction"
	assets[0].Candidates[2].Dependencies = []string{"a"}
	annotated := cloneAssets(assets)
	annotated[0].Candidates[2].Role = "b_roll"
	annotated[0].Candidates[2].Dependencies = []string{"a-alt"}
	merged, err := mergeSourceMeaning(assets, annotated)
	if err != nil {
		t.Fatal(err)
	}
	if merged[0].Candidates[2].Role != "reaction" || !reflect.DeepEqual(merged[0].Candidates[2].Dependencies, []string{"a", "a-alt"}) {
		t.Fatal("semantic model erased user settings or required source context")
	}
}

func TestUnavailableSourceSemanticsRetainsLocalAnalysis(t *testing.T) {
	media := &semanticMedia{err: errors.New("reviewer unavailable")}
	state := runState{builder: New(media, nil, DefaultLimits()), req: fixtureRequest(), checkpoints: &memoryCheckpoints{}, budget: &runBudget{max: 12}}
	if err := state.analyze(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(state.req.Assets[0].Candidates) != 3 || state.req.Assets[0].Candidates[0].Text != "Use five grams." || len(state.req.Assets[0].Warnings) == 0 || state.budget.calls != 0 {
		t.Fatal("optional semantic failure lost local analysis or spent budget")
	}
}
