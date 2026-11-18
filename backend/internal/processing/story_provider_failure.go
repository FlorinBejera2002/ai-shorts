package processing

import (
	"context"
	"errors"
	"net/http"

	"sneepcut/backend-go/internal/aiprovider"
)

// These failures cannot recover by paying for another batch with the same
// provider configuration. Leave transient failures eligible for optional review.
func permanentStoryProviderFailure(err error) bool {
	if errors.Is(err, aiprovider.ErrNotConfigured) {
		return true
	}
	var rejected *aiprovider.RequestError
	if !errors.As(err, &rejected) {
		return false
	}
	switch rejected.StatusCode {
	case http.StatusUnauthorized, http.StatusForbidden, http.StatusPaymentRequired, http.StatusNotFound:
		return true
	default:
		return false
	}
}

// Persist only controlled categories. Provider bodies and arbitrary adapter
// errors can contain credentials, prompts or private media references.
func storyProviderFailure(err error) string {
	var rejected *aiprovider.RequestError
	if errors.As(err, &rejected) {
		return rejected.Error()
	}
	switch {
	case errors.Is(err, context.DeadlineExceeded), errors.Is(err, aiprovider.ErrUnavailable):
		return "AI provider timed out or is temporarily unavailable"
	case errors.Is(err, aiprovider.ErrOutputLimit):
		return "AI provider response exceeded the output limit"
	case errors.Is(err, aiprovider.ErrNotConfigured):
		return "AI provider is not configured"
	default:
		return "AI provider could not complete this analysis"
	}
}
