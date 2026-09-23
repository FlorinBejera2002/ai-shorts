package stories

import (
	"context"
	"encoding/json"
	"github.com/julienschmidt/httprouter"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"sneepcut/backend-go/internal/identity"
	"sneepcut/backend-go/internal/story"
	"strings"
	"testing"
	"time"
)

type httpMedia struct{}

func (httpMedia) ValidateUploadSource(_ context.Context, user, key string) (string, error) {
	if !strings.HasPrefix(key, "uploads/"+user+"/") {
		return "", ErrInvalid
	}
	return key, nil
}
func (httpMedia) SignedURL(_ context.Context, key string) (string, error) {
	return "https://media.example.invalid/" + key + "?signed=true", nil
}
func (httpMedia) DeletePrefix(context.Context, string) error { return nil }
func (m httpMedia) ValidateNarrationUploadSource(ctx context.Context, user, key string) (string, error) {
	return m.ValidateUploadSource(ctx, user, key)
}

type httpEngine struct{}

func (httpEngine) Inspect(_ context.Context, key string) (story.Asset, error) {
	return story.Asset{Key: key, Hash: key, Size: 200, Duration: 3, HasAudio: true, Width: 1920, Height: 1080}, nil
}
func (httpEngine) InspectNarration(_ context.Context, key string) (story.Asset, error) {
	if strings.Contains(key, "invalid") {
		return story.Asset{}, ErrInvalid
	}
	return story.Asset{Kind: "narration", Key: key, Hash: key, Size: 200, Duration: 3, HasAudio: true}, nil
}
func (httpEngine) Analyze(context.Context, string, story.Asset, story.Options) (story.Asset, error) {
	return story.Asset{}, nil
}
func (httpEngine) RenderStory(context.Context, story.Request, story.Version) (story.Output, error) {
	return story.Output{}, nil
}
func (httpEngine) ReviewStory(context.Context, story.Request, story.Version) (story.Report, error) {
	return story.Report{}, nil
}

func TestAuthenticatedStoryHTTPContract(t *testing.T) {
	repo, user, id, ids := fixture(t, 5)
	db := repo.db
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
	New(db, auth, httpMedia{}, httpEngine{}, story.DefaultLimits()).Register(router)
	call := func(method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+login.AccessToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		return w
	}
	t.Run("narration registration and replacement", func(t *testing.T) {
		narrationID := newID()
		options := story.DefaultOptions()
		options.Narration = true
		if w := call("POST", "/api/stories", encoded(map[string]any{"id": narrationID, "options": options})); w.Code != 201 {
			t.Fatal(w.Code, w.Body.String())
		}
		assetID := newID()
		input := map[string]any{"id": assetID, "reference": "uploads/" + user + "/voice.webm", "name": "My voice", "kind": "narration"}
		path := "/api/stories/" + narrationID + "/assets"
		w := call("POST", path, encoded(input))
		if w.Code != 201 {
			t.Fatal(w.Code, w.Body.String())
		}
		var response struct {
			Assets []map[string]any `json:"assets"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil || len(response.Assets) != 1 {
			t.Fatal(err, w.Body.String())
		}
		if response.Assets[0]["kind"] != "narration" || response.Assets[0]["source_url"] == nil || response.Assets[0]["key"] != nil {
			t.Fatal(response)
		}
		input["kind"] = "video"
		if w = call("POST", path, encoded(input)); w.Code != 409 {
			t.Fatal("same ID changed kind", w.Code)
		}
		input["kind"] = "narration"
		input["id"] = newID()
		input["replace_asset_id"] = assetID
		input["reference"] = "uploads/" + user + "/invalid.webm"
		if w = call("POST", path, encoded(input)); w.Code != 422 {
			t.Fatal("invalid audio accepted", w.Code)
		}
		p, err := repo.Get(context.Background(), user, narrationID)
		if err != nil || len(p.Assets) != 1 || p.Assets[0].ID != assetID {
			t.Fatal("failed inspection removed old voice", err)
		}
		input["reference"] = "uploads/" + user + "/replacement.webm"
		if w = call("POST", path, encoded(input)); w.Code != 201 {
			t.Fatal(w.Code, w.Body.String())
		}
		if w = call("POST", path, encoded(input)); w.Code != 200 {
			t.Fatal("retry failed", w.Code, w.Body.String())
		}
	})
	w := call("GET", "/api/stories/"+id, "")
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var p map[string]any
	if err = json.Unmarshal(w.Body.Bytes(), &p); err != nil {
		t.Fatal(err)
	}
	for _, a := range p["assets"].([]any) {
		m := a.(map[string]any)
		if m["key"] != nil || m["source_url"] == nil {
			t.Fatal("private key leaked or signed source missing", m)
		}
	}
	if w = call("POST", "/api/stories/"+id+"/assets", encoded(map[string]any{"id": newID(), "reference": "uploads/" + newID() + "/foreign.mp4", "name": "Foreign"})); w.Code != 422 {
		t.Fatal("foreign upload accepted", w.Code)
	}
	if w = call("GET", "/api/stories/"+newID(), ""); w.Code != 404 {
		t.Fatal("ownership disclosure", w.Code)
	}
	if w = call("POST", "/api/stories/"+id+"/generate", encoded(Generate{RequestID: newID(), AssetIDs: ids})); w.Code != 202 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w = call("POST", "/api/stories/"+id+"/cancel", "{}"); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if _, err = db.Exec(`UPDATE users SET access_role='viewer' WHERE id=$1`, user); err != nil {
		t.Fatal(err)
	}
	if w = call("POST", "/api/stories/"+id+"/generate", encoded(Generate{RequestID: newID(), AssetIDs: ids})); w.Code != 403 {
		t.Fatal("viewer mutation", w.Code)
	}
	w = httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/stories", nil))
	if w.Code != 401 {
		t.Fatal("anonymous story list", w.Code)
	}
}
