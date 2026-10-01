package story

import (
	"context"
	"fmt"
	"reflect"
	"slices"
	"strings"
	"testing"
)

func duplicateRecording(id string) Asset {
	asset := fixtureAsset()
	asset.ID, asset.Key, asset.Name = id, "sources/"+id+".mov", id+".mov"
	asset.Hash, asset.AnalysisVersion = strings.Repeat("a", 64), ""
	for i := range asset.Candidates {
		asset.Candidates[i].ID = fmt.Sprintf("%s-s%d", id, i+1)
		asset.Candidates[i].SourceID = id
		asset.Candidates[i].Speaker = "unknown"
	}
	asset.Candidates[2].Dependencies = []string{id + "-s1"}
	return asset
}

type duplicateAnalysisMedia struct {
	fakeMedia
	model     string
	sourceIDs []string
	mutate    func(*Asset)
}

func (m *duplicateAnalysisMedia) Analyze(_ context.Context, _ string, asset Asset, _ Options) (Asset, error) {
	m.analyses++
	m.sourceIDs = append(m.sourceIDs, asset.ID)
	digest := "analysis-" + m.model
	if asset.AnalysisVersion != digest {
		asset.Candidates = duplicateRecording(asset.ID).Candidates
		asset.AnalysisVersion, asset.SemanticAnalysisVersion = digest, ""
		asset.Mapping = TimeMap{Rate: 1, Duration: asset.Duration, Method: "original"}
		asset.ProxyKey, asset.ThumbnailKey = "proxy/"+asset.ID+"/"+digest, "thumbnail/"+asset.ID
		if m.model == "new" {
			asset.Candidates[0].Text = "Use six grams."
			asset.Candidates[0].Words[1].Text = "six"
		}
	}
	if m.mutate != nil {
		m.mutate(&asset)
	}
	return asset, nil
}

func duplicateState(media Media, assets ...Asset) runState {
	req := fixtureRequest()
	req.Assets = assets
	return runState{builder: New(media, nil, DefaultLimits()), req: req, checkpoints: &memoryCheckpoints{}, budget: &runBudget{max: 12}}
}

func TestExactDuplicateAnalysisReusesWorkAndRetainsEveryUploadProvenance(t *testing.T) {
	a, b, c := duplicateRecording("source-a"), duplicateRecording("source-b"), duplicateRecording("source-c")
	a.Order, b.Order, c.Order = 2, 0, 1
	b.Role, b.Include = "reaction", "required"
	c.Hash = strings.Repeat("b", 64)
	media := &duplicateAnalysisMedia{model: "old"}
	state := duplicateState(media, b, c, a)
	original := cloneAssets(state.req.Assets)
	if err := state.analyze(context.Background()); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(media.sourceIDs, []string{"source-a", "source-c"}) || len(state.req.Assets) != 3 {
		t.Fatalf("duplicate processing was repeated or an upload was removed: calls=%v", media.sourceIDs)
	}
	for i, asset := range state.req.Assets {
		if asset.ID != original[i].ID || asset.Key != original[i].Key || asset.Name != original[i].Name || asset.Order != original[i].Order || asset.Role != original[i].Role || asset.Include != original[i].Include {
			t.Fatal("reuse replaced upload identity, original source path, name or user settings")
		}
		for _, candidate := range asset.Candidates {
			if candidate.SourceID != asset.ID || !strings.HasPrefix(candidate.ID, asset.ID+"-") {
				t.Fatalf("candidate still points to representative: %+v", candidate)
			}
		}
		if !slices.Equal(asset.Candidates[2].Dependencies, []string{asset.ID + "-s1"}) {
			t.Fatal("local prerequisites were not rebound to the duplicate's own source")
		}
	}
	gotB, gotA := state.req.Assets[0], state.req.Assets[2]
	if gotB.ProxyKey != gotA.ProxyKey || gotB.ThumbnailKey != gotA.ThumbnailKey || !slices.Equal(gotB.Candidates[0].Words, gotA.Candidates[0].Words) || gotB.Candidates[0].Role != "reaction" {
		t.Fatal("identical analysis was not reused with exact word clocks and independent role")
	}
	if gotB.Candidates[0].TakeGroup == gotA.Candidates[0].TakeGroup {
		t.Fatal("optimization incorrectly certified cross-source speaker equivalence")
	}
	if !reflect.DeepEqual(original, []Asset{b, c, a}) {
		t.Fatal("analysis changed caller-owned asset evidence")
	}
	plan := Plan{Blocks: []Block{{ID: "chosen-duplicate", CandidateID: "source-b-s1", Crop: "fit"}}}
	timeline, err := BuildTimeline(plan, state.req.Assets)
	if err != nil || timeline[0].Video.SourceID != b.ID || timeline[0].Audio.SourceID != b.ID {
		t.Fatalf("duplicate choice rendered another upload's provenance: %+v, %v", timeline, err)
	}
}

func TestDuplicateReuseRequiresVerifiedBytesAndCompatibleMedia(t *testing.T) {
	for _, test := range []struct {
		name   string
		change func(*Asset, *Asset)
	}{
		{"missing hashes", func(a, b *Asset) { a.Hash, b.Hash = "", "" }},
		{"malformed hashes", func(a, b *Asset) { a.Hash, b.Hash = strings.Repeat("z", 64), strings.Repeat("z", 64) }},
		{"different bytes", func(_, b *Asset) { b.Hash = strings.Repeat("b", 64) }},
		{"different size", func(_, b *Asset) { b.Size++ }},
		{"different duration", func(_, b *Asset) { b.Duration++ }},
		{"different dimensions", func(_, b *Asset) { b.Width++ }},
		{"voice is separate", func(_, b *Asset) { b.Kind = "narration" }},
	} {
		t.Run(test.name, func(t *testing.T) {
			a, b := duplicateRecording("a"), duplicateRecording("b")
			test.change(&a, &b)
			media := &duplicateAnalysisMedia{}
			state := duplicateState(media, a, b)
			if err := state.analyze(context.Background()); err != nil {
				t.Fatal(err)
			}
			if media.analyses != 2 {
				t.Fatalf("unsafe analysis reuse: %d calls", media.analyses)
			}
		})
	}
}

func TestDuplicateReuseFallsBackForUnscopedCandidateIDs(t *testing.T) {
	media := &duplicateAnalysisMedia{mutate: func(asset *Asset) {
		asset.Candidates = asset.Candidates[:1]
		asset.Candidates[0].ID = "legacy." + asset.ID
	}}
	state := duplicateState(media, duplicateRecording("a"), duplicateRecording("b"))
	if err := state.analyze(context.Background()); err != nil {
		t.Fatal(err)
	}
	if media.analyses != 2 || state.req.Assets[1].Candidates[0].ID != "legacy.b" {
		t.Fatal("reuse invented new IDs for an existing unscoped catalog")
	}
}

func TestDuplicateRepresentativeStillChecksModelPerRunAndPinsAcceptedCatalogs(t *testing.T) {
	media := &duplicateAnalysisMedia{model: "old"}
	state := duplicateState(media, duplicateRecording("a"), duplicateRecording("b"), duplicateRecording("c"))
	if err := state.analyze(context.Background()); err != nil {
		t.Fatal(err)
	}
	state.req.Base = &Version{Accepted: true, Plan: Plan{Blocks: []Block{{ID: "locked", CandidateID: "a-s1", Locked: true, Alternatives: []string{"b-s1"}}}}}
	media.model = "new"
	slices.Reverse(state.req.Assets)
	if err := state.analyze(context.Background()); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(media.sourceIDs, []string{"a", "a"}) {
		t.Fatalf("model validation was skipped or representative changed with upload order: %v", media.sourceIDs)
	}
	for _, asset := range state.req.Assets {
		if asset.ID == "c" {
			if asset.Candidates[0].Text != "Use six grams." || asset.AnalysisVersion != "analysis-new" {
				t.Fatal("new unreferenced duplicate inherited a pinned obsolete snapshot")
			}
		} else if asset.Candidates[0].Text != "Use five grams." || asset.AnalysisVersion != "analysis-old" || !slices.Contains(asset.Warnings, pinnedSourceWarning) {
			t.Fatalf("accepted duplicate catalog silently changed: %+v", asset)
		}
	}
}

type duplicateSemanticMedia struct {
	duplicateAnalysisMedia
	batches       [][]Asset
	providerCalls int
	mutateMeaning func([]Asset)
}

func (m *duplicateSemanticMedia) AnalyzeStorySources(ctx context.Context, assets []Asset, _ Options) ([]Asset, error) {
	m.batches = append(m.batches, cloneAssets(assets))
	var ids []string
	for _, asset := range assets {
		ids = append(ids, asset.ID+asset.AnalysisVersion)
	}
	slices.Sort(ids)
	digest := "semantic-" + strings.Join(ids, ",")
	cached := true
	for _, asset := range assets {
		cached = cached && asset.SemanticAnalysisVersion == digest
	}
	if cached {
		return assets, nil
	}
	if err := ReserveAICall(ctx); err != nil {
		return nil, err
	}
	m.providerCalls++
	for i := range assets {
		assets[i].SemanticAnalysisVersion = digest
		for j := range assets[i].Candidates {
			assets[i].Candidates[j].Idea = "Ingredients being mixed in a bowl."
			assets[i].Candidates[j].Reason = "Visible bowl and ingredients."
		}
		assets[i].Candidates[1].Dependencies = []string{assets[i].Candidates[0].ID}
	}
	if m.mutateMeaning != nil {
		m.mutateMeaning(assets)
	}
	return assets, nil
}

func TestDuplicateSemanticBatchSendsOneRecordingAndCachesExpandedMetadata(t *testing.T) {
	media := &duplicateSemanticMedia{}
	state := duplicateState(media, duplicateRecording("b"), duplicateRecording("a"))
	reservations := 0
	ctx := WithAIBudget(context.Background(), func(context.Context) error { reservations++; return nil })
	for run := 0; run < 2; run++ {
		if err := state.analyze(ctx); err != nil {
			t.Fatal(err)
		}
		for _, asset := range state.req.Assets {
			if asset.Candidates[0].Idea != "Ingredients being mixed in a bowl." || asset.SemanticAnalysisVersion == "" || !slices.Equal(asset.Candidates[1].Dependencies, []string{asset.ID + "-s1"}) {
				t.Fatalf("validated metadata was not safely expanded: %+v", asset)
			}
		}
		slices.Reverse(state.req.Assets)
	}
	for _, batch := range media.batches {
		if len(batch) != 1 || batch[0].ID != "a" {
			t.Fatalf("provider received duplicate frames/phrases: %v", batch)
		}
	}
	if media.providerCalls != 1 || reservations != 1 || state.budget.calls != 1 || media.analyses != 2 {
		t.Fatalf("expanded semantic cache repeated AI or source work: provider=%d reservations=%d budget=%d analyses=%d", media.providerCalls, reservations, state.budget.calls, media.analyses)
	}
}

func TestDuplicateSemanticsRetainsIndependentOverridesAndContext(t *testing.T) {
	media := &duplicateSemanticMedia{}
	state := duplicateState(media, duplicateRecording("a"), duplicateRecording("b"))
	if err := state.analyze(context.Background()); err != nil {
		t.Fatal(err)
	}
	state.req.Assets[1].Role = "reaction"
	state.req.Assets[1].Candidates[2].Dependencies = []string{"a-s2"}
	if err := state.analyze(context.Background()); err != nil {
		t.Fatal(err)
	}
	b := state.req.Assets[1]
	if len(media.batches[1]) != 2 || b.Role != "reaction" || b.Candidates[2].Role != "reaction" || !slices.Equal(b.Candidates[2].Dependencies, []string{"a-s2"}) {
		t.Fatal("deduplication merged independent role or source context choices")
	}
	if media.analyses != 2 {
		t.Fatal("independent editorial settings repeated identical transcription work")
	}
}

func TestDuplicateSemanticExpansionPreservesExternalDependencySource(t *testing.T) {
	a, b, c := duplicateRecording("a"), duplicateRecording("b"), duplicateRecording("c")
	for _, asset := range []*Asset{&a, &b, &c} {
		asset.AnalysisVersion = "analysis-old"
	}
	c.Hash = strings.Repeat("b", 64)
	c.Candidates[1].Dependencies = []string{"b-s1"}
	batch := duplicateSemanticBatch([]Asset{a, b, c})
	if len(batch.assets) != 2 || !slices.Equal(batch.assets[1].Candidates[1].Dependencies, []string{"a-s1"}) {
		t.Fatal("known dependency was not mapped to the bounded provider catalog")
	}
	result, err := batch.expand(cloneAssets(batch.assets))
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(result[2].Candidates[1].Dependencies, []string{"b-s1"}) {
		t.Fatal("existing dependency source identity changed or duplicated during expansion")
	}
}

func TestDuplicateSemanticBatchDoesNotCollapseConflictingSavedEvidence(t *testing.T) {
	for _, test := range []struct {
		name   string
		change func(*Asset)
	}{
		{"word clocks", func(a *Asset) { a.Candidates[0].Words[0].Start += .1 }},
		{"source meaning", func(a *Asset) { a.Candidates[0].Idea = "A different saved description." }},
		{"context", func(a *Asset) { a.Candidates[2].Dependencies = []string{"b-s2"} }},
		{"model", func(a *Asset) { a.AnalysisVersion = "other-model" }},
		{"inclusion", func(a *Asset) { a.Include = "excluded" }},
	} {
		t.Run(test.name, func(t *testing.T) {
			a, b := duplicateRecording("a"), duplicateRecording("b")
			a.AnalysisVersion, b.AnalysisVersion = "same-model", "same-model"
			test.change(&b)
			batch := duplicateSemanticBatch([]Asset{a, b})
			if len(batch.assets) != 2 {
				t.Fatal("identical bytes erased a conflicting saved source catalog")
			}
		})
	}
}

func TestDuplicateSemanticValidationRejectsInventedEvidenceForAllUploads(t *testing.T) {
	for _, mutate := range []func([]Asset){
		func(assets []Asset) { assets[0].Candidates[0].Words[1].Text = "invented" },
		func(assets []Asset) { assets[0].Candidates[0].Dependencies = []string{"unseen"} },
		func(assets []Asset) { assets[0].Candidates[0].SourceID = "b" },
	} {
		media := &duplicateSemanticMedia{mutateMeaning: mutate}
		state := duplicateState(media, duplicateRecording("a"), duplicateRecording("b"))
		if err := state.analyze(context.Background()); err != nil {
			t.Fatal(err)
		}
		for _, asset := range state.req.Assets {
			if asset.SemanticAnalysisVersion != "" || asset.Candidates[0].Words[1].Text != "five" || !strings.Contains(strings.Join(asset.Warnings, " "), "Source semantic analysis was unavailable") {
				t.Fatal("unsafe duplicate annotations were expanded or certified")
			}
		}
	}
}
