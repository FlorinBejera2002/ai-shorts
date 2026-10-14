package processing

import (
	"context"
	"fmt"
	"reflect"
	"sneepcut/backend-go/internal/aiprovider"
	"sneepcut/backend-go/internal/story"
	"testing"
)

func TestNarrationSemanticBatchesReuseVisualCacheAndInvalidateChangedVoice(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	ctx := context.Background()
	options := story.DefaultOptions()
	options.Narration = true
	asset := storySource(t, p, dir, "cache-visual", "red", 0)
	asset, err := p.Analyze(ctx, "narration-cache", asset, options)
	if err != nil {
		t.Fatal(err)
	}
	voice := story.Asset{ID: "voice-context", Kind: "narration", Hash: "voice-original", Duration: 2, Candidates: []story.Candidate{{ID: "spoken", SourceID: "voice-context", In: 0, Out: 2, Text: "Original recorded voice."}}}
	assets := []story.Asset{voice}
	for i := 0; i < 21; i++ {
		copy := cloneStorySemanticAssets([]story.Asset{asset})[0]
		copy.ID = fmt.Sprintf("visual-%03d", i)
		for j := range copy.Candidates {
			copy.Candidates[j].ID = fmt.Sprintf("moment-%03d-%d", i, j)
			copy.Candidates[j].SourceID = copy.ID
		}
		assets = append(assets, copy)
	}
	reviewer := &storySemanticMock{storyReviewMock: storyReviewMock{result: `{"candidates":[]}`}, model: "narration-batches"}
	p.ai = &taskProvider{providers: map[aiprovider.Task]aiprovider.Generator{aiprovider.TaskSourceAnalysis: reviewer}}
	reserved := 0
	ctx = story.WithAIBudget(ctx, func(context.Context) error { reserved++; return nil })
	result, err := p.AnalyzeStorySources(ctx, assets, options)
	if err != nil || reviewer.calls != 2 || reserved != 2 {
		t.Fatal("initial bounded batches", reviewer.calls, reserved, err)
	}
	if !reflect.DeepEqual(result[0], voice) {
		t.Fatal("visual annotation mutated narration context")
	}
	cached, err := p.AnalyzeStorySources(ctx, result, options)
	if err != nil || reviewer.calls != 2 || reserved != 2 {
		t.Fatal("unchanged narration replay spent another provider call", reviewer.calls, reserved, err)
	}
	cached[0].Candidates[0].Text = "A changed recorded subject."
	_, err = p.AnalyzeStorySources(ctx, cached, options)
	if err != nil || reviewer.calls != 4 || reserved != 4 {
		t.Fatal("changed narration incorrectly reused visual context", reviewer.calls, reserved, err)
	}
}
