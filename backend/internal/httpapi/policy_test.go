package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

type deadlineRecorder struct {
	*httptest.ResponseRecorder
	readDeadline, writeDeadline time.Time
}

func (r *deadlineRecorder) SetReadDeadline(deadline time.Time) error {
	r.readDeadline = deadline
	return nil
}

func (r *deadlineRecorder) SetWriteDeadline(deadline time.Time) error {
	r.writeDeadline = deadline
	return nil
}

func TestPublishingUploadUsesUploadDeadlines(t *testing.T) {
	for _, tc := range []struct {
		method, path                string
		readBudget, operationBudget time.Duration
	}{
		{http.MethodPost, "/api/publishing/media", 10 * time.Minute, 10 * time.Minute},
		{http.MethodGet, "/api/publishing/media/preview", 15 * time.Second, 20 * time.Second},
		{http.MethodPost, "/api/publishing/media/preview", 15 * time.Second, 20 * time.Second},
		{http.MethodPost, "/api/calendar/posts", 15 * time.Second, 20 * time.Second},
	} {
		t.Run(tc.method+tc.path, func(t *testing.T) {
			var operationDeadline time.Time
			handler := Policy(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var ok bool
				operationDeadline, ok = r.Context().Deadline()
				if !ok {
					t.Fatal("missing operation deadline")
				}
				w.WriteHeader(http.StatusNoContent)
			}), PolicyConfig{AllowedHosts: []string{"example.com"}})
			response := &deadlineRecorder{ResponseRecorder: httptest.NewRecorder()}
			before := time.Now()
			handler.ServeHTTP(response, httptest.NewRequest(tc.method, "http://example.com"+tc.path, nil))
			after := time.Now()
			for _, check := range []struct {
				deadline time.Time
				budget   time.Duration
			}{
				{response.readDeadline, tc.readBudget},
				{response.writeDeadline, tc.operationBudget},
				{operationDeadline, tc.operationBudget},
			} {
				if check.deadline.Before(before.Add(check.budget)) || check.deadline.After(after.Add(check.budget)) {
					t.Fatalf("incorrect deadline %v for budget %v", check.deadline, check.budget)
				}
			}
		})
	}
}
