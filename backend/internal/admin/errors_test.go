package admin

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/errorlog"
	"sneepcut/backend-go/internal/testdb"
)

func TestPlatformErrorsRequireAdmin(t *testing.T) {
	requests := []struct{ method, path, body string }{
		{http.MethodGet, "/api/admin/errors", ""},
		{http.MethodGet, "/api/admin/errors/1", ""},
		{http.MethodPatch, "/api/admin/errors/1", `{"resolved":true}`},
	}
	for _, request := range requests {
		for _, role := range []string{"anonymous", "member", "viewer"} {
			t.Run(request.method+request.path+"/"+role, func(t *testing.T) {
				token, status := "", http.StatusUnauthorized
				if role != "anonymous" {
					token, status = routingToken(t, 0), http.StatusForbidden
				}
				r := httptest.NewRequest(request.method, request.path, strings.NewReader(request.body))
				r.Header.Set("Content-Type", "application/json")
				if token != "" {
					r.Header.Set("Authorization", "Bearer "+token)
				}
				w := httptest.NewRecorder()
				// No database: an authorization bypass would reach it and fail.
				billingAdminHTTP(t, nil, role, BillingConfiguration{}).ServeHTTP(w, r)
				if w.Code != status {
					t.Fatalf("got %d, want %d: %s", w.Code, status, w.Body.String())
				}
			})
		}
	}
}

func TestPlatformErrorsListFiltersAndResolve(t *testing.T) {
	db := testdb.Open(t)
	recorder := errorlog.NewRecorder(db, slog.New(slog.NewTextHandler(io.Discard, nil)))
	recorder.Record(errorlog.Event{Source: errorlog.SourceWorker, Kind: errorlog.KindLog, Message: "Worker execution: ffmpeg exited"})
	recorder.Record(errorlog.Event{Source: errorlog.SourceWorker, Kind: errorlog.KindLog, Message: "Worker execution: ffmpeg exited"})
	recorder.Record(errorlog.Event{Source: errorlog.SourceWeb, Kind: errorlog.KindClient, Message: "TypeError: 100%_done is undefined", Route: "/ro/dashboard"})
	recorder.Flush()

	handler := billingAdminHTTP(t, db, "admin", BillingConfiguration{})
	token := routingToken(t, 0)
	var list struct {
		Items []struct {
			ID          int64  `json:"id"`
			Source      string `json:"source"`
			Occurrences int64  `json:"occurrences"`
			LastDay     int64  `json:"lastDay"`
		} `json:"items"`
		Total   int64 `json:"total"`
		Summary struct {
			Open          int64            `json:"open"`
			LastDay       int64            `json:"lastDay"`
			SourceLastDay map[string]int64 `json:"sourceLastDay"`
		} `json:"summary"`
	}
	read := func(path string) {
		t.Helper()
		response := billingAdminRequest(handler, path, token)
		if response.Code != http.StatusOK {
			t.Fatalf("%s: %d %s", path, response.Code, response.Body.String())
		}
		list.Items = nil
		if err := json.Unmarshal(response.Body.Bytes(), &list); err != nil {
			t.Fatal(err)
		}
	}
	read("/api/admin/errors?source=worker")
	if list.Total != 1 || list.Items[0].Occurrences != 2 || list.Items[0].LastDay != 2 || list.Summary.Open != 2 || list.Summary.LastDay != 3 || list.Summary.SourceLastDay["web"] != 1 {
		t.Fatalf("unexpected worker list: %+v", list)
	}
	// LIKE wildcards in the search are literal.
	read("/api/admin/errors?q=" + "100%25_done")
	if list.Total != 1 || list.Items[0].Source != "web" {
		t.Fatalf("literal search failed: %+v", list)
	}
	read("/api/admin/errors?q=" + "1%25")
	if list.Total != 0 {
		t.Fatalf("wildcard must not match: %+v", list)
	}

	read("/api/admin/errors?source=worker")
	groupPath := "/api/admin/errors/" + jsonNumber(list.Items[0].ID)
	patch := httptest.NewRequest(http.MethodPatch, groupPath, strings.NewReader(`{"resolved":true}`))
	patch.Header.Set("Content-Type", "application/json")
	patch.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, patch)
	if w.Code != http.StatusNoContent {
		t.Fatalf("resolve: %d %s", w.Code, w.Body.String())
	}
	read("/api/admin/errors?source=worker")
	if list.Total != 0 {
		t.Fatal("resolved group must leave the open list")
	}
	// A recurrence reopens the group.
	recorder.Record(errorlog.Event{Source: errorlog.SourceWorker, Kind: errorlog.KindLog, Message: "Worker execution: ffmpeg exited"})
	recorder.Flush()
	read("/api/admin/errors?source=worker")
	if list.Total != 1 || list.Items[0].Occurrences != 3 {
		t.Fatalf("recurrence must reopen the group: %+v", list)
	}

	detail := billingAdminRequest(handler, groupPath, token)
	if detail.Code != http.StatusOK || !strings.Contains(detail.Body.String(), `"events":[`) {
		t.Fatalf("detail: %d %s", detail.Code, detail.Body.String())
	}
}

func jsonNumber(value int64) string {
	data, _ := json.Marshal(value)
	return string(data)
}
