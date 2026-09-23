package main

import (
	"context"
	"errors"
	"net/http"
	"sneepcut/backend-go/internal/aiprovider"
	"sneepcut/backend-go/internal/gemini"
	"sneepcut/backend-go/internal/openrouter"
)

// Opt-in generated-text capture for permissioned local evaluations. Request
// prompts, headers and media are deliberately never serialized here.
type capturedProvider struct {
	aiprovider.Generator
	checkpoints *fileCheckpoints
}

// A status number identifies quota, input and server failures without exposing
// provider response bodies or any request metadata.
type diagnosticTransport struct {
	inner       http.RoundTripper
	checkpoints *fileCheckpoints
}

func (d diagnosticTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	response, err := d.inner.RoundTrip(request)
	if response != nil {
		_ = d.checkpoints.append("provider-http", map[string]int{"status": response.StatusCode})
	}
	return response, err
}
func enableHTTPDiagnostics(provider aiprovider.Generator, checkpoints *fileCheckpoints) {
	wrap := func(client *http.Client) *http.Client {
		if client == nil {
			return nil
		}
		copy := *client
		inner := copy.Transport
		if inner == nil {
			inner = http.DefaultTransport
		}
		copy.Transport = diagnosticTransport{inner: inner, checkpoints: checkpoints}
		return &copy
	}
	switch client := provider.(type) {
	case *gemini.Client:
		client.HTTP = wrap(client.HTTP)
	case *openrouter.Client:
		client.HTTP = wrap(client.HTTP)
	}
}

func (c *capturedProvider) capture(kind, response string, err error) (string, error) {
	record := map[string]string{"operation": kind, "response": response}
	if err != nil {
		record["error"] = err.Error()
	}
	if writeErr := c.checkpoints.append("provider-response", record); writeErr != nil {
		return "", writeErr
	}
	return response, err
}
func (c *capturedProvider) Generate(ctx context.Context, prompt string) (string, error) {
	response, err := c.Generator.Generate(ctx, prompt)
	return c.capture("text", response, err)
}
func (c *capturedProvider) ReviewMedia(ctx context.Context, prompt string, parts []aiprovider.MediaPart) (string, error) {
	reviewer, ok := c.Generator.(aiprovider.MediaReviewer)
	if !ok {
		return "", errors.New("configured evaluation provider cannot review media")
	}
	response, err := reviewer.ReviewMedia(ctx, prompt, parts)
	return c.capture("media", response, err)
}
func (c *capturedProvider) MediaModelIdentity() string {
	if identity, ok := c.Generator.(aiprovider.MediaModelIdentity); ok {
		return identity.MediaModelIdentity()
	}
	return "evaluation-provider"
}
