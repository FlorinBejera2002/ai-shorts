package airouting

import (
	"context"
	"errors"
	"testing"

	"sneepcut/backend-go/internal/aiprovider"
	"sneepcut/backend-go/internal/openrouter"
)

func TestTranscriptionStagesUseHostedModels(t *testing.T) {
	s, _, _ := routingFixture()
	ctx := context.Background()
	for _, task := range []aiprovider.Task{aiprovider.TaskTranscription, aiprovider.TaskStoryTranscription} {
		generator, err := s.ForTask(ctx, task)
		if err != nil {
			t.Fatal(err)
		}
		client, ok := generator.(*openrouter.Client)
		if !ok || client.Model != defaultTranscriptionModel {
			t.Fatalf("%s default is not the hosted model: %#v", task, generator)
		}
		if _, ok := generator.(aiprovider.Transcriber); !ok {
			t.Fatalf("%s client cannot transcribe", task)
		}
	}
	view, err := s.View(ctx)
	if err != nil {
		t.Fatal(err)
	}
	routes := map[aiprovider.Task]Route{}
	for _, stage := range view.Routes {
		routes[stage.Stage.Stage] = stage.Route
	}
	routes[aiprovider.TaskStoryTranscription] = Route{"openrouter", "deepgram/nova-3"}
	if _, err = s.Update(ctx, 0, routes, "admin", "Use another hosted transcription"); err != nil {
		t.Fatal(err)
	}
	routes[aiprovider.TaskStoryTranscription] = Route{"openrouter", "vendor/text-only"}
	if _, err = s.Update(ctx, 1, routes, "admin", "Use a chat model for speech"); !errors.Is(err, ErrInvalidConfiguration) {
		t.Fatal("a model without transcription input was accepted", err)
	}
	routes[aiprovider.TaskStoryTranscription] = Route{"gemini", "gemini-3.8-flash"}
	if _, err = s.Update(ctx, 1, routes, "admin", "Use a non-hosted speech provider"); !errors.Is(err, ErrInvalidConfiguration) {
		t.Fatal("transcription accepted a provider without speech-to-text", err)
	}
}

func TestRetiredLocalWhisperRoutesFallBackToHostedDefault(t *testing.T) {
	s, store, _ := routingFixture()
	store.configuration.Routes[aiprovider.TaskStoryTranscription] = Route{"whisper_cpp", "whisper_cpp:ggml-story.bin:0e38e62c"}
	store.configuration.Routes[aiprovider.TaskTranscription] = Route{"whisper_cpp", "whisper_cpp:ggml-story.bin:0e38e62c"}
	route, err := s.RouteForTask(context.Background(), aiprovider.TaskStoryTranscription)
	if err != nil || route.Provider != "openrouter" || route.Model != defaultTranscriptionModel {
		t.Fatalf("retired Whisper route was used: %#v %v", route, err)
	}
	view, err := s.View(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	for _, stage := range view.Routes {
		if stage.Route.Provider == "whisper_cpp" {
			t.Fatal("admin still shows a retired Whisper route")
		}
	}
}
