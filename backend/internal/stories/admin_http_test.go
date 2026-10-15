package stories

import (
	"context"
	"io"
	"log/slog"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/julienschmidt/httprouter"
	"sneepcut/backend-go/internal/identity"
	"sneepcut/backend-go/internal/story"
)

func TestAuthenticatedAdminStoryHTTPContract(t *testing.T) {
	repo, user, _, _ := fixture(t, 0)
	if _, err := repo.db.Exec(`UPDATE users SET access_role='admin',credits=0,password_hash=$2 WHERE id=$1`, user, "$2b$12$tVLZOBSvFOx2sp4u1B6nT.0lG9HQ0XjxYkW72YPuUc1cQTsKGvCY2"); err != nil {
		t.Fatal(err)
	}
	tokens, err := identity.NewTokens(identity.TokenConfig{Secret: strings.Repeat("x", 40), Issuer: "test", Audience: "test", AccessLifetime: time.Minute, RefreshLifetime: time.Hour})
	if err != nil {
		t.Fatal(err)
	}
	service := identity.NewService(identity.NewPostgres(repo.db), tokens)
	login, _, _, err := service.Login(context.Background(), user+"@example.invalid", "dummy-password-not-a-user")
	if err != nil {
		t.Fatal(err)
	}
	auth := identity.NewHandler(service, identity.HTTPConfig{}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	router := httprouter.New()
	New(repo.db, auth, httpMedia{}, httpEngine{}, story.DefaultLimits()).Register(router)
	assertStatus := func(method, path, body string, want int) {
		t.Helper()
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+login.AccessToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		if w.Code != want {
			t.Fatalf("%s %s: got %d, want %d: %s", method, path, w.Code, want, w.Body.String())
		}
	}

	id, assetID := newID(), newID()
	path := "/api/stories/" + id
	options := story.DefaultOptions()
	create := encoded(map[string]any{"id": id, "options": options})
	assertStatus("POST", "/api/stories", create, 201)
	assertStatus("POST", "/api/stories", create, 201)
	var count int
	if err = repo.db.QueryRow(`SELECT count(*) FROM story_projects WHERE id=$1 AND user_id=$2`, id, user).Scan(&count); err != nil || count != 1 {
		t.Fatalf("create retry did not retain one owned project: count=%d err=%v", count, err)
	}
	options.AspectRatio = "1:1"
	assertStatus("POST", "/api/stories", encoded(map[string]any{"id": id, "options": options}), 409)
	assertStatus("PATCH", path, encoded(Patch{Options: &options}), 200)
	upload := encoded(map[string]any{"id": assetID, "reference": "uploads/" + user + "/admin-source.mp4", "name": "Admin source"})
	assertStatus("POST", path+"/assets", upload, 201)
	project, err := repo.Get(context.Background(), user, id)
	if err != nil || project.Options.AspectRatio != "1:1" || len(project.Assets) != 1 || project.Assets[0].ID != assetID {
		t.Fatalf("admin draft changes were not persisted: %+v err=%v", project, err)
	}

	otherUser, otherID := newID(), newID()
	if _, err = repo.db.Exec(`INSERT INTO users(id,email,provider,credits,plan) VALUES($1,$2,'credentials',100,'free')`, otherUser, otherUser+"@example.invalid"); err != nil {
		t.Fatal(err)
	}
	if err = repo.Create(context.Background(), otherUser, otherID, story.DefaultOptions()); err != nil {
		t.Fatal(err)
	}
	otherPath := "/api/stories/" + otherID
	assertStatus("POST", "/api/stories", encoded(map[string]any{"id": otherID, "options": story.DefaultOptions()}), 409)
	assertStatus("GET", otherPath, "", 404)
	assertStatus("PATCH", otherPath, encoded(Patch{Options: &options}), 404)
	assertStatus("POST", otherPath+"/assets", upload, 404)
	assertStatus("POST", otherPath+"/generate", encoded(Generate{RequestID: newID()}), 404)

	generate := encoded(Generate{RequestID: newID(), AssetIDs: []string{assetID}})
	assertStatus("POST", path+"/generate", generate, 202)
	assertStatus("POST", path+"/generate", generate, 202)
	var charged int
	if err = repo.db.QueryRow(`SELECT credits_charged FROM jobs WHERE id=$1 AND user_id=$2`, id, user).Scan(&charged); err != nil || charged != 0 || credits(t, repo, user) != 0 {
		t.Fatalf("admin generation was charged: charged=%d err=%v", charged, err)
	}
	if err = repo.db.QueryRow(`SELECT count(*) FROM story_requests WHERE project_id=$1`, id).Scan(&count); err != nil || count != 1 {
		t.Fatalf("generation retry did not retain one request: count=%d err=%v", count, err)
	}
	assertStatus("POST", path+"/cancel", "{}", 200)
	if credits(t, repo, user) != 0 {
		t.Fatal("admin cancellation changed the zero-charge balance")
	}
	if _, err = repo.db.Exec(`UPDATE users SET access_role='viewer' WHERE id=$1`, user); err != nil {
		t.Fatal(err)
	}
	assertStatus("POST", "/api/stories", encoded(map[string]any{"id": newID(), "options": options}), 403)
	assertStatus("PATCH", path, encoded(Patch{Options: &options}), 403)
	assertStatus("POST", path+"/assets", upload, 403)
	assertStatus("POST", path+"/generate", encoded(Generate{RequestID: newID(), AssetIDs: []string{assetID}}), 403)
	project, err = repo.Get(context.Background(), user, id)
	if err != nil || project.Status != "cancelled" || credits(t, repo, user) != 0 {
		t.Fatalf("viewer requests changed story state: status=%s err=%v", project.Status, err)
	}
}
