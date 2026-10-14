package airouting

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"sneepcut/backend-go/internal/aiprovider"
)

func TestNativeModelsOnlyUseInstalledCompatibleFiles(t *testing.T) {
	dir := t.TempDir()
	write := func(name string) string {
		t.Helper()
		path := filepath.Join(dir, name)
		if err := os.WriteFile(path, []byte("synthetic model"), 0600); err != nil {
			t.Fatal(err)
		}
		return path
	}
	base, story, vad, face := write("ggml-base.bin"), write("ggml-story.bin"), write("ggml-vad.bin"), write("facefinder")
	other := write("ggml-small.bin")
	write("unrelated.bin")
	s, store, _ := routingFixture()
	s.WithNativeModels(NativeOptions{WhisperModel: base, StoryWhisperModel: story, VADModel: vad, FaceModel: face})
	ctx := context.Background()
	view, err := s.View(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(view.Routes) != len(Stages())+4 {
		t.Fatalf("native stages missing: %d", len(view.Routes))
	}
	for _, model := range view.Models {
		if model.Name == "unrelated.bin" {
			t.Fatal("arbitrary file exposed")
		}
	}
	routes := map[aiprovider.Task]Route{}
	for _, stage := range view.Routes {
		routes[stage.Stage.Stage] = stage.Route
	}
	routes[aiprovider.TaskStoryTranscription] = Route{"whisper_cpp", nativeID("whisper_cpp", other)}
	if _, err = s.Update(ctx, 0, routes, "admin", "Change installed transcription model"); err != nil {
		t.Fatal(err)
	}
	models, err := s.NativeModels(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if models[aiprovider.TaskStoryTranscription] != other || models[aiprovider.TaskTranscription] != base || models[aiprovider.TaskVoiceDetection] != vad || models[aiprovider.TaskFaceTracking] != face {
		t.Fatalf("incorrect resolution: %#v", models)
	}
	routes[aiprovider.TaskStoryTranscription] = Route{"pigo", nativeID("pigo", face)}
	if _, err = s.Update(ctx, 1, routes, "admin", "Wrong engine"); !errors.Is(err, ErrInvalidConfiguration) {
		t.Fatal("accepted incompatible native engine", err)
	}
	if store.saves != 1 {
		t.Fatal("invalid config saved")
	}
	if err = os.Remove(other); err != nil {
		t.Fatal(err)
	}
	if _, err = s.NativeModels(ctx); !errors.Is(err, ErrInvalidConfiguration) {
		t.Fatal("removed selected model silently replaced", err)
	}
}

func TestNativeDiscoveryDoesNotExposeMissingOrEmptyEngines(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "ggml-base.bin")
	if err := os.WriteFile(path, nil, 0600); err != nil {
		t.Fatal(err)
	}
	s, _, _ := routingFixture()
	s.WithNativeModels(NativeOptions{WhisperModel: path})
	if len(s.stages()) != len(Stages()) || len(s.installedModels()) != 0 {
		t.Fatal("empty model marked installed")
	}
	if models, err := s.NativeModels(context.Background()); err != nil || len(models) != 0 {
		t.Fatal(models, err)
	}
}

func TestPartialNativeInstallationDoesNotRegisterMissingDefault(t *testing.T) {
	dir := t.TempDir()
	base := filepath.Join(dir, "ggml-base.bin")
	if err := os.WriteFile(base, []byte("synthetic model"), 0600); err != nil {
		t.Fatal(err)
	}
	s, _, _ := routingFixture()
	s.WithNativeModels(NativeOptions{WhisperModel: base, StoryWhisperModel: filepath.Join(dir, "missing-story.bin")})
	models, err := s.NativeModels(context.Background())
	if err != nil || models[aiprovider.TaskTranscription] != base {
		t.Fatalf("valid installed model blocked: %#v, %v", models, err)
	}
	if _, exists := s.defaults[aiprovider.TaskStoryTranscription]; exists {
		t.Fatal("missing model exposed as configured")
	}
}

func TestSavedNativeChoiceSurvivesRestartWithoutOriginalDefault(t *testing.T) {
	dir := t.TempDir()
	installed := filepath.Join(dir, "ggml-small.bin")
	if err := os.WriteFile(installed, []byte("synthetic model"), 0600); err != nil {
		t.Fatal(err)
	}
	s, store, _ := routingFixture()
	s.WithNativeModels(NativeOptions{StoryWhisperModel: filepath.Join(dir, "missing-original.bin")})
	store.configuration.Routes[aiprovider.TaskStoryTranscription] = Route{"whisper_cpp", nativeID("whisper_cpp", installed)}
	models, err := s.NativeModels(context.Background())
	if err != nil || models[aiprovider.TaskStoryTranscription] != installed {
		t.Fatalf("saved selection ignored: %#v %v", models, err)
	}
	view, err := s.View(context.Background())
	if err != nil || len(view.Routes) != len(Stages())+1 {
		t.Fatal("saved stage missing from admin", err)
	}
	if err := os.Remove(installed); err != nil {
		t.Fatal(err)
	}
	if _, err := s.NativeModels(context.Background()); !errors.Is(err, ErrInvalidConfiguration) {
		t.Fatal("missing saved model silently replaced", err)
	}
}
