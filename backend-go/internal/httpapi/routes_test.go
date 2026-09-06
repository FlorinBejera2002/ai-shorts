package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestFoundationRoutes(t *testing.T) {
	handler := New(slog.New(slog.NewTextHandler(io.Discard, nil)), "test", "test-version")
	for _, tc := range []struct {
		method string
		path   string
		status int
	}{
		{http.MethodGet, "/v1/healthcheck", http.StatusOK},
		{http.MethodGet, "/api/health", http.StatusOK},
		{http.MethodPost, "/v1/healthcheck", http.StatusMethodNotAllowed},
		{http.MethodGet, "/api/jobs", http.StatusNotFound},
		{http.MethodPost, "/api/jobs", http.StatusNotFound},
		{http.MethodGet, "/api/clips", http.StatusNotFound},
		{http.MethodGet, "/debug/vars", http.StatusNotFound},
		{http.MethodPost, "/v1/auth/register", http.StatusNotFound},
	} {
		t.Run(tc.method+tc.path, func(t *testing.T) {
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequest(tc.method, tc.path, nil))
			if response.Code != tc.status {
				t.Fatalf("status = %d, want %d", response.Code, tc.status)
			}
			if response.Header().Get("Content-Type") != "application/json" {
				t.Fatal("expected a JSON response")
			}
			var body map[string]any
			if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
				t.Fatal(err)
			}
			if tc.status == http.StatusOK {
				info, ok := body["system_info"].(map[string]any)
				if !ok || info["version"] != "test-version" || info["environment"] != "test" || body["status"] != "available" {
					t.Fatalf("invalid liveness response: %v", body)
				}
			} else if body["error"] == nil {
				t.Fatal("missing error message")
			}
			if tc.status == http.StatusMethodNotAllowed && !strings.Contains(response.Header().Get("Allow"), "GET") {
				t.Fatal("missing Allow header")
			}
		})
	}
}

func TestPanicRecoveryDoesNotExposeInternalError(t *testing.T) {
	app := &application{logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
	handler := app.recoverPanic(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic("private implementation detail")
	}))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/", nil))
	if response.Code != http.StatusInternalServerError || strings.Contains(response.Body.String(), "private implementation detail") {
		t.Fatalf("unexpected recovery response: %s", response.Body.String())
	}
}
