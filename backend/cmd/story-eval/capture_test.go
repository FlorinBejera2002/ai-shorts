package main

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/aiprovider"
)

type diagnosticProvider struct{}

func (diagnosticProvider) Generate(context.Context, string) (string, error) {
	return `{"complete":true}`, nil
}

func TestHTTPDiagnosticsStoreOnlyStatus(t *testing.T) {
	directory := t.TempDir()
	checkpoints, err := newFileCheckpoints(directory, io.Discard, 1)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(429)
		_, _ = w.Write([]byte("PRIVATE_UPSTREAM_BODY"))
	}))
	defer server.Close()
	request, err := http.NewRequest(http.MethodPost, server.URL+"/?private=PRIVATE_QUERY", strings.NewReader("PRIVATE_REQUEST"))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Authorization", "Bearer PRIVATE_CREDENTIAL")
	transport := diagnosticTransport{inner: http.DefaultTransport, checkpoints: checkpoints}
	response, err := transport.RoundTrip(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	data, err := os.ReadFile(filepath.Join(directory, "checkpoints", "000001-provider-http.json"))
	if err != nil || !strings.Contains(string(data), "429") || strings.Contains(string(data), "PRIVATE_") {
		t.Fatal("HTTP diagnostic leaked request/response data", err)
	}
}
func (diagnosticProvider) ReviewMedia(context.Context, string, []aiprovider.MediaPart) (string, error) {
	return `{"media":true}`, nil
}
func (diagnosticProvider) MediaModelIdentity() string { return "fixture-model" }

func TestCaptureWritesGeneratedResponsesWithoutPromptsOrMedia(t *testing.T) {
	directory := t.TempDir()
	checkpoints, err := newFileCheckpoints(directory, io.Discard, 2)
	if err != nil {
		t.Fatal(err)
	}
	provider := &capturedProvider{Generator: diagnosticProvider{}, checkpoints: checkpoints}
	if _, err = provider.Generate(context.Background(), "PRIVATE_PROMPT"); err != nil {
		t.Fatal(err)
	}
	if _, err = provider.ReviewMedia(context.Background(), "PRIVATE_PROMPT", []aiprovider.MediaPart{{Label: "PRIVATE_LABEL", MIME: "audio/mpeg", Data: []byte("PRIVATE_MEDIA")}}); err != nil {
		t.Fatal(err)
	}
	if provider.MediaModelIdentity() != "fixture-model" {
		t.Fatal("capture changed semantic cache identity")
	}
	files, err := filepath.Glob(filepath.Join(directory, "checkpoints", "*-provider-response.json"))
	if err != nil || len(files) != 2 {
		t.Fatal("missing diagnostics", err)
	}
	for _, file := range files {
		data, err := os.ReadFile(file)
		if err != nil || strings.Contains(string(data), "PRIVATE_") || !strings.Contains(string(data), "response") {
			t.Fatal("captured request instead of generated text", err)
		}
	}
}
