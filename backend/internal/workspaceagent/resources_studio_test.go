package workspaceagent

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
)

func TestStudioResourceWaitVerifiesOwnedInventoryAndResumesSameRequest(t *testing.T) {
	f := newAgentFixture(t)
	project := derivedID("studio-resource-project")
	existing := strings.Repeat("a", 64)
	uploaded := strings.Repeat("b", 64)
	var mu sync.Mutex
	ids := []string{existing}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Name  string `json:"name"`
			Input struct {
				ID   string `json:"id"`
				Page int    `json:"page"`
			} `json:"input"`
		}
		if json.NewDecoder(r.Body).Decode(&body) != nil || body.Name != "studio.assets.list" || body.Input.ID != project || !strings.HasPrefix(r.Header.Get("X-Studio-Agent-Grant"), f.user+":") {
			http.Error(w, "unavailable", 404)
			return
		}
		mu.Lock()
		defer mu.Unlock()
		assets := []map[string]any{}
		for _, id := range ids {
			assets = append(assets, map[string]any{"asset_id": id, "size": 10})
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"id": project, "page": body.Input.Page, "has_more": false, "assets": assets})
	}))
	defer server.Close()
	client, err := NewStudioClient(server.URL, strings.Repeat("s", 32))
	if err != nil {
		t.Fatal(err)
	}
	f.handler.executor = &PlatformExecutor{studio: client}
	run := f.create(t)
	run.Context.Locale = "ro"
	run.Context.ClipID = derivedID("previous-clip")
	if err = f.handler.waitForResources(context.Background(), &run, []ResourceNeed{{Kind: "studio_asset", Label: "Upload the logo", TargetID: project, ExistingAssetIDs: []string{uploaded}}}); err != nil {
		t.Fatal(err)
	}
	if run.Context.ProjectID != project || run.Context.ClipID != "" || !strings.HasPrefix(run.Context.Route, "/dashboard/studio?") || len(run.MissingResources[0].ExistingAssetIDs) != 1 || run.MissingResources[0].ExistingAssetIDs[0] != existing {
		t.Fatalf("wrong owned wait context or planner-controlled baseline: %+v", run)
	}
	if err = f.handler.save(context.Background(), &run); err != nil {
		t.Fatal(err)
	}
	run = f.load(t, run.ID)
	path := "/api/workspace-agent/runs/" + run.ID + "/control"
	body := encode(map[string]any{"command": "resume", "revision": run.Revision})
	if w := f.call(http.MethodPost, path, f.token, body); w.Code != 409 || !strings.Contains(w.Body.String(), "Fișierele cerute pentru Studio nu au fost încărcate complet.") {
		t.Fatalf("old assets satisfied new upload: %d %s", w.Code, w.Body.String())
	}
	if w := f.call(http.MethodPost, path, f.otherToken, body); w.Code != 404 {
		t.Fatalf("foreign run resumed: %d", w.Code)
	}
	mu.Lock()
	ids = []string{existing, uploaded}
	mu.Unlock()
	if w := f.call(http.MethodPost, path, f.token, body); w.Code != 200 {
		t.Fatalf("verified upload not resumed: %d %s", w.Code, w.Body.String())
	}
	resumed := f.load(t, run.ID)
	if resumed.Status != "planning" || resumed.Context.ProjectID != project || len(resumed.MissingResources) != 0 {
		t.Fatalf("wrong resumed request: %+v", resumed)
	}
	if w := f.call(http.MethodPost, path, f.token, body); w.Code != 409 {
		t.Fatalf("stale resume replay accepted: %d", w.Code)
	}
	var count int
	if err = f.db.QueryRow(`SELECT count(*) FROM workspace_agent_runs WHERE user_id=$1`, f.user).Scan(&count); err != nil || count != 1 {
		t.Fatalf("duplicate request: %d %v", count, err)
	}
	foreign := run
	if err = f.handler.waitForResources(context.Background(), &foreign, []ResourceNeed{{Kind: "studio_asset", TargetID: derivedID("foreign-studio")}}); err == nil {
		t.Fatal("unowned Studio target accepted")
	}
	mu.Lock()
	ids = nil
	mu.Unlock()
	if err = f.handler.resourcesReady(context.Background(), &run); err == nil {
		t.Fatal("deleted uploaded file remained ready")
	}
}

func TestStudioResourceInventoryPaginatesAndRejectsUnverifiedResponses(t *testing.T) {
	project, user := derivedID("inventory-project"), derivedID("inventory-user")
	var selectedMode atomic.Value
	selectedMode.Store("valid")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mode := selectedMode.Load().(string)
		var body struct {
			Input struct {
				Page int `json:"page"`
			} `json:"input"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		assets := []map[string]any{}
		if body.Input.Page == 1 {
			for i := 0; i < 200; i++ {
				assets = append(assets, map[string]any{"asset_id": fmt.Sprintf("%064x", i), "size": 10})
			}
		} else {
			assets = append(assets, map[string]any{"asset_id": fmt.Sprintf("%064x", 200), "size": 10})
		}
		id := project
		if mode == "foreign" {
			id = derivedID("other-inventory")
		}
		if mode == "invalid" {
			assets[0]["asset_id"] = "private/storage/path"
		}
		if mode == "empty" {
			assets = []map[string]any{{"asset_id": strings.Repeat("f", 64), "size": 0}}
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"id": id, "page": body.Input.Page, "has_more": body.Input.Page == 1 && mode != "empty", "assets": assets})
	}))
	defer server.Close()
	client, err := NewStudioClient(server.URL, strings.Repeat("s", 32))
	if err != nil {
		t.Fatal(err)
	}
	e := &PlatformExecutor{studio: client}
	ids, err := e.StudioAssetIDs(context.Background(), user, project)
	if err != nil || len(ids) != 201 {
		t.Fatalf("incomplete inventory: %d %v", len(ids), err)
	}
	for _, invalid := range []string{"foreign", "invalid"} {
		selectedMode.Store(invalid)
		if _, err = e.StudioAssetIDs(context.Background(), user, project); err == nil {
			t.Fatalf("accepted %s response", invalid)
		}
	}
	selectedMode.Store("empty")
	if ids, err = e.StudioAssetIDs(context.Background(), user, project); err != nil || len(ids) != 0 {
		t.Fatalf("empty file considered uploaded: %v %v", ids, err)
	}
}
