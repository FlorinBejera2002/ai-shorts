package workspaceagent

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"sneepcut/backend-go/internal/media"
	"sneepcut/backend-go/internal/projects"
	"sneepcut/backend-go/internal/story"
	"strings"
	"testing"
)

func TestSourceProjectLogoUploadResumesAndAppliesOnlyToOwnedProject(t *testing.T) {
	f := newAgentFixture(t)
	ctx := context.Background()
	project := derivedID("source-logo-project")
	other := derivedID("other-source-logo-project")
	for _, id := range []string{project, other} {
		if _, err := f.db.Exec(`INSERT INTO jobs(id,user_id,source_type,status,progress,num_clips_requested,aspect_ratio,subtitle_style,include_brand,credits_charged) VALUES($1,$2,'upload','completed',100,1,'9:16','default',false,0)`, id, f.user); err != nil {
			t.Fatal(err)
		}
	}
	dir := t.TempDir()
	storage, err := media.NewLocalStorage(filepath.Join(dir, "media"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = storage.Close() })
	service := media.NewService(media.Config{SigningSecret: "synthetic-logo-secret"}, f.db, storage, nil, nil)
	f.handler.SetMedia(service)
	staged := filepath.Join(dir, "logo.png")
	if err = os.WriteFile(staged, []byte("synthetic-validated-upload"), 0600); err != nil {
		t.Fatal(err)
	}
	key := "brand/" + f.user + "/logo.png"
	if err = storage.Save(ctx, staged, key, "image/png"); err != nil {
		t.Fatal(err)
	}
	run := f.create(t)
	run.Context = Scope{Route: "/dashboard/jobs/" + project, ProjectID: project}
	if err = f.handler.waitForResources(ctx, &run, []ResourceNeed{{Kind: "logo", Label: "Project logo"}}); err != nil {
		t.Fatal(err)
	}
	if run.MissingResources[0].TargetID != project {
		t.Fatal("missing exact source target")
	}
	if err = f.handler.save(ctx, &run); err != nil {
		t.Fatal(err)
	}
	if err = f.handler.resourcesReady(ctx, &run); err == nil {
		t.Fatal("resumed without logo")
	}
	input := encode(map[string]any{"kind": "logo", "name": "Logo", "reference": key, "project_id": project})
	if w := f.call(http.MethodPost, "/api/workspace-agent/resources", f.otherToken, input); w.Code != 404 {
		t.Fatalf("foreign project attachment: %d", w.Code)
	}
	w := f.call(http.MethodPost, "/api/workspace-agent/resources", f.token, input)
	if w.Code != 201 {
		t.Fatalf("source logo rejected: %d %s", w.Code, w.Body.String())
	}
	var resource struct {
		ID        string `json:"id"`
		ProjectID string `json:"project_id"`
	}
	if err = json.Unmarshal(w.Body.Bytes(), &resource); err != nil || resource.ProjectID != project || strings.Contains(w.Body.String(), key) {
		t.Fatalf("invalid public resource: %s %v", w.Body.String(), err)
	}
	var storyTarget sql.NullString
	var sourceTarget string
	if err = f.db.QueryRow(`SELECT project_id,source_project_id FROM workspace_agent_resources WHERE id=$1`, resource.ID).Scan(&storyTarget, &sourceTarget); err != nil || storyTarget.Valid || sourceTarget != project {
		t.Fatalf("incorrect resource binding: %+v %s %v", storyTarget, sourceTarget, err)
	}
	if err = f.handler.validateResources(ctx, f.user, []string{resource.ID}, other); err == nil {
		t.Fatal("source logo bound to wrong project")
	}
	path := "/api/workspace-agent/runs/" + run.ID + "/control"
	body := encode(map[string]any{"command": "resume", "revision": run.Revision, "resource_ids": []string{resource.ID}})
	if w = f.call(http.MethodPost, path, f.token, body); w.Code != 200 {
		t.Fatalf("source logo could not resume: %d %s", w.Code, w.Body.String())
	}
	repo := projects.NewRepository(f.db, nil)
	before, err := repo.InspectProjectBrand(ctx, f.user, project)
	if err != nil {
		t.Fatal(err)
	}
	e := NewExecutor(f.db, nil, story.DefaultLimits())
	result, err := e.Execute(ctx, f.user, derivedID("apply-source-logo"), Action{Name: "projects.brand.update", Input: actionJSON(map[string]any{"project_id": project, "expected_state": before.ExpectedState, "logo_resource_id": resource.ID})})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(result.Data), key) {
		t.Fatal("private logo reference leaked")
	}
	after, err := repo.InspectProjectBrand(ctx, f.user, project)
	if err != nil || !after.HasLogo {
		t.Fatalf("logo not confirmed: %+v %v", after, err)
	}
	untouched, err := repo.InspectProjectBrand(ctx, f.user, other)
	if err != nil || untouched.HasLogo {
		t.Fatalf("unrelated project changed: %+v %v", untouched, err)
	}
	if err = storage.Delete(ctx, key); err != nil {
		t.Fatal(err)
	}
	if err = f.handler.validateResources(ctx, f.user, []string{resource.ID}, project); err == nil {
		t.Fatal("missing logo still accepted")
	}
	if err = f.handler.waitForResources(ctx, &run, []ResourceNeed{{Kind: "videos", TargetID: project}}); err == nil {
		t.Fatal("source job accepted story video uploads")
	}
}
