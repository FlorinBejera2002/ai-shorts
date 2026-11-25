package admin

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/testdb"
)

func TestFeedbackRequiresAdmin(t *testing.T) {
	requests := []struct{ method, path, body string }{
		{http.MethodGet, "/api/admin/feedback", ""},
		{http.MethodPatch, "/api/admin/feedback/1", `{"status":"resolved"}`},
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

func TestFeedbackListAndStatus(t *testing.T) {
	db := testdb.Open(t)
	const userID = "5f0c3c8e-8d7f-4f62-9a6f-2a7e3c1b9d01"
	if _, err := db.Exec(`INSERT INTO users(id,email,provider,credits,plan) VALUES($1,'feedback@example.invalid','credentials',0,'free')`, userID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO user_feedback(user_id,kind,category,message) VALUES($1,'problem','clips','Export froze'),($1,'idea','other','More fonts')`, userID); err != nil {
		t.Fatal(err)
	}
	handler := billingAdminHTTP(t, db, "admin", BillingConfiguration{})
	token := routingToken(t, 0)
	list := billingAdminRequest(handler, "/api/admin/feedback?kind=problem", token)
	if list.Code != http.StatusOK || !strings.Contains(list.Body.String(), "Export froze") || strings.Contains(list.Body.String(), "More fonts") {
		t.Fatalf("list: %d %s", list.Code, list.Body.String())
	}
	var id int64
	if err := db.QueryRow(`SELECT id FROM user_feedback WHERE kind='problem'`).Scan(&id); err != nil {
		t.Fatal(err)
	}
	patch := httptest.NewRequest(http.MethodPatch, "/api/admin/feedback/"+jsonNumber(id), strings.NewReader(`{"status":"resolved"}`))
	patch.Header.Set("Content-Type", "application/json")
	patch.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, patch)
	if w.Code != http.StatusNoContent {
		t.Fatalf("resolve: %d %s", w.Code, w.Body.String())
	}
	open := billingAdminRequest(handler, "/api/admin/feedback?kind=problem", token)
	if strings.Contains(open.Body.String(), "Export froze") {
		t.Fatal("resolved feedback must leave the open list")
	}
}
