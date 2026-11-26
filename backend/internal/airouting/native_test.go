package airouting

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"sneepcut/backend-go/internal/aiprovider"
)

// Speech transcription is hosted, so its two stages are always present.
const hostedSpeechStages = 2

func writeModel(t *testing.T, dir, name, content string) string {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte(content), 0600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestNativeModelsOnlyUseInstalledCompatibleFiles(t *testing.T) {
	dir := t.TempDir()
	vad, face := writeModel(t, dir, "ggml-silero-v6.2.0.bin", "synthetic model"), writeModel(t, dir, "facefinder", "synthetic model")
	other := writeModel(t, dir, "ggml-silero-v7.bin", "synthetic model")
	writeModel(t, dir, "ggml-story.bin", "retired speech model")
	writeModel(t, dir, "unrelated.bin", "synthetic model")
	s, store, _ := routingFixture()
	s.WithNativeModels(NativeOptions{VADModel: vad, FaceModel: face})
	ctx := context.Background()
	view, err := s.View(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(view.Routes) != len(Stages())+hostedSpeechStages+2 {
		t.Fatalf("native stages missing: %d", len(view.Routes))
	}
	for _, model := range view.Models {
		if model.Name == "unrelated.bin" || model.Name == "ggml-story.bin" {
			t.Fatalf("arbitrary or retired file exposed: %s", model.Name)
		}
	}
	routes := map[aiprovider.Task]Route{}
	for _, stage := range view.Routes {
		routes[stage.Stage.Stage] = stage.Route
	}
	routes[aiprovider.TaskVoiceDetection] = Route{"silero", nativeID("silero", other)}
	if _, err = s.Update(ctx, 0, routes, "admin", "Change installed voice detector"); err != nil {
		t.Fatal(err)
	}
	models, err := s.NativeModels(ctx)
	if err != nil || models[aiprovider.TaskVoiceDetection] != other || models[aiprovider.TaskFaceTracking] != face {
		t.Fatalf("incorrect resolution: %#v %v", models, err)
	}
	routes[aiprovider.TaskVoiceDetection] = Route{"pigo", nativeID("pigo", face)}
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
	path := writeModel(t, dir, "ggml-silero-v6.2.0.bin", "")
	s, _, _ := routingFixture()
	s.WithNativeModels(NativeOptions{VADModel: path})
	if len(s.stages()) != len(Stages())+hostedSpeechStages || len(s.installedModels()) != 0 {
		t.Fatal("empty model marked installed")
	}
	if models, err := s.NativeModels(context.Background()); err != nil || len(models) != 0 {
		t.Fatal(models, err)
	}
}

func TestPartialNativeInstallationDoesNotRegisterMissingDefault(t *testing.T) {
	dir := t.TempDir()
	vad := writeModel(t, dir, "ggml-silero-v6.2.0.bin", "synthetic model")
	s, _, _ := routingFixture()
	s.WithNativeModels(NativeOptions{VADModel: vad, FaceModel: filepath.Join(dir, "missing-facefinder")})
	models, err := s.NativeModels(context.Background())
	if err != nil || models[aiprovider.TaskVoiceDetection] != vad {
		t.Fatalf("valid installed model blocked: %#v, %v", models, err)
	}
	if _, exists := s.defaults[aiprovider.TaskFaceTracking]; exists {
		t.Fatal("missing model exposed as configured")
	}
}

func TestSavedNativeChoiceSurvivesRestartWithoutOriginalDefault(t *testing.T) {
	dir := t.TempDir()
	installed := writeModel(t, dir, "ggml-silero-v7.bin", "synthetic model")
	s, store, _ := routingFixture()
	s.WithNativeModels(NativeOptions{VADModel: filepath.Join(dir, "missing-original.bin")})
	store.configuration.Routes[aiprovider.TaskVoiceDetection] = Route{"silero", nativeID("silero", installed)}
	models, err := s.NativeModels(context.Background())
	if err != nil || models[aiprovider.TaskVoiceDetection] != installed {
		t.Fatalf("saved selection ignored: %#v %v", models, err)
	}
	view, err := s.View(context.Background())
	if err != nil || len(view.Routes) != len(Stages())+hostedSpeechStages+1 {
		t.Fatal("saved stage missing from admin", err)
	}
	if err := os.Remove(installed); err != nil {
		t.Fatal(err)
	}
	if _, err := s.NativeModels(context.Background()); !errors.Is(err, ErrInvalidConfiguration) {
		t.Fatal("missing saved model silently replaced", err)
	}
}
