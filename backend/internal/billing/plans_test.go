package billing

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// synthetic net.Error whose Timeout reports true, like a client deadline.
type timeoutTransportError struct{}

func (timeoutTransportError) Error() string   { return "synthetic deadline with secret-looking text" }
func (timeoutTransportError) Timeout() bool   { return true }
func (timeoutTransportError) Temporary() bool { return true }

func TestPlansReportsClosedRequestWhenClientLeft(t *testing.T) {
	transport := transportFunc(func(*http.Request) (*http.Response, error) {
		return nil, context.Canceled
	})
	s, err := NewService(configForTest(transport), nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	s.plans(w, httptest.NewRequest(http.MethodGet, "/api/stripe/plans", nil))
	if w.Code != 499 {
		t.Fatalf("plans for a closed request: %d %s", w.Code, w.Body.String())
	}
}

func TestPlansReportsProviderOutageAs503(t *testing.T) {
	transport := transportFunc(func(*http.Request) (*http.Response, error) {
		return nil, errors.New("synthetic connection reset")
	})
	s, err := NewService(configForTest(transport), nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	s.plans(w, httptest.NewRequest(http.MethodGet, "/api/stripe/plans", nil))
	if w.Code != http.StatusServiceUnavailable || !strings.Contains(w.Body.String(), "billing_provider_unavailable") {
		t.Fatalf("plans during an outage: %d %s", w.Code, w.Body.String())
	}
}

func TestFailureClassIsRedacted(t *testing.T) {
	cases := []struct {
		name      string
		transport http.RoundTripper
		want      string
	}{
		{"timeout", transportFunc(func(*http.Request) (*http.Response, error) { return nil, timeoutTransportError{} }), "provider_timeout"},
		{"transport", transportFunc(func(*http.Request) (*http.Response, error) {
			return nil, errors.New("synthetic dial tcp 10.0.0.1 secret")
		}), "provider_unavailable"},
		{"rate limit", transportFunc(func(*http.Request) (*http.Response, error) {
			return providerResponse(429, object{"error": object{"code": "rate_limit"}})
		}), "provider_status_429:rate_limit"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s, err := NewService(configForTest(tc.transport), nil, nil)
			if err != nil {
				t.Fatal(err)
			}
			_, _, err = s.price(context.Background(), "creator")
			if got := failureClass(err); got != tc.want {
				t.Fatalf("failureClass = %q, want %q", got, tc.want)
			}
			if strings.Contains(failureClass(err), "secret") || strings.Contains(failureClass(err), "10.0.0.1") {
				t.Fatal("failure class leaked transport text")
			}
		})
	}
}
