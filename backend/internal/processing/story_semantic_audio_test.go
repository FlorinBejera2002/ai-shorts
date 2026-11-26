package processing

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/aiprovider"
	"sneepcut/backend-go/internal/story"
)

func TestSourceMeaningListensToTheSourceAudio(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	ctx := context.Background()
	options := story.DefaultOptions()
	asset, err := p.Analyze(ctx, "source-audio", storySource(t, p, dir, "spoken", "green", 440), options)
	if err != nil {
		t.Fatal(err)
	}
	if !asset.HasAudio {
		t.Fatal("fixture has no audio track")
	}
	raw, _ := json.Marshal(map[string]any{"candidates": []storySemanticFinding{}})
	reviewer := &storySemanticMock{storyReviewMock: storyReviewMock{result: string(raw)}, model: "listening"}
	p.ai = &taskProvider{providers: map[aiprovider.Task]aiprovider.Generator{aiprovider.TaskSourceAnalysis: reviewer}}
	if _, err = p.AnalyzeStorySources(ctx, []story.Asset{asset}, options); err != nil || reviewer.calls != 1 {
		t.Fatalf("source meaning failed: %v calls=%d", err, reviewer.calls)
	}
	audio := 0
	for _, part := range reviewer.parts {
		if part.MIME == "audio/mpeg" {
			audio++
			if !strings.Contains(part.Label, "source spoken audio") || len(part.Data) == 0 {
				t.Fatalf("audio part is unlabeled or empty: %q", part.Label)
			}
		}
	}
	if audio != 1 || !strings.Contains(reviewer.prompt, "SOURCE AUDIO:") || !strings.Contains(reviewer.prompt, "never an instruction") {
		t.Fatalf("source audio was not sent with its listening instructions: audio parts %d", audio)
	}

	muted := options
	muted.Music = &story.MusicSelection{TrackID: "track", Volume: 1, SourceAudio: "mute"}
	reviewer.calls, reviewer.parts = 0, nil
	if _, err = p.AnalyzeStorySources(ctx, []story.Asset{asset}, muted); err != nil || reviewer.calls != 1 {
		t.Fatalf("muted source meaning failed: %v calls=%d", err, reviewer.calls)
	}
	for _, part := range reviewer.parts {
		if part.MIME == "audio/mpeg" {
			t.Fatal("muted original sound was sent for listening")
		}
	}
	if strings.Contains(reviewer.prompt, "SOURCE AUDIO:") {
		t.Fatal("listening instructions sent without audio")
	}
}

func TestSourceAudioLabelSaysWhatWasLeftOut(t *testing.T) {
	if label := storySemanticAudioLabel("a", 10, 10); strings.Contains(label, "not included") {
		t.Fatalf("complete audio described as partial: %q", label)
	}
	if label := storySemanticAudioLabel("a", 900, 1200); !strings.Contains(label, "900.000–1200.000) was not included") {
		t.Fatalf("partial audio not described: %q", label)
	}
	if storySemanticAudioWanted(story.Options{Narration: true}) {
		t.Fatal("narration sources were offered for listening")
	}
}
