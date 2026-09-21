package clips

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/julienschmidt/httprouter"
	"sneepcut/backend-go/internal/identity"
	"sneepcut/backend-go/internal/testdb"
)

func TestPostgresAuthenticatedClipHTTPContracts(t *testing.T) {
	db := testdb.Open(t)
	user, _, clip := seedClip(t, db)
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
	New(db, auth, &fakeMedia{}, Config{}).Register(router)
	call := func(method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+login.AccessToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		return w
	}
	for _, path := range []string{"/api/clips", "/api/clips/" + clip, "/api/clips/library?score=high&page=999", "/api/dashboard/review"} {
		if w := call("GET", path, ""); w.Code != 200 {
			t.Fatalf("%s: %d %s", path, w.Code, w.Body.String())
		}
	}
	w := call("PATCH", "/api/clips/"+clip, `{"title":"New title","hookText":"  New hook  "}`)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"ok":true`) {
		t.Fatal(w.Code, w.Body.String())
	}
	w = call("GET", "/api/clips/"+clip, "")
	var record map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &record)
	if record["hook_text"] != "New hook" || record["caption_tiktok"] != "Fixture caption" || record["transcript_text"] != nil {
		t.Fatal(record)
	}
	w = call("PATCH", "/api/clips/"+clip, `{"title":"`+strings.Repeat("x", 8193)+`"}`)
	if w.Code != 413 {
		t.Fatalf("oversized metadata: %d", w.Code)
	}
	w = call("POST", "/api/clips/"+strings.ToUpper(clip)+"/recut", `{"segments":[{"start":10,"end":13,"order":0},{"start":0,"end":3,"order":1}]}`)
	if w.Code != 202 {
		t.Fatal(w.Code, w.Body.String())
	}
	w = call("GET", "/api/clips/"+clip, "")
	_ = json.Unmarshal(w.Body.Bytes(), &record)
	if record["active_edit_tasks"] != float64(1) || record["edit_status"] != "pending" {
		t.Fatal(record)
	}
	w = call("DELETE", "/api/clips/"+clip, "")
	if w.Code != 409 {
		t.Fatalf("delete active edit: %d", w.Code)
	}
	if _, err = db.Exec(`UPDATE users SET access_role='viewer' WHERE id=$1`, user); err != nil {
		t.Fatal(err)
	}
	w = call("PATCH", "/api/clips/"+clip, `{"title":"Viewer change"}`)
	if w.Code != 403 {
		t.Fatalf("viewer edit: %d", w.Code)
	}
}
