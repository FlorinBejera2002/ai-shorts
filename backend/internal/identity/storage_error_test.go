package identity

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/lib/pq"
)

func TestAuthErrorDoesNotReportClosedRequests(t *testing.T) {
	var logs bytes.Buffer
	handler := NewHandler(nil, HTTPConfig{}, slog.New(slog.NewTextHandler(&logs, nil)))
	response := httptest.NewRecorder()
	handler.authError(response, context.Canceled)
	if response.Code != 499 {
		t.Fatalf("status = %d, want 499", response.Code)
	}
	if logs.Len() != 0 {
		t.Fatalf("closed request was logged: %s", logs.String())
	}
}

func TestAuthErrorLogsOnlyTheStorageErrorClass(t *testing.T) {
	var logs bytes.Buffer
	handler := NewHandler(nil, HTTPConfig{}, slog.New(slog.NewTextHandler(&logs, nil)))
	response := httptest.NewRecorder()
	handler.authError(response, errors.New("dial tcp 10.0.0.5: password=hunter2"))
	if response.Code != 503 {
		t.Fatalf("status = %d, want 503", response.Code)
	}
	logged := logs.String()
	if !strings.Contains(logged, "authentication storage operation failed") || !strings.Contains(logged, "error=other") {
		t.Fatalf("missing error class in log: %s", logged)
	}
	if strings.Contains(logged, "hunter2") || strings.Contains(logged, "10.0.0.5") {
		t.Fatalf("log leaked driver text: %s", logged)
	}
	logs.Reset()
	handler.authError(httptest.NewRecorder(), &pq.Error{Code: "57P01", Message: "terminating connection"})
	if !strings.Contains(logs.String(), "error=\"sqlstate 57P01\"") {
		t.Fatalf("SQLSTATE class missing: %s", logs.String())
	}
}
