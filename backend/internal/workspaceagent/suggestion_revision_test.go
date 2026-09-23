package workspaceagent

import (
	"context"
	"encoding/json"
	"sneepcut/backend-go/internal/data"
	"strings"
	"testing"
)

func TestRevisedProposalRequiresItsOwnAcceptanceAndSurvivesReload(t *testing.T) {
	f := newAgentFixture(t)
	response := f.call("GET", "/api/workspace-agent/suggestions?route=/dashboard", f.token, "")
	if response.Code != 200 {
		t.Fatal(response.Code, response.Body.String())
	}
	var list struct {
		Suggestions []Suggestion `json:"suggestions"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &list); err != nil {
		t.Fatal(err)
	}
	var initial Suggestion
	for _, s := range list.Suggestions {
		if s.Action.Name == "stories.create" {
			initial = s
		}
	}
	if initial.ID == "" {
		t.Fatal("missing initial proposal")
	}
	f.handler.generator = generatorFunc(func(context.Context, string) (string, error) {
		return `{"reply":"Use a 45 second landscape montage","options":{"target_seconds":45,"aspect_ratio":"16:9"}}`, nil
	})
	response = f.call("POST", "/api/workspace-agent/suggestions/"+initial.ID+"/revise", f.token, `{"instruction":"45 seconds landscape"}`)
	if response.Code != 200 {
		t.Fatal(response.Code, response.Body.String())
	}
	var revised Suggestion
	if err := json.Unmarshal(response.Body.Bytes(), &revised); err != nil {
		t.Fatal(err)
	}
	if revised.ID == initial.ID || !strings.Contains(string(revised.Action.Input), `"target_seconds":45`) {
		t.Fatal("revision did not bind new options")
	}
	var runs, projects int
	if err := f.db.QueryRow(`SELECT (SELECT count(*) FROM workspace_agent_runs WHERE user_id=$1),(SELECT count(*) FROM story_projects WHERE user_id=$1)`, f.user).Scan(&runs, &projects); err != nil {
		t.Fatal(err)
	}
	if runs != 0 || projects != 0 {
		t.Fatal("revising executed work")
	}
	reload := f.call("GET", "/api/workspace-agent/suggestions?route=/dashboard", f.token, "")
	if reload.Code != 200 || !strings.Contains(reload.Body.String(), revised.ID) || strings.Contains(reload.Body.String(), initial.ID) {
		t.Fatal("revised proposal not preserved", reload.Body.String())
	}
	id, _ := data.NewUUID()
	stale := f.call("POST", "/api/workspace-agent/runs", f.token, encode(createRequest{RequestID: id, SuggestionID: initial.ID, Context: Scope{Route: "/dashboard"}}))
	if stale.Code != 409 {
		t.Fatal("stale proposal accepted", stale.Code, stale.Body.String())
	}
	id, _ = data.NewUUID()
	accepted := f.call("POST", "/api/workspace-agent/runs", f.token, encode(createRequest{RequestID: id, SuggestionID: revised.ID, Context: Scope{Route: "/dashboard"}}))
	if accepted.Code != 202 {
		t.Fatal(accepted.Code, accepted.Body.String())
	}
	var run Run
	if err := json.Unmarshal(accepted.Body.Bytes(), &run); err != nil {
		t.Fatal(err)
	}
	if run.Action == nil || digest(*run.Action) != digest(revised.Action) {
		t.Fatal("accepted parameters changed")
	}
	foreign := f.call("POST", "/api/workspace-agent/suggestions/"+revised.ID+"/revise", f.otherToken, `{"instruction":"change it"}`)
	if foreign.Code == 200 {
		t.Fatal("foreign suggestion access")
	}
}
