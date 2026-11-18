package aiprovider

import (
	"fmt"
	"strings"
	"testing"
)

func TestRetryableRequestClassifiesWrappedHTTPFailures(t *testing.T) {
	for _, test := range []struct {
		status  int
		retry   bool
		message string
	}{
		{400, false, "rejected"},
		{401, false, "authentication"},
		{402, false, "credit"},
		{403, false, "access"},
		{404, false, "model"},
		{408, true, "temporarily"},
		{429, true, "rate limit"},
		{500, true, "temporarily"},
		{503, true, "temporarily"},
	} {
		err := fmt.Errorf("planning: %w", &RequestError{StatusCode: test.status})
		if RetryableRequest(err) != test.retry || !strings.Contains(err.Error(), test.message) {
			t.Fatalf("wrong classification for %d: %v", test.status, err)
		}
	}
	if RetryableRequest(ErrNotConfigured) || RetryableRequest(ErrOutputLimit) || RetryableRequest(nil) {
		t.Fatal("non-transient failure was classified for retry")
	}
	if !RetryableRequest(fmt.Errorf("planning: %w", ErrUnavailable)) {
		t.Fatal("transport failure cannot be retried")
	}
}

func TestHTTPRequestErrorDistinguishesBudgetFromAccessWithoutLeakingMetadata(t *testing.T) {
	for _, test := range []struct {
		body, source, message string
	}{
		{`{"error":{"message":"private prompt","metadata":{"limit_source":"openrouter_key_limit","remedy_hint":"https://private.invalid/account"}}}`, "openrouter_key_limit", "API-key spending limit"},
		{`{"error":{"metadata":{"limit_source":"openrouter_workspace_budget"}}}`, "openrouter_workspace_budget", "administrator spending limit"},
		{`{"error":{"metadata":{"limit_source":"openrouter_guardrail_budget"}}}`, "openrouter_guardrail_budget", "administrator spending limit"},
		{`{"error":{"metadata":{"limit_source":"private-injected-source"}}}`, "", "authentication or access"},
		{`{"error":{"message":"private secret"}}`, "", "authentication or access"},
		{`not json private secret`, "", "authentication or access"},
		{strings.Repeat(" ", 32<<10) + `{"error":{"metadata":{"limit_source":"openrouter_key_limit"}}}`, "", "authentication or access"},
	} {
		err := HTTPRequestError(403, strings.NewReader(test.body))
		if err.LimitSource != test.source || !strings.Contains(err.Error(), test.message) || strings.Contains(err.Error(), "private") || RetryableRequest(err) {
			t.Fatalf("incorrect/unsafe budget classification: %+v", err)
		}
	}
	if err := HTTPRequestError(401, strings.NewReader(`{"error":{"metadata":{"limit_source":"openrouter_key_limit"}}}`)); err.LimitSource != "" {
		t.Fatal("authentication failure relabelled as budget failure")
	}
}
