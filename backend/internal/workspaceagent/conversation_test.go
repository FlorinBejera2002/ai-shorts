package workspaceagent

import (
	"context"
	"errors"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/story"
)

func TestHistoryReferencesAreBoundedAndExcludeSensitiveOrStaleState(t *testing.T) {
	id := derivedID("saved-project")
	raw := actionJSON(map[string]any{"id": id, "title": "Saved project", "expected_state": "stale", "revision": 4, "source_url": "private-signed-url", "document": "untrusted-large-body", "access_token": "secret"})
	refs := historyReferences(raw)
	if len(refs) != 1 || refs[0]["id"] != id || refs[0]["title"] != "Saved project" {
		t.Fatalf("lost target references: %+v", refs)
	}
	encoded := encode(refs)
	for _, hidden := range []string{"stale", "revision", "private-signed-url", "untrusted-large-body", "secret"} {
		if strings.Contains(encoded, hidden) {
			t.Fatalf("history carried hidden or stale data: %s", encoded)
		}
	}
	items := []map[string]any{}
	for i := 0; i < 30; i++ {
		items = append(items, map[string]any{"id": derivedID(strings.Repeat("a", i+1)), "name": strings.Repeat("n", 1000)})
	}
	refs = historyReferences(actionJSON(items))
	if len(refs) != 12 || len(refs[0]["name"]) != 120 {
		t.Fatalf("unbounded references: %+v", refs)
	}
	render := id + "_2026-10-13_export"
	asset := strings.Repeat("a", 64)
	refs = historyReferences(actionJSON(map[string]any{"job_id": render, "asset": map[string]any{"asset_id": asset, "name": "Logo.png"}, "invalid": map[string]any{"asset_id": "private/logo.png", "job_id": "https://signed-private-url"}}))
	if len(refs) != 2 || refs[0]["job_id"] != render || refs[1]["asset_id"] != asset || strings.Contains(encode(refs), "private") {
		t.Fatalf("opaque Studio references were lost or unsafe references retained: %+v", refs)
	}
}

func TestConversationHistoryRetainsVerifiedPartialResultsAndHonorsClearAndOwnership(t *testing.T) {
	f := newAgentFixture(t)
	f.handler.generator = generatorFunc(func(context.Context, string) (string, error) {
		return `{"intent":"execute","reply":"Creating your project","continue":true,"action":{"name":"create_project","input":{"name":"Demo"}}}`, nil
	})
	target := derivedID("created-target")
	f.executor.execute = func() (ActionResult, error) {
		return ActionResult{Summary: "Created project", Data: actionJSON(map[string]any{"id": target, "name": "Demo", "revision": 1})}, nil
	}
	first := f.create(t)
	f.advance(t, &first)
	f.advance(t, &first)
	f.handler.generator = generatorFunc(func(context.Context, string) (string, error) { return "", errors.New("provider unavailable") })
	f.advance(t, &first)
	if first.Status != "failed" || len(first.Steps) != 1 {
		t.Fatalf("expected partial execution: %+v", first)
	}
	otherID, _ := data.NewUUID()
	response := f.call("POST", "/api/workspace-agent/runs", f.otherToken, encode(createRequest{RequestID: otherID, Message: "Other account secret", Context: Scope{Route: "/dashboard"}}))
	if response.Code != 202 {
		t.Fatal(response.Body.String())
	}
	current := f.create(t)
	history, err := f.handler.conversationHistory(context.Background(), current)
	if err != nil || len(history) != 1 || history[0].Status != "failed" || history[0].Steps[0].References[0]["id"] != target {
		t.Fatalf("missing verified partial result: %+v, %v", history, err)
	}
	if strings.Contains(encode(history), "Other account secret") {
		t.Fatal("another account entered conversation history")
	}
	if _, err = f.db.Exec(`UPDATE workspace_agent_runs SET history_cleared_at=now() WHERE id=$1`, first.ID); err != nil {
		t.Fatal(err)
	}
	history, err = f.handler.conversationHistory(context.Background(), current)
	if err != nil || len(history) != 0 {
		t.Fatalf("cleared history remained visible: %+v, %v", history, err)
	}
}

func TestSelectedProjectAndClipContextIncludesOwnedResourceOutsideRecentInventory(t *testing.T) {
	f := newAgentFixture(t)
	e := NewExecutor(f.db, nil, story.DefaultLimits())
	project := derivedID("old-project")
	clip := derivedID("selected-clip")
	if _, err := f.db.Exec(`INSERT INTO jobs(id,user_id,source_type,status,progress,num_clips_requested,aspect_ratio,subtitle_style,include_brand,credits_charged,project_name,source_file_path,project_brand,updated_at) VALUES($1,$2,'upload','completed',100,1,'9:16','default',false,0,'The selected project','private-source-path','{"logoPath":"private-logo-path"}',now()-interval '1 year')`, project, f.user); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 31; i++ {
		id := derivedID(strings.Repeat("new", i+1))
		if _, err := f.db.Exec(`INSERT INTO jobs(id,user_id,source_type,status,progress,num_clips_requested,aspect_ratio,subtitle_style,include_brand,credits_charged) VALUES($1,$2,'upload','completed',100,1,'9:16','default',false,0)`, id, f.user); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := f.db.Exec(`INSERT INTO clips(id,user_id,job_id,title,start_time,end_time,duration,file_path,file_storage_key,viral_score,file_size,resolution,aspect_ratio,has_subtitles) VALUES($1,$2,$3,'Selected clip',0,10,10,'private-clip-path','private-clip-path',8,1024,'1080x1920','9:16',true)`, clip, f.user, project); err != nil {
		t.Fatal(err)
	}
	for _, scope := range []Scope{{Route: "/dashboard/jobs/" + project, ProjectID: project}, {Route: "/dashboard/clips/" + clip, ClipID: clip}} {
		raw, err := e.Context(context.Background(), f.user, scope)
		if err != nil {
			t.Fatal(err)
		}
		for _, required := range []string{`"selected_project"`, `"name":"The selected project"`, `"has_logo":true`, `"has_source":true`} {
			if !strings.Contains(string(raw), required) {
				t.Fatalf("selected resource omitted %s: %s", required, raw)
			}
		}
		if strings.Contains(string(raw), "private-") {
			t.Fatal("context exposed private media references")
		}
		if _, err = e.Context(context.Background(), derivedID("foreign-user"), scope); err == nil {
			t.Fatal("foreign selected context was accepted")
		}
	}
}

func TestDestructiveCapabilitiesWaitForExactPlanConfirmation(t *testing.T) {
	f := newAgentFixture(t)
	f.executor.capabilities[0].Risk = "destructive"
	r := f.create(t)
	f.advance(t, &r)
	f.advance(t, &r)
	if r.Status != "waiting_for_confirmation" || f.executor.calls != 0 {
		t.Fatalf("destructive operation bypassed approval: %+v", r)
	}
}

func TestAcceptedRequestRecoveryDoesNotRevalidateDeletedAttachment(t *testing.T) {
	f := newAgentFixture(t)
	resourceID, _ := data.NewUUID()
	requestID, _ := data.NewUUID()
	if _, err := f.db.Exec(`INSERT INTO workspace_agent_resources(id,user_id,kind,name,content) VALUES($1,$2,'document','Brief','Synthetic brief')`, resourceID, f.user); err != nil {
		t.Fatal(err)
	}
	body := encode(createRequest{RequestID: requestID, Message: "Use this brief", Context: Scope{Route: "/dashboard"}, ResourceIDs: []string{resourceID}})
	response := f.call("POST", "/api/workspace-agent/runs", f.token, body)
	if response.Code != 202 {
		t.Fatalf("admission: %d %s", response.Code, response.Body.String())
	}
	if _, err := f.db.Exec(`DELETE FROM workspace_agent_resources WHERE id=$1 AND user_id=$2`, resourceID, f.user); err != nil {
		t.Fatal(err)
	}
	response = f.call("POST", "/api/workspace-agent/runs", f.token, body)
	if response.Code != 200 || !strings.Contains(response.Body.String(), requestID) {
		t.Fatalf("accepted request could not be recovered: %d %s", response.Code, response.Body.String())
	}
	var count int
	if err := f.db.QueryRow(`SELECT count(*) FROM workspace_agent_runs WHERE user_id=$1`, f.user).Scan(&count); err != nil || count != 1 {
		t.Fatalf("recovery duplicated operation: count=%d error=%v", count, err)
	}
}
