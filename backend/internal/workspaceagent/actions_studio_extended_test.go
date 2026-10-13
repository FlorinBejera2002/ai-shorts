package workspaceagent

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestStudioDestructivePreviewBindsExactOwnedInspectedTarget(t *testing.T) {
	const project = "11111111-1111-4111-8111-111111111111"
	const user = "22222222-2222-4222-8222-222222222222"
	version := `"sha256:document"`
	assetVersion := `"sha256:asset"`
	asset := strings.Repeat("a", 64)
	render := project + "_render"
	status := "complete"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var a Action
		if err := json.NewDecoder(r.Body).Decode(&a); err != nil {
			t.Error(err)
		}
		switch a.Name {
		case "studio.get":
			_ = json.NewEncoder(w).Encode(map[string]any{"version": version, "layers": []map[string]string{{"id": "title", "text": "Chosen title"}}})
		case "studio.assets.get":
			_ = json.NewEncoder(w).Encode(map[string]any{"version": version, "asset": map[string]string{"asset_id": asset, "name": "logo.png", "expected_asset_version": assetVersion}, "used_by": []any{}, "references_complete": false, "reference_warning": "Stylesheets may also reference this asset."})
		case "studio.renders.list":
			_ = json.NewEncoder(w).Encode(map[string]any{"renders": []map[string]string{{"id": render, "filename": "chosen.mp4", "status": status}}})
		default:
			t.Errorf("preview attempted mutation: %s", a.Name)
			w.WriteHeader(400)
		}
	}))
	defer server.Close()
	client, _ := NewStudioClient(server.URL, strings.Repeat("s", 32))
	e := &PlatformExecutor{studio: client}
	for _, test := range []struct {
		name  string
		input map[string]any
		want  string
	}{
		{"studio.layer.remove", map[string]any{"id": project, "expected_version": version, "element_id": "title"}, "Chosen title"},
		{"studio.assets.delete", map[string]any{"id": project, "asset_id": asset, "expected_version": version, "expected_asset_version": assetVersion}, "Stylesheets may also reference"},
		{"studio.renders.delete", map[string]any{"id": project, "job_id": render}, "chosen.mp4"},
	} {
		preview, err := e.studioApproval(context.Background(), user, Action{Name: test.name, Input: actionJSON(test.input)})
		if err != nil || !strings.Contains(string(preview), test.want) {
			t.Fatalf("preview mismatch %s: %s %v", test.name, preview, err)
		}
	}
	for _, input := range []map[string]any{
		{"id": project, "expected_version": "stale", "element_id": "title"},
		{"id": project, "expected_version": version, "element_id": "missing"},
		{"id": project, "expected_version": version, "element_id": "title", "hf_id": "ambiguous"},
	} {
		if _, err := e.studioApproval(context.Background(), user, Action{Name: "studio.layer.remove", Input: actionJSON(input)}); err == nil {
			t.Fatal("stale or ambiguous layer approved")
		}
	}
	status = "rendering"
	if _, err := e.studioApproval(context.Background(), user, Action{Name: "studio.renders.delete", Input: actionJSON(map[string]string{"id": project, "job_id": render})}); err == nil {
		t.Fatal("active render deletion approved")
	}
}

func TestStudioAssetRenameIsExecutableThroughTheScopedBridge(t *testing.T) {
	const user = "22222222-2222-4222-8222-222222222222"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var action Action
		if err := json.NewDecoder(r.Body).Decode(&action); err != nil || action.Name != "studio.assets.rename" || !strings.Contains(string(action.Input), "renamed.png") {
			t.Fatalf("rename was not sent to the typed bridge: %+v %v", action, err)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"id": user, "asset": map[string]string{"name": "renamed.png"}})
	}))
	defer server.Close()
	client, _ := NewStudioClient(server.URL, strings.Repeat("s", 32))
	e := &PlatformExecutor{studio: client}
	result, err := e.Execute(context.Background(), user, "", Action{Name: "studio.assets.rename", Input: actionJSON(map[string]string{"id": user, "new_name": "renamed.png"})})
	if err != nil || result.Summary != "Studio asset renamed and content verified" {
		t.Fatalf("rename result: %+v %v", result, err)
	}
}
