package main

import (
	"context"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/aiprovider"
	"sneepcut/backend-go/internal/airouting"
	"sneepcut/backend-go/internal/openrouter"
	"sneepcut/backend-go/internal/processing"
)

type evaluationTaskProvider struct {
	selected aiprovider.Generator
	task     aiprovider.Task
}

type evaluationTransport func(*http.Request) (*http.Response, error)

func (f evaluationTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	return f(request)
}

func (*evaluationTaskProvider) Generate(context.Context, string) (string, error) {
	return "", errors.New("evaluation task must be selected")
}

func (p *evaluationTaskProvider) ForTask(_ context.Context, task aiprovider.Task) (aiprovider.Generator, error) {
	p.task = task
	return p.selected, nil
}

func TestCapturePreservesTaskSelectionIdentityAndHTTPDiagnostics(t *testing.T) {
	dir := t.TempDir()
	checkpoints, err := newFileCheckpoints(dir, io.Discard, 1)
	if err != nil {
		t.Fatal(err)
	}
	client := openrouter.New("PRIVATE_KEY", "fixture/reviewer", "")
	client.HTTP.Transport = evaluationTransport(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(`{"choices":[{"message":{"content":"{\"complete\":true}"}}]}`))}, nil
	})
	// Direct providers were already wrapped by older evaluator setup code.
	enableHTTPDiagnostics(client, checkpoints)
	router := &evaluationTaskProvider{selected: client}
	capture := &capturedProvider{Generator: router, checkpoints: checkpoints}
	selected, err := aiprovider.ForTask(context.Background(), capture, aiprovider.TaskStoryReview)
	if err != nil || router.task != aiprovider.TaskStoryReview {
		t.Fatalf("capture lost task selection: %v %v", router.task, err)
	}
	identity, ok := selected.(aiprovider.MediaModelIdentity)
	if !ok || identity.MediaModelIdentity() != "openrouter:fixture/reviewer" {
		t.Fatal("capture lost the selected model's cache identity")
	}
	if _, err := selected.Generate(context.Background(), "PRIVATE_PROMPT"); err != nil {
		t.Fatal(err)
	}
	files, err := filepath.Glob(filepath.Join(dir, "checkpoints", "*-provider-http.json"))
	if err != nil || len(files) != 1 {
		t.Fatalf("task binding lost or duplicated HTTP diagnostics: %v %v", files, err)
	}
	data, err := os.ReadFile(files[0])
	if err != nil || !strings.Contains(string(data), "200") || strings.Contains(string(data), "PRIVATE_") {
		t.Fatal("unsafe HTTP diagnostics", err)
	}
	responses, _ := filepath.Glob(filepath.Join(dir, "checkpoints", "*-provider-response.json"))
	if len(responses) != 1 {
		t.Fatal("selected provider response was not captured")
	}
}

func TestConfiguredEvaluationUsesTaskDefaultsAndRecordsEachModel(t *testing.T) {
	settings := map[string]string{"AI_PROVIDER": "openrouter", "OPENROUTER_API_KEY": "fixture-key", "OPENROUTER_MODEL_NAME": "legacy/global"}
	provider, name, err := evaluationProvider("configured", func(key string) string { return settings[key] })
	if err != nil || name != "openrouter" {
		t.Fatalf("configured evaluation failed: %s %v", name, err)
	}
	models, err := evaluationModels(context.Background(), processing.Config{StoryWhisperModel: "local-story-model.bin"}, provider)
	if err != nil || len(models.TaskModels) != len(airouting.Stages()) || models.ProviderModel != "" {
		t.Fatalf("incomplete task provenance: %#v %v", models, err)
	}
	for _, identity := range models.TaskModels {
		if !strings.HasPrefix(identity, "openrouter:") || strings.Contains(identity, "legacy/global") || strings.Contains(identity, "fixture-key") {
			t.Fatalf("incorrect model provenance: %q", identity)
		}
	}
	if models.TaskModels[aiprovider.TaskStoryPlanning] == models.TaskModels[aiprovider.TaskStoryReview] {
		t.Fatal("evaluation collapsed separate planning and review models")
	}
	offline, err := evaluationModels(context.Background(), processing.Config{}, nil)
	if err != nil || offline.ProviderModel != "offline" || len(offline.TaskModels) != 0 {
		t.Fatalf("offline provenance changed: %#v %v", offline, err)
	}
}
