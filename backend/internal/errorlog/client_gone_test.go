package errorlog

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestMiddlewareIgnoresResponsesToClosedRequests(t *testing.T) {
	recorder := NewRecorder(nil, quietLogger())
	handler := recorder.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	request := httptest.NewRequest(http.MethodGet, "/api/stories", nil).WithContext(ctx)
	handler.ServeHTTP(httptest.NewRecorder(), request)
	if len(recorder.pending) != 0 {
		t.Fatalf("response to a closed request was recorded: %d groups", len(recorder.pending))
	}
}
