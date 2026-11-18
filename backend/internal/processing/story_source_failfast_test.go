package processing

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/aiprovider"
	"sneepcut/backend-go/internal/story"
)

func TestMusicSourceAnalysisStopsAfterPermanentProviderRejection(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	ctx := context.Background()
	options := story.DefaultOptions()
	options.Music = &story.MusicSelection{Sync: true, Volume: .2, SourceAudio: "mute"}
	asset := storySource(t, p, dir, "source-rejection", "blue", 0)
	asset, err := p.Analyze(ctx, "source-rejection", asset, options)
	if err != nil {
		t.Fatal(err)
	}
	var assets []story.Asset
	for i := 0; i < 5; i++ {
		a := asset
		a.ID = fmt.Sprintf("source-%d", i)
		a.Candidates = nil
		for j := 0; j < 8; j++ {
			a.Candidates = append(a.Candidates, story.Candidate{ID: fmt.Sprintf("%s-candidate-%d", a.ID, j), SourceID: a.ID, In: asset.Duration * float64(j) / 8, Out: asset.Duration * float64(j+1) / 8})
		}
		assets = append(assets, a)
	}
	for _, status := range []int{401, 402, 403, 404} {
		t.Run(fmt.Sprint(status), func(t *testing.T) {
			reviewer := &storySemanticMock{storyReviewMock: storyReviewMock{err: fmt.Errorf("private-key private-source: %w", &aiprovider.RequestError{StatusCode: status})}, model: "rejected"}
			p.ai = &taskProvider{providers: map[aiprovider.Task]aiprovider.Generator{aiprovider.TaskSourceAnalysis: reviewer}}
			reserved := 0
			budget := story.WithAIBudget(ctx, func(context.Context) error { reserved++; return nil })
			_, err := p.AnalyzeStorySources(budget, assets, options)
			if err == nil || reviewer.calls != 1 || reserved != 1 || strings.Contains(err.Error(), "private-") {
				t.Fatalf("permanent failure continued or exposed adapter data: calls=%d reserved=%d err=%v", reviewer.calls, reserved, err)
			}
		})
	}
	t.Run("ordinary optional enrichment remains optional", func(t *testing.T) {
		reviewer := &storySemanticMock{storyReviewMock: storyReviewMock{err: &aiprovider.RequestError{StatusCode: 403}}, model: "optional"}
		p.ai = &taskProvider{providers: map[aiprovider.Task]aiprovider.Generator{aiprovider.TaskSourceAnalysis: reviewer}}
		result, err := p.AnalyzeStorySources(ctx, assets, story.DefaultOptions())
		if err != nil || reviewer.calls != 2 || len(result) != len(assets) || len(result[0].Warnings) == 0 {
			t.Fatal("ordinary optional source fallback changed", reviewer.calls, err)
		}
	})
	t.Run("reservation denial makes no provider call", func(t *testing.T) {
		reviewer := &storySemanticMock{model: "budget"}
		p.ai = &taskProvider{providers: map[aiprovider.Task]aiprovider.Generator{aiprovider.TaskSourceAnalysis: reviewer}}
		reserved := 0
		budget := story.WithAIBudget(ctx, func(context.Context) error { reserved++; return errors.New("private budget details") })
		_, err := p.AnalyzeStorySources(budget, assets, options)
		if err == nil || reviewer.calls != 0 || reserved != 1 || strings.Contains(err.Error(), "private") {
			t.Fatal("budget denial repeated or leaked", reviewer.calls, reserved, err)
		}
	})
}

func TestMusicActionRefinementPropagatesPermanentAccessFailure(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	ctx := context.Background()
	options := story.DefaultOptions()
	options.Music = &story.MusicSelection{Sync: true, Volume: .2, SourceAudio: "mute"}
	asset := storySource(t, p, dir, "refinement-rejection", "green", 0)
	asset, err := p.Analyze(ctx, "refinement-rejection", asset, options)
	if err != nil {
		t.Fatal(err)
	}
	asset.SemanticAnalysisVersion = "new-meaning"
	asset.Candidates[0].Idea = "An observed complete visual action."
	for _, test := range []struct {
		name  string
		err   error
		fatal bool
	}{{"permanent", &aiprovider.RequestError{StatusCode: 403}, true}, {"transient", aiprovider.ErrUnavailable, false}} {
		t.Run(test.name, func(t *testing.T) {
			reviewer := &storySemanticMock{storyReviewMock: storyReviewMock{err: test.err}, model: test.name}
			p.ai = &taskProvider{providers: map[aiprovider.Task]aiprovider.Generator{aiprovider.TaskSourceAnalysis: reviewer}}
			result, err := p.refineStoryMusicMoments(ctx, nil, cloneStorySemanticAssets([]story.Asset{asset}), options)
			if (err != nil) != test.fatal || reviewer.calls != 1 || result[0].Candidates[0].Out != asset.Candidates[0].Out || result[0].Candidates[0].Moment != nil {
				t.Fatal("refinement failure changed full source window or failed to stop", reviewer.calls, err)
			}
		})
	}
}
