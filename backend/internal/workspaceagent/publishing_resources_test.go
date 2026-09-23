package workspaceagent

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"sneepcut/backend-go/internal/calendar"
	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/media"
	"sneepcut/backend-go/internal/publishing"
	"sneepcut/backend-go/internal/story"
	"strings"
	"testing"
	"time"
)

func TestPublishingResourcesRequireOwnedExistingMediaAndOpaqueActions(t *testing.T) {
	f := newAgentFixture(t)
	ctx := context.Background()
	dir := t.TempDir()
	storage, err := media.NewLocalStorage(filepath.Join(dir, "media"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = storage.Close() })
	service := media.NewService(media.Config{SigningSecret: "synthetic-signing-secret"}, f.db, storage, nil, nil)
	f.handler.SetMedia(service)
	staged := filepath.Join(dir, "fixture.png")
	if err = os.WriteFile(staged, []byte("validated-upload-fixture"), 0600); err != nil {
		t.Fatal(err)
	}
	key := "publishing/" + f.user + "/fixture.png"
	if err = storage.Save(ctx, staged, key, "image/png"); err != nil {
		t.Fatal(err)
	}
	for _, ref := range []string{"publishing/00000000-0000-0000-0000-000000000001/fixture.png", "publishing/" + f.user + "/missing.png", "uploads/" + f.user + "/fixture.png"} {
		w := f.call(http.MethodPost, "/api/workspace-agent/resources", f.token, encode(map[string]any{"kind": "publishing_media", "name": "Photo", "reference": ref}))
		if w.Code != 422 {
			t.Fatalf("accepted invalid upload %s: %d", ref, w.Code)
		}
	}
	w := f.call(http.MethodPost, "/api/workspace-agent/resources", f.token, encode(map[string]any{"kind": "publishing_media", "name": "Photo", "reference": key}))
	if w.Code != 201 {
		t.Fatalf("resource %d %s", w.Code, w.Body.String())
	}
	var resource struct {
		ID string `json:"id"`
	}
	if err = json.Unmarshal(w.Body.Bytes(), &resource); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(w.Body.String(), key) {
		t.Fatal("exposed internal reference")
	}
	var kind string
	if err = f.db.QueryRow(`SELECT content FROM workspace_agent_resources WHERE id=$1`, resource.ID).Scan(&kind); err != nil || kind != "image" {
		t.Fatalf("type %s %v", kind, err)
	}
	pub, err := publishing.New(f.db, nil, service, publishing.Config{})
	if err != nil {
		t.Fatal(err)
	}
	e := NewExecutor(f.db, nil, story.DefaultLimits())
	e.SetPublishing(calendar.New(f.db, nil, service), pub)
	request, _ := data.NewUUID()
	draft, err := e.calendar.AgentMutate(ctx, f.user, request, "", "", "calendar.create_draft", map[string]any{"title": "Media draft", "platforms": []any{"instagram"}, "accountIds": []any{}, "scheduledAt": time.Now().UTC().Format(time.RFC3339)})
	if err != nil {
		t.Fatal(err)
	}
	run := f.create(t)
	if err = f.handler.waitForResources(ctx, &run, []ResourceNeed{{Kind: "publishing_media", Label: "Upload media", TargetID: draft.ID}}); err != nil {
		t.Fatal(err)
	}
	if err = f.handler.resourcesReady(ctx, &run); err == nil {
		t.Fatal("resumed without uploaded resource")
	}
	run.ResourceIDs = []string{resource.ID}
	if err = f.handler.resourcesReady(ctx, &run); err != nil {
		t.Fatal(err)
	}
	action := Action{Name: "calendar.attach_media", Input: actionJSON(map[string]any{"id": draft.ID, "expected_state": draft.ExpectedState, "resource_ids": []string{resource.ID}})}
	request, _ = data.NewUUID()
	result, err := e.publishingExecute(ctx, f.user, request, action)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(result.Data), key) {
		t.Fatal("model context leaked media reference")
	}
	saved, err := e.calendar.AgentGet(ctx, f.user, draft.ID)
	if err != nil || len(saved.Media) != 1 || saved.Media[0]["type"] != "image" {
		t.Fatalf("attached %+v %v", saved, err)
	}
	foreign, _ := data.NewUUID()
	if _, err = e.publishingExecute(ctx, foreign, request, action); err == nil {
		t.Fatal("foreign attachment")
	}
	action = Action{Name: "calendar.update", Input: actionJSON(map[string]any{"id": draft.ID, "expected_state": saved.ExpectedState, "fields": map[string]any{"media": []any{map[string]any{"type": "image", "reference": key, "name": "Photo"}}}})}
	if _, err = e.publishingExecute(ctx, f.user, request, action); err == nil {
		t.Fatal("accepted raw model reference")
	}
	if err = storage.Delete(ctx, key); err != nil {
		t.Fatal(err)
	}
	if err = f.handler.resourcesReady(ctx, &run); err == nil {
		t.Fatal("resumed with deleted publishing resource")
	}
	action = Action{Name: "calendar.attach_media", Input: actionJSON(map[string]any{"id": draft.ID, "expected_state": saved.ExpectedState, "resource_ids": []string{resource.ID}})}
	request, _ = data.NewUUID()
	if _, err = e.publishingExecute(ctx, f.user, request, action); err == nil {
		t.Fatal("attached physically missing media")
	}
}
