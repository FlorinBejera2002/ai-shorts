package jobs

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/julienschmidt/httprouter"
	"sneepcut/backend-go/internal/identity"
	"sneepcut/backend-go/internal/testdb"
)

func TestPostgresAuthenticatedJobHTTPContracts(t *testing.T) {
	db := testdb.Open(t)
	user := seedUser(t, db)
	if _, err := db.Exec(`UPDATE users SET password_hash=$2 WHERE id=$1`, user, "$2b$12$tVLZOBSvFOx2sp4u1B6nT.0lG9HQ0XjxYkW72YPuUc1cQTsKGvCY2"); err != nil {
		t.Fatal(err)
	}
	tokens, err := identity.NewTokens(identity.TokenConfig{Secret: strings.Repeat("x", 40), Issuer: "test", Audience: "test", AccessLifetime: time.Minute, RefreshLifetime: time.Hour})
	if err != nil {
		t.Fatal(err)
	}
	service := identity.NewService(identity.NewPostgres(db), tokens)
	login, _, _, err := service.Login(context.Background(), user+"@example.invalid", "dummy-password-not-a-user")
	if err != nil {
		t.Fatal(err)
	}
	auth := identity.NewHandler(service, identity.HTTPConfig{}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	router := httprouter.New()
	New(db, auth, testMedia{}, Config{LookupIP: func(context.Context, string, string) ([]net.IP, error) { return []net.IP{net.ParseIP("8.8.8.8")}, nil }}).Register(router)
	call := func(method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+login.AccessToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		return w
	}
	w := call("POST", "/api/jobs/batch", `{"source_urls":["https://youtube.com/watch?v=fixture"],"burn_subtitles":false,"smart_crop":false,"language":"ro","subtitle_style":"bold","include_brand":true}`)
	if w.Code != 201 {
		t.Fatalf("batch: %d %s", w.Code, w.Body.String())
	}
	var batch struct {
		Jobs  []map[string]any `json:"jobs"`
		Total int              `json:"total_credits"`
	}
	if err = json.Unmarshal(w.Body.Bytes(), &batch); err != nil {
		t.Fatal(err)
	}
	if batch.Total != 50 || len(batch.Jobs) != 1 || batch.Jobs[0]["progress_message"] != "Queued (batch)" || batch.Jobs[0]["include_brand"] != true || batch.Jobs[0]["language"] != "ro" {
		t.Fatal(batch)
	}
	id := batch.Jobs[0]["id"].(string)
	var payload map[string]any
	var raw []byte
	if err = db.QueryRow(`SELECT payload FROM job_deliveries WHERE job_id=$1`, id).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	_ = json.Unmarshal(raw, &payload)
	if payload["burn_subtitles"] != false || payload["smart_crop"] != false {
		t.Fatal(payload)
	}
	for _, path := range []string{"/api/jobs", "/api/jobs/" + id, "/api/dashboard/history"} {
		if w = call("GET", path, ""); w.Code != 200 {
			t.Fatalf("%s: %d %s", path, w.Code, w.Body.String())
		}
	}
	w = call("GET", "/api/jobs/"+id, "")
	var status map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &status)
	if _, ok := status["job"]; !ok || status["celery_meta"] != nil || status["celery_state"] != nil {
		t.Fatal(status)
	}
	w = call("GET", "/api/dashboard/history", "")
	if !strings.Contains(w.Body.String(), `"sourceFilePath":null`) || !strings.Contains(w.Body.String(), `"_count":{"clips":0}`) {
		t.Fatal(w.Body.String())
	}
	if w = call("POST", "/api/jobs/"+id+"/cancel", ""); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if _, err = db.Exec(`UPDATE users SET access_role='viewer' WHERE id=$1`, user); err != nil {
		t.Fatal(err)
	}
	if w = call("POST", "/api/jobs/"+id+"/cancel", ""); w.Code != 403 {
		t.Fatalf("viewer cancellation: %d", w.Code)
	}
	if w = call("GET", "/api/jobs/"+id, ""); w.Code != 200 {
		t.Fatalf("viewer polling: %d", w.Code)
	}
	w = httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/jobs", nil))
	if w.Code != 401 {
		t.Fatalf("anonymous jobs: %d", w.Code)
	}
}
