package airouting

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"sneepcut/backend-go/internal/aiprovider"
	"sneepcut/backend-go/internal/openrouter"
)

func TestStoryTranscriptionCanUseAHostedModelWithLocalFallback(t *testing.T) {
	dir := t.TempDir()
	story := filepath.Join(dir, "ggml-story.bin")
	if err := os.WriteFile(story, []byte("synthetic model"), 0600); err != nil {
		t.Fatal(err)
	}
	s, _, _ := routingFixture()
	s.WithNativeModels(NativeOptions{WhisperModel: story, StoryWhisperModel: story})
	ctx := context.Background()
	view, err := s.View(ctx)
	if err != nil {
		t.Fatal(err)
	}
	routes := map[aiprovider.Task]Route{}
	for _, stage := range view.Routes {
		routes[stage.Stage.Stage] = stage.Route
	}
	routes[aiprovider.TaskStoryTranscription] = Route{"openrouter", "elevenlabs/scribe-v2"}
	if _, err = s.Update(ctx, 0, routes, "admin", "Use hosted transcription"); err != nil {
		t.Fatal(err)
	}
	models, err := s.NativeModels(ctx)
	if err != nil || models[aiprovider.TaskTranscription] != story {
		t.Fatalf("hosted story route broke native resolution: %#v %v", models, err)
	}
	if _, exists := models[aiprovider.TaskStoryTranscription]; exists {
		t.Fatal("hosted story route resolved to an installed file")
	}
	generator, err := s.ForTask(ctx, aiprovider.TaskStoryTranscription)
	if err != nil {
		t.Fatal(err)
	}
	if client, ok := generator.(*openrouter.Client); !ok || client.Model != "elevenlabs/scribe-v2" {
		t.Fatalf("hosted transcription client not selected: %#v", generator)
	}
	if _, ok := generator.(aiprovider.Transcriber); !ok {
		t.Fatal("selected client cannot transcribe")
	}

	routes[aiprovider.TaskStoryTranscription] = Route{"openrouter", "vendor/text-only"}
	if _, err = s.Update(ctx, 1, routes, "admin", "Use a chat model for speech"); !errors.Is(err, ErrInvalidConfiguration) {
		t.Fatal("a model without transcription input was accepted", err)
	}
	routes[aiprovider.TaskStoryTranscription] = Route{"openrouter", "elevenlabs/scribe-v2"}
	routes[aiprovider.TaskTranscription] = Route{"openrouter", "elevenlabs/scribe-v2"}
	if _, err = s.Update(ctx, 1, routes, "admin", "Hosted clip transcription"); !errors.Is(err, ErrInvalidConfiguration) {
		t.Fatal("clip transcription has no hosted path and must stay on an installed engine", err)
	}
}
