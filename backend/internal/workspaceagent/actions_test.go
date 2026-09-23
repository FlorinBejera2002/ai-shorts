package workspaceagent

import (
	"encoding/json"
	"sneepcut/backend-go/internal/stories"
	"sneepcut/backend-go/internal/story"
	"strings"
	"testing"
)

func TestActionInputRejectsUnknownAndTrailingFields(t *testing.T) {
	for _, raw := range []string{`{"id":"x","user_id":"other"}`, `{"id":"x"} {}`, `null`, `[]`, strings.Repeat(" ", 65537)} {
		var target struct {
			ID string `json:"id"`
		}
		if decodeAction(json.RawMessage(raw), &target) == nil {
			t.Fatalf("accepted unsafe input %q", raw[:min(len(raw), 70)])
		}
	}
}
func TestStoryContextDoesNotExposeStorageReferences(t *testing.T) {
	p := stories.Project{Assets: []story.Asset{{ID: "asset", Key: "private-source", ProxyKey: "private-proxy", ThumbnailKey: "private-thumb"}}, Versions: []story.Version{{Number: 1, Output: story.Output{Key: "private-render", ThumbnailKey: "private-render-thumb"}}}}
	raw := string(actionJSON(safeStory(p)))
	if strings.Contains(raw, "private-") {
		t.Fatal("storage references leaked", raw)
	}
}
func TestPendingReceiptCannotBeOmitted(t *testing.T) {
	for _, raw := range []string{`{}`, `{"request_id":"foreign"}`, `null`} {
		if _, err := pendingStoryRequest(ActionResult{Data: json.RawMessage(raw)}); err == nil {
			t.Fatal("invalid receipt accepted")
		}
	}
}
func TestCatalogDoesNotAdvertiseUnavailablePublishing(t *testing.T) {
	catalog := new(PlatformExecutor).Catalog()
	seen := map[string]bool{}
	for _, c := range catalog {
		if seen[c.Name] {
			t.Fatal("duplicate capability", c.Name)
		}
		seen[c.Name] = true
		if !c.Available && c.Limitation == "" {
			t.Fatal("missing limitation", c.Name)
		}
		if c.Name == "publishing.publish" && c.Available {
			t.Fatal("publishing must not bypass provider consent")
		}
	}
}

func TestWorkspaceNavigationUsesOnlySupportedRoutes(t *testing.T) {
	for _, page := range []string{"https://external.invalid", "//external.invalid", "../admin", "scripts?redirect=bad", "unknown"} {
		if _, err := openWorkspace(Action{Input: actionJSON(map[string]any{"page": page})}); err == nil {
			t.Fatalf("unsafe navigation accepted %q", page)
		}
	}
	result, err := openWorkspace(Action{Input: json.RawMessage(`{"page":"scripts"}`)})
	if err != nil || result.Route != "/dashboard/script-generator" || result.Summary != "Page is ready to open" {
		t.Fatalf("navigation result %+v %v", result, err)
	}
	if _, err = openWorkspace(Action{Input: json.RawMessage(`{"page":"home","url":"https://external.invalid"}`)}); err == nil {
		t.Fatal("arbitrary URL field accepted")
	}
}
