package processing

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	"sneepcut/backend-go/internal/aiprovider"
	"sneepcut/backend-go/internal/story"
)

type taskProvider struct {
	providers map[aiprovider.Task]aiprovider.Generator
	tasks     []aiprovider.Task
}

func (p *taskProvider) Generate(context.Context, string) (string, error) {
	return "", errors.New("a task must be selected before generation")
}

func (p *taskProvider) ForTask(_ context.Context, task aiprovider.Task) (aiprovider.Generator, error) {
	p.tasks = append(p.tasks, task)
	if generator := p.providers[task]; generator != nil {
		return generator, nil
	}
	return nil, aiprovider.ErrNotConfigured
}

// A router identity deliberately stays constant as individual models change.
func (*taskProvider) MediaModelIdentity() string { return "task-router" }

func TestProcessingRoutesHighlightsAndTransitions(t *testing.T) {
	highlights := &bridgeAdvice{reply: `{"shorts":[{"segments":[{"start":0,"end":20}],"transition":"cut","viral_score":8}]}`}
	transitions := &bridgeAdvice{reply: `{"bridge":true}`}
	router := &taskProvider{providers: map[aiprovider.Task]aiprovider.Generator{
		aiprovider.TaskHighlights: highlights, aiprovider.TaskTransitions: transitions,
	}}
	p := New(Config{}, nil, router)
	if clips, err := p.highlights(context.Background(), Transcript{Duration: 30}, 1, ""); err != nil || len(clips) != 1 {
		t.Fatalf("task-specific highlights failed: %#v %v", clips, err)
	}
	boundary := BoundaryDecision{SpeechSafe: true, VisualSimilarity: .7, Motion: .04, Outgoing: 2, Incoming: 4}
	if !p.approveBridge(context.Background(), boundary, nil) || highlights.calls != 1 || transitions.calls != 1 {
		t.Fatal("processing used the wrong task provider")
	}
	delete(router.providers, aiprovider.TaskTransitions)
	if p.approveBridge(context.Background(), boundary, nil) || transitions.calls != 1 {
		t.Fatal("unavailable transition provider did not preserve the normal cut")
	}
}

func TestStoryAudibilityCacheFollowsSelectedSpeechModel(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	ctx := context.Background()
	asset := storySource(t, p, dir, "speech-cache", "red", 440)
	phrase := storyCaptionPhrase{ID: "phrase", SourceID: asset.ID, In: 0, Out: 1, Text: "Fixture"}
	request := story.Request{ID: "speech-routing", Assets: []story.Asset{asset}}
	first := &storySemanticMock{model: "first", storyReviewMock: storyReviewMock{result: `{"candidates":[{"candidate_id":"phrase","status":"clear","reason":"Synthetic test response.","confidence":0.98,"words_verified":true}]}`}}
	second := &storySemanticMock{model: "second", storyReviewMock: storyReviewMock{result: `{"candidates":[{"candidate_id":"phrase","status":"difficult","reason":"Different synthetic test response.","confidence":0.98,"words_verified":true}]}`}}
	router := &taskProvider{providers: map[aiprovider.Task]aiprovider.Generator{aiprovider.TaskSpeechReview: first}}
	p.ai = router
	findings, err := p.storyAudibility(ctx, t.TempDir(), request, []storyCaptionPhrase{phrase})
	if err != nil || findings[phrase.ID].Status != "clear" || first.calls != 1 {
		t.Fatalf("speech task was not selected: %#v %v", findings, err)
	}
	ffmpeg := p.cfg.FFmpegPath
	p.cfg.FFmpegPath = filepath.Join(dir, "must-not-run-on-cache-hit")
	if _, err := p.storyAudibility(ctx, t.TempDir(), request, []storyCaptionPhrase{phrase}); err != nil || first.calls != 1 {
		t.Fatalf("unchanged speech model did not reuse its cache: %v", err)
	}
	p.cfg.FFmpegPath = ffmpeg
	router.providers[aiprovider.TaskSpeechReview] = second
	findings, err = p.storyAudibility(ctx, t.TempDir(), request, []storyCaptionPhrase{phrase})
	if err != nil || findings[phrase.ID].Status != "difficult" || first.calls != 1 || second.calls != 1 {
		t.Fatalf("changed speech model reused another model's evidence: %#v %v", findings, err)
	}
}
