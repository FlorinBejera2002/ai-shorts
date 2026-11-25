package story

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

// planningGenerator answers editorial planning prompts with queued proposals and
// every other review prompt with a complete, issue-free result.
type planningGenerator struct {
	plans []string
}

func (g *planningGenerator) Generate(_ context.Context, prompt string) (string, error) {
	if strings.Contains(prompt, "You are an editorial planner") && len(g.plans) > 0 {
		next := g.plans[0]
		g.plans = g.plans[1:]
		return next, nil
	}
	return `{"complete":true,"issues":[],"incomplete":[]}`, nil
}

func clipProposal(candidateIDs ...string) string {
	p := plannerProposal{Title: "Clip"}
	for _, id := range candidateIDs {
		p.Blocks = append(p.Blocks, plannerBlock{CandidateID: id, Role: "context", Reason: "Full original sentence"})
	}
	data, _ := json.Marshal(p)
	return string(data)
}

// multiClipAsset is footage with two distinct spoken moments named s<i>-c<j>.
func multiClipAsset(i int) Asset {
	a := fixtureAsset()
	a.ID = testFootageID(i + 1)
	a.Key = fmt.Sprintf("sources/%d.mov", i)
	a.Name = fmt.Sprintf("take-%d.mov", i)
	a.Order = i
	a.Candidates = a.Candidates[:2]
	for j := range a.Candidates {
		a.Candidates[j].ID = fmt.Sprintf("s%d-c%d", i, j)
		a.Candidates[j].SourceID = a.ID
	}
	return a
}

func TestMultiClipStoryRendersDistinctOutputsIntoOneVersion(t *testing.T) {
	req := fixtureRequest()
	req.Options.ClipCount = 3
	req.Assets = []Asset{multiClipAsset(0), multiClipAsset(1), multiClipAsset(2)}
	generator := &planningGenerator{plans: []string{
		clipProposal("s0-c0", "s1-c0"),
		clipProposal("s0-c1", "s2-c0"),
		clipProposal("s1-c1", "s2-c1"),
	}}
	media := &fakeMedia{}
	checkpoints := &memoryCheckpoints{}
	result, err := New(media, generator, DefaultLimits()).Run(context.Background(), req, checkpoints)
	if err != nil {
		t.Fatal(err)
	}
	outputs := result.Best.Outputs
	if len(outputs) != 3 {
		t.Fatalf("outputs = %d, want 3: %+v", len(outputs), outputs)
	}
	if outputs[0].Key != result.Best.Output.Key || outputs[0].DurationSeconds != result.Best.Output.Duration {
		t.Fatalf("first output does not mirror the legacy output: %+v vs %+v", outputs[0], result.Best.Output)
	}
	for i, output := range outputs {
		if output.Index != i || output.AspectRatio != "9:16" || output.Key == "" {
			t.Fatalf("output %d malformed: %+v", i, output)
		}
	}
	if len(media.renders) != 3 {
		t.Fatalf("renders = %d, want one per clip", len(media.renders))
	}
	seen := map[string]int{}
	for i, render := range media.renders {
		for id := range timelineCandidateIDs(render.Timeline) {
			if previous, ok := seen[id]; ok {
				t.Fatalf("candidate %s used by clip %d and clip %d", id, previous, i)
			}
			seen[id] = i
		}
	}
	if len(seen) != 6 {
		t.Fatalf("expected six distinct moments, got %d", len(seen))
	}
	if len(checkpoints.versions) == 0 {
		t.Fatal("no version was checkpointed")
	}
	if last := checkpoints.versions[len(checkpoints.versions)-1]; len(last.Outputs) != 3 {
		t.Fatalf("multi-clip outputs were not checkpointed: %+v", last.Outputs)
	}
}

func TestSingleClipStoryKeepsLegacyShapeWithoutExtraRenders(t *testing.T) {
	req := fixtureRequest()
	req.Options.ClipCount = 1
	media := &fakeMedia{}
	result, err := New(media, &planningGenerator{plans: []string{clipProposal("a", "b")}}, DefaultLimits()).Run(context.Background(), req, &memoryCheckpoints{})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Best.Outputs) != 0 || len(media.renders) != 1 {
		t.Fatalf("single clip changed shape: outputs=%d renders=%d", len(result.Best.Outputs), len(media.renders))
	}
	if outputs := result.Best.ClipOutputs(); len(outputs) != 1 || outputs[0].Key != result.Best.Output.Key {
		t.Fatalf("single clip not exposed as clip zero: %+v", outputs)
	}
}

func TestExplicitMultiClipFailsWhenAnotherClipCannotBeBuilt(t *testing.T) {
	req := fixtureRequest()
	req.Options.ClipCount = 2
	req.Assets = []Asset{multiClipAsset(0)}
	// The primary clip uses every moment of the only footage, so no second clip exists.
	generator := &planningGenerator{plans: []string{clipProposal("s0-c0", "s0-c1")}}
	if _, err := New(&fakeMedia{}, generator, DefaultLimits()).Run(context.Background(), req, &memoryCheckpoints{}); err == nil {
		t.Fatal("explicit clip count returned fewer clips without an error")
	}
}

func TestExtraClipAssetSavesKeepTheFullCandidateCatalog(t *testing.T) {
	saved := &memoryCheckpoints{}
	full := multiClipAsset(0)
	checkpoints := catalogPreservingCheckpoints{Checkpoints: saved, catalogs: fullCatalogs([]Asset{full})}
	filtered := full
	filtered.Candidates = full.Candidates[:1]
	if err := checkpoints.SaveAsset(context.Background(), filtered); err != nil {
		t.Fatal(err)
	}
	if len(saved.assets) != 1 || len(saved.assets[0].Candidates) != 2 {
		t.Fatalf("filtered catalog was persisted: %+v", saved.assets)
	}
}
