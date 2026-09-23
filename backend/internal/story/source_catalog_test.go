package story

import (
	"context"
	"reflect"
	"strings"
	"testing"
)

type modelRefreshMedia struct {
	fakeMedia
	change func(*Asset)
}

func (m *modelRefreshMedia) Analyze(_ context.Context, _ string, asset Asset, _ Options) (Asset, error) {
	m.analyses++
	asset.AnalysisVersion = "new-whisper-model-digest"
	asset.SemanticAnalysisVersion = ""
	m.change(&asset)
	return asset, nil
}

func TestAcceptedLockedStoryPinsChangedModelCatalog(t *testing.T) {
	for _, test := range []struct {
		name   string
		change func(*Asset)
	}{
		{"same ID changed words", func(a *Asset) { a.Candidates[0].Text = "Use six grams."; a.Candidates[0].Words[1].Text = "six" }},
		{"same ID changed phrase interval", func(a *Asset) { a.Candidates[0].In = .9 }},
		{"changed aligned word interval", func(a *Asset) { a.Candidates[0].Words[0].Start += .1 }},
		{"missing selected ID", func(a *Asset) { a.Candidates = a.Candidates[1:] }},
		{"renamed candidate", func(a *Asset) { a.Candidates[0].ID = "new-sentence-id" }},
		{"inserted sentence", func(a *Asset) {
			extra := a.Candidates[0]
			extra.ID = "new-sentence-id"
			a.Candidates = append(a.Candidates, extra)
		}},
		{"changed speaker", func(a *Asset) { a.Candidates[0].Speaker = "different-speaker" }},
		{"changed source mapping", func(a *Asset) { a.Mapping.OriginalStart += .5 }},
	} {
		t.Run(test.name, func(t *testing.T) {
			req := fixtureRequest()
			base := fixtureBase(t, req)
			base.Plan.Blocks[0].Locked = true
			req.Base = &base
			req.Action = "resume"
			req.VersionStart = 2
			original := cloneAssets(req.Assets)
			media := &modelRefreshMedia{change: test.change}
			checkpoint := &memoryCheckpoints{}
			result, err := New(media, &fakeGenerator{}, DefaultLimits()).Run(context.Background(), req, checkpoint)
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(result.Best.Timeline, base.Timeline) {
				t.Fatalf("accepted source meaning/timing silently changed under the same block ID: %+v", result.Best.Timeline)
			}
			if !reflect.DeepEqual(req.Assets, original) {
				t.Fatal("adapter changed caller-owned accepted catalog in place")
			}
			last := checkpoint.assets[len(checkpoint.assets)-1]
			if last.AnalysisVersion != original[0].AnalysisVersion || !strings.Contains(strings.Join(last.Warnings, " "), "new draft or project") {
				t.Fatalf("pinned evidence was mislabeled as a new model or warning was omitted: %+v", last)
			}
			if len(last.Candidates) != len(original[0].Candidates) || last.Candidates[0].Text != original[0].Candidates[0].Text || !reflect.DeepEqual(last.Candidates[0].Words, original[0].Candidates[0].Words) {
				t.Fatal("checkpoint replaced accepted source snapshot")
			}
		})
	}
}

func TestInitialAndUnacceptedDraftsCanRefreshModelCatalog(t *testing.T) {
	for _, withBase := range []bool{false, true} {
		req := fixtureRequest()
		if withBase {
			base := fixtureBase(t, req)
			base.Accepted = false
			req.Base = &base
		}
		media := &modelRefreshMedia{change: func(a *Asset) { a.Candidates[0].Text = "Use six grams."; a.Candidates[0].Words[1].Text = "six" }}
		state := runState{builder: New(media, nil, DefaultLimits()), req: req, checkpoints: &memoryCheckpoints{}, budget: &runBudget{max: 12}}
		if err := state.analyze(context.Background()); err != nil {
			t.Fatal(err)
		}
		if state.req.Assets[0].AnalysisVersion != "new-whisper-model-digest" || state.req.Assets[0].Candidates[0].Text != "Use six grams." {
			t.Fatal("initial or unaccepted source analysis was unnecessarily pinned")
		}
	}
}

func TestAcceptedReferencesIncludeIdentityBRollAlternatesAndContext(t *testing.T) {
	req := fixtureRequest()
	base := fixtureBase(t, req)
	req.Base = &base
	for i, id := range []string{"visual", "identity", "alternate", "context", "unreferenced"} {
		asset := fixtureAsset()
		asset.ID = id
		asset.Key = id + ".mov"
		asset.Order = i + 1
		asset.Candidates = []Candidate{{ID: id + "-candidate", SourceID: id, In: 1, Out: 4, Text: "Use five grams.", Role: "a_roll", Speaker: "speaker-1", Language: "en"}}
		req.Assets = append(req.Assets, asset)
	}
	base.Plan.Blocks[0].BRollID = "visual-candidate"
	base.Plan.Blocks[0].IdentityReferenceID = "identity-candidate"
	base.Plan.Blocks[0].Alternatives = []string{"alternate-candidate"}
	req.Assets[0].Candidates[0].Dependencies = []string{"context-candidate"}
	sources := acceptedSourceReferences(req)
	for _, id := range []string{"source-a", "visual", "identity", "alternate", "context"} {
		if !sources[id] {
			t.Fatalf("accepted story reference %s was not pinned", id)
		}
	}
	if sources["unreferenced"] {
		t.Fatal("unreferenced new material should allow model refresh")
	}
	media := &modelRefreshMedia{change: func(a *Asset) { a.Candidates[0].Text = "Newly analyzed words." }}
	state := runState{builder: New(media, nil, DefaultLimits()), req: req, checkpoints: &memoryCheckpoints{}, budget: &runBudget{max: 12}}
	if err := state.analyze(context.Background()); err != nil {
		t.Fatal(err)
	}
	for _, asset := range state.req.Assets {
		if sources[asset.ID] && asset.Candidates[0].Text == "Newly analyzed words." {
			t.Fatalf("referenced %s catalog changed", asset.ID)
		}
		if asset.ID == "unreferenced" && asset.Candidates[0].Text != "Newly analyzed words." {
			t.Fatal("unreferenced catalog failed to refresh")
		}
	}
}

func TestEquivalentModelRefreshKeepsContextAndUpdatesDigest(t *testing.T) {
	req := fixtureRequest()
	base := fixtureBase(t, req)
	req.Base = &base
	req.Assets[0].Candidates[2].Dependencies = []string{"a"}
	media := &modelRefreshMedia{change: func(a *Asset) { a.Candidates[2].Dependencies = nil; a.Candidates[0].AudioScore = .99 }}
	state := runState{builder: New(media, nil, DefaultLimits()), req: req, checkpoints: &memoryCheckpoints{}, budget: &runBudget{max: 12}}
	if err := state.analyze(context.Background()); err != nil {
		t.Fatal(err)
	}
	asset := state.req.Assets[0]
	if asset.AnalysisVersion != "new-whisper-model-digest" || len(asset.Warnings) != 0 || !reflect.DeepEqual(asset.Candidates[2].Dependencies, []string{"a"}) {
		t.Fatalf("equivalent analysis lost known context or caused a false pin: %+v", asset)
	}
}
