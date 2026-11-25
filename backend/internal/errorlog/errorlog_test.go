package errorlog

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func quietLogger() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

func onlyPending(t *testing.T, r *Recorder) *pending {
	t.Helper()
	if len(r.pending) != 1 {
		t.Fatalf("want 1 pending group, got %d", len(r.pending))
	}
	for _, item := range r.pending {
		return item
	}
	return nil
}

func TestFingerprintGroupsRepeatedFailuresAndSeparatesRoutes(t *testing.T) {
	first := Event{Source: SourceAPI, Kind: KindLog, Message: "load clip 3f0c2a51-8d4e-4b4f-9a5e-2b7c1d9e0f11: timeout after 4012ms"}
	second := Event{Source: SourceAPI, Kind: KindLog, Message: "load clip 9a1b2c3d-1111-4222-8333-444455556666: timeout after 87ms"}
	if first.Fingerprint() != second.Fingerprint() {
		t.Fatal("failures differing only by IDs and numbers must share a group")
	}
	other := first
	other.Route = "GET /api/clips/:id"
	if other.Fingerprint() == first.Fingerprint() {
		t.Fatal("different routes must not share a group")
	}
}

func TestNormalizeRouteReplacesIdentifiers(t *testing.T) {
	got := NormalizeRoute("/api/clips/3f0c2a51-8d4e-4b4f-9a5e-2b7c1d9e0f11/export/42")
	if got != "/api/clips/:id/export/:id" {
		t.Fatalf("got %q", got)
	}
	if got := NormalizeRoute("/ro/dashboard/clips"); got != "/ro/dashboard/clips" {
		t.Fatalf("plain route changed: %q", got)
	}
}

func TestCaptureRecordsErrorLevelWithCause(t *testing.T) {
	recorder := NewRecorder(nil, quietLogger())
	capture := NewCapture(slog.NewTextHandler(io.Discard, nil), SourceWorker)
	capture.Attach(recorder)
	logger := slog.New(capture).With("job", "a")
	logger.Info("progress")
	logger.Warn("slow")
	logger.Error("Worker execution", "error", "ffmpeg exited with status 1")
	logger.Error("Worker execution", "error", "ffmpeg exited with status 2")
	item := onlyPending(t, recorder)
	if item.count != 2 || item.event.Source != SourceWorker || item.event.Kind != KindLog {
		t.Fatalf("unexpected aggregate: %+v", item)
	}
	if !strings.Contains(item.event.Message, "Worker execution: ffmpeg exited") || !strings.Contains(item.event.Detail, "job=a") {
		t.Fatalf("cause or attributes missing: %+v", item.event)
	}
}

func TestMiddlewareRecordsServerErrorsOnly(t *testing.T) {
	recorder := NewRecorder(nil, quietLogger())
	handler := recorder.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/missing":
			http.NotFound(w, r)
		case "/api/ready":
			w.WriteHeader(http.StatusServiceUnavailable)
		default:
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte(`{"error":"The clip could not be exported"}`))
		}
	}))
	for _, path := range []string{"/api/missing", "/api/ready", "/api/clips/3f0c2a51-8d4e-4b4f-9a5e-2b7c1d9e0f11/export"} {
		handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, path, nil))
	}
	item := onlyPending(t, recorder)
	if item.event.Route != "POST /api/clips/:id/export" || !strings.Contains(item.event.Message, "The clip could not be exported") || item.event.Context["status"] != "500" {
		t.Fatalf("unexpected event: %+v", item.event)
	}
}

func TestClientHandlerValidatesSourceAndDropsQuery(t *testing.T) {
	recorder := NewRecorder(nil, quietLogger())
	post := func(body string) int {
		request := httptest.NewRequest(http.MethodPost, "/api/errors", strings.NewReader(body))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		recorder.ClientHandler(response, request)
		return response.Code
	}
	if code := post(`{"source":"api","message":"x"}`); code != http.StatusBadRequest {
		t.Fatalf("server sources must be rejected, got %d", code)
	}
	if code := post(`{"source":"web","message":"TypeError: x is undefined","page":"/ro/dashboard/clips?token=secret"}`); code != http.StatusNoContent {
		t.Fatalf("got %d", code)
	}
	item := onlyPending(t, recorder)
	if item.event.Context["page"] != "/ro/dashboard/clips" || item.event.Kind != KindClient {
		t.Fatalf("query string must be dropped: %+v", item.event)
	}
}

func TestFlushWritesOneSampleWithAggregatedCount(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	recorder := NewRecorder(db, quietLogger())
	event := Event{Source: SourceAPI, Kind: KindLog, Message: "boom"}
	recorder.Record(event)
	recorder.Record(event)
	mock.ExpectExec("INSERT INTO platform_error_groups").
		WithArgs(event.sanitized().Fingerprint(), SourceAPI, KindLog, "boom", "", 2, sqlmock.AnyArg(), "", "{}").
		WillReturnResult(sqlmock.NewResult(1, 1))
	recorder.Flush()
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
	if len(recorder.pending) != 0 {
		t.Fatal("flush must empty the queue")
	}
}

func TestNilRecorderIsSafe(t *testing.T) {
	var recorder *Recorder
	recorder.Record(Event{Message: "ignored"})
	recorder.Run(context.Background())
	handler := recorder.Middleware(http.NotFoundHandler())
	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/", nil))
}
