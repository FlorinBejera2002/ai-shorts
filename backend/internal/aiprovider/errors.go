package aiprovider

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
)

// RequestError exposes an actionable category, never a provider response body.
// Bodies can contain credentials, account URLs, prompts or source material.
type RequestError struct {
	StatusCode  int
	LimitSource string
}

func (e *RequestError) Error() string {
	switch e.LimitSource {
	case "openrouter_key_limit":
		return "AI provider API-key spending limit was reached"
	case "openrouter_guardrail_budget", "openrouter_workspace_budget":
		return "AI provider workspace or administrator spending limit was reached"
	case "openrouter_credits":
		return "AI provider credits cannot cover this request"
	}
	switch e.StatusCode {
	case http.StatusUnauthorized, http.StatusForbidden:
		return "AI provider authentication or access was rejected"
	case http.StatusPaymentRequired:
		return "AI provider credit or API-key spending limit was reached"
	case http.StatusTooManyRequests:
		return "AI provider rate limit was reached"
	case http.StatusNotFound:
		return "AI provider model or endpoint is unavailable"
	case http.StatusRequestTimeout, http.StatusBadGateway, http.StatusServiceUnavailable, http.StatusGatewayTimeout:
		return "AI provider is temporarily unavailable"
	default:
		if e.StatusCode >= 500 {
			return "AI provider is temporarily unavailable"
		}
		return "AI provider rejected the request"
	}
}

// HTTPRequestError reads only bounded, allowlisted error metadata. In
// particular OpenRouter uses HTTP 403 for exhausted budgets as well as access
// restrictions; status alone would incorrectly suggest replacing a valid key.
// Never retain or surface arbitrary messages, remedy URLs or account details.
func HTTPRequestError(status int, body io.Reader) *RequestError {
	result := &RequestError{StatusCode: status}
	if body == nil || status != http.StatusPaymentRequired && status != http.StatusForbidden {
		return result
	}
	var envelope struct {
		Error struct {
			Metadata struct {
				LimitSource string `json:"limit_source"`
			} `json:"metadata"`
		} `json:"error"`
	}
	if json.NewDecoder(io.LimitReader(body, 32<<10)).Decode(&envelope) != nil {
		return result
	}
	switch envelope.Error.Metadata.LimitSource {
	case "openrouter_key_limit", "openrouter_guardrail_budget", "openrouter_workspace_budget", "openrouter_credits":
		result.LimitSource = envelope.Error.Metadata.LimitSource
	}
	return result
}

// RetryableRequest avoids repeating permanent failures such as exhausted
// credits. Callers own retry limits and charge every attempt to their budget.
func RetryableRequest(err error) bool {
	if errors.Is(err, ErrUnavailable) {
		return true
	}
	var request *RequestError
	return errors.As(err, &request) && (request.StatusCode == http.StatusTooManyRequests || request.StatusCode == http.StatusRequestTimeout || request.StatusCode >= 500)
}

var ErrOutputLimit = errors.New("AI provider response exceeded its output limit; shorten the requested analysis")
var ErrUnavailable = errors.New("AI provider is temporarily unavailable")

// SafeFailure preserves a recognized category through processing wrappers,
// without exposing wrapper messages, transport URLs, prompts or provider bodies.
func SafeFailure(err error) error {
	var request *RequestError
	if errors.As(err, &request) {
		return &RequestError{StatusCode: request.StatusCode, LimitSource: request.LimitSource}
	}
	for _, known := range []error{ErrNotConfigured, ErrOutputLimit, ErrUnavailable} {
		if errors.Is(err, known) {
			return known
		}
	}
	return nil
}
