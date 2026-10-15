package workspaceagent

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/account"
	"sneepcut/backend-go/internal/billing"
	"sneepcut/backend-go/internal/brand"
	"sneepcut/backend-go/internal/dashboard"
	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/media"
)

func makeAdmin(t *testing.T, f *agentFixture) {
	t.Helper()
	if _, err := f.db.Exec(`UPDATE users SET access_role='admin',credits=0,plan='free' WHERE id=$1`, f.user); err != nil {
		t.Fatal(err)
	}
}

func TestAdminAgentBypassesAccountRunQuota(t *testing.T) {
	f := newAgentFixture(t)
	for i := 0; i < 3; i++ {
		f.create(t)
	}
	id, _ := data.NewUUID()
	body := encode(createRequest{RequestID: id, Message: "Create project", Context: Scope{Route: "/dashboard"}})
	if w := f.call("POST", "/api/workspace-agent/runs", f.token, body); w.Code != 429 {
		t.Fatalf("member quota missing: %d %s", w.Code, w.Body.String())
	}
	makeAdmin(t, f)
	if w := f.call("POST", "/api/workspace-agent/runs", f.token, body); w.Code != 202 {
		t.Fatalf("admin quota bypass: %d %s", w.Code, w.Body.String())
	}
	run := f.load(t, id)
	f.advance(t, &run)
	f.advance(t, &run)
	if run.Status != "completed" || f.executor.calls != 1 {
		t.Fatalf("admin session failed execution: %+v", run)
	}
}

func TestAdminAgentZeroCostRetainsExternalAndDestructiveApproval(t *testing.T) {
	for _, risk := range []string{"cost", "external", "destructive"} {
		t.Run(risk, func(t *testing.T) {
			f := newAgentFixture(t)
			makeAdmin(t, f)
			f.executor.capabilities[0].CostCredits = 10
			f.executor.capabilities[0].Risk = risk
			run := f.create(t)
			f.advance(t, &run)
			want := "waiting_for_confirmation"
			if risk == "cost" {
				want = "running"
			}
			if run.CostCredits != 0 || run.Status != want || f.executor.calls != 0 {
				t.Fatalf("admin approval policy: %+v", run)
			}
		})
	}
}

func TestAdminDemotionBeforeDispatchRequiresCreditConfirmation(t *testing.T) {
	f := newAgentFixture(t)
	makeAdmin(t, f)
	f.executor.capabilities[0].CostCredits = 10
	run := f.create(t)
	f.advance(t, &run)
	if run.Status != "running" || run.CostCredits != 0 {
		t.Fatalf("admin plan: %+v", run)
	}
	if _, err := f.db.Exec(`UPDATE users SET access_role='member',credits=100 WHERE id=$1`, f.user); err != nil {
		t.Fatal(err)
	}
	f.advance(t, &run)
	if run.Status != "waiting_for_confirmation" || run.CostCredits != 10 || f.executor.calls != 0 {
		t.Fatalf("demoted administrator executed without credit approval: %+v", run)
	}
	w := f.call("POST", "/api/workspace-agent/runs/"+run.ID+"/control", f.token, encode(map[string]any{"command": "approve", "revision": run.Revision}))
	if w.Code != 200 {
		t.Fatalf("member approval: %d %s", w.Code, w.Body.String())
	}
	run = f.load(t, run.ID)
	f.advance(t, &run)
	if run.Status != "completed" || f.executor.calls != 1 {
		t.Fatalf("approved member action: %+v", run)
	}
}

func TestSuspendedAdminCannotContinueAgentRun(t *testing.T) {
	f := newAgentFixture(t)
	makeAdmin(t, f)
	run := f.create(t)
	if _, err := f.db.Exec(`UPDATE users SET account_status='suspended' WHERE id=$1`, f.user); err != nil {
		t.Fatal(err)
	}
	f.advance(t, &run)
	if run.Status != "failed" || f.executor.calls != 0 {
		t.Fatalf("suspended admin dispatched work: %+v", run)
	}
}

func TestAdminSuggestionsHaveNoStaleCreditCharge(t *testing.T) {
	f := newAgentFixture(t)
	// Persist a member proposal, then promote the account. Old stored cards must
	// use the current role both when displayed and when accepted.
	w := f.call("GET", "/api/workspace-agent/suggestions?locale=en", f.token, "")
	if w.Code != 200 || !strings.Contains(w.Body.String(), "10-credit") {
		t.Fatalf("member suggestions: %d %s", w.Code, w.Body.String())
	}
	makeAdmin(t, f)
	w = f.call("GET", "/api/workspace-agent/suggestions?locale=en", f.token, "")
	if w.Code != 200 || strings.Contains(w.Body.String(), "10-credit") || !strings.Contains(w.Body.String(), "unlimited") {
		t.Fatalf("admin suggestions: %d %s", w.Code, w.Body.String())
	}
	id, _ := data.NewUUID()
	suggestion := Suggestion{ID: id, Title: "Generate", Action: Action{Name: "create_project", Input: json.RawMessage(`{}`)}, Context: Scope{Route: "/dashboard"}, CostCredits: 10}
	if _, err := f.db.Exec(`INSERT INTO workspace_agent_suggestions(id,user_id,context_key,content) VALUES($1,$2,$3,$4)`, id, f.user, id, encode(suggestion)); err != nil {
		t.Fatal(err)
	}
	request, _ := data.NewUUID()
	w = f.call("POST", "/api/workspace-agent/runs", f.token, encode(createRequest{RequestID: request, SuggestionID: id, Context: suggestion.Context}))
	if w.Code != 202 {
		t.Fatalf("accept admin proposal: %d %s", w.Code, w.Body.String())
	}
	run := f.load(t, request)
	if run.CostCredits != 0 || run.Status != "running" {
		t.Fatalf("stale proposal charged admin: %+v", run)
	}
}

func TestAdminProposalAcceptancePreservesExternalApproval(t *testing.T) {
	for _, risk := range []string{"external", "destructive"} {
		t.Run(risk, func(t *testing.T) {
			f := newAgentFixture(t)
			makeAdmin(t, f)
			f.executor.capabilities[0].Risk = risk
			id, _ := data.NewUUID()
			suggestion := Suggestion{ID: id, Title: "Confirmed target required", Action: Action{Name: "create_project", Input: json.RawMessage(`{}`)}, Context: Scope{Route: "/dashboard"}, CostCredits: 10}
			if _, err := f.db.Exec(`INSERT INTO workspace_agent_suggestions(id,user_id,context_key,content) VALUES($1,$2,$3,$4)`, id, f.user, id, encode(suggestion)); err != nil {
				t.Fatal(err)
			}
			request, _ := data.NewUUID()
			w := f.call("POST", "/api/workspace-agent/runs", f.token, encode(createRequest{RequestID: request, SuggestionID: id, Context: suggestion.Context}))
			if w.Code != 202 {
				t.Fatalf("accept external proposal: %d %s", w.Code, w.Body.String())
			}
			run := f.load(t, request)
			f.advance(t, &run)
			if run.Status != "waiting_for_confirmation" || run.CostCredits != 0 || f.executor.calls != 0 {
				t.Fatalf("external proposal approval bypass: %+v", run)
			}
		})
	}

}

type emptyAdminClips struct{}

func (emptyAdminClips) Recent(context.Context, string, int) ([]map[string]any, error) {
	return []map[string]any{}, nil
}

func TestAccountEntitlementResponsesFollowCurrentRole(t *testing.T) {
	f := newAgentFixture(t)
	account.New(f.db, f.handler.auth, nil, nil, account.Config{}).Register(f.router)
	brand.New(f.db, f.handler.auth, media.NewService(media.Config{}, f.db, nil, nil, nil)).Register(f.router)
	dashboard.New(f.db, f.handler.auth, emptyAdminClips{}).Register(f.router)
	bills, err := billing.NewService(billing.Config{AppURL: "https://example.invalid"}, f.db, f.handler.auth)
	if err != nil {
		t.Fatal(err)
	}
	bills.Register(f.router)
	for _, role := range []string{"member", "admin", "member"} {
		if _, err := f.db.Exec(`UPDATE users SET access_role=$2,credits=0 WHERE id=$1`, f.user, role); err != nil {
			t.Fatal(err)
		}
		for _, endpoint := range []struct{ path, parent, key string }{
			{"/api/user/credits", "", "creditsUnlimited"},
			{"/api/dashboard", "metrics", "creditsUnlimited"},
			{"/api/stripe/billing", "account", "creditsUnlimited"},
			{"/api/user/brand", "", "canWhiteLabel"},
		} {
			w := f.call("GET", endpoint.path, f.token, "")
			var body map[string]any
			if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &body) != nil {
				t.Fatalf("%s %s: %d %s", role, endpoint.path, w.Code, w.Body.String())
			}
			if endpoint.parent != "" {
				body = body[endpoint.parent].(map[string]any)
			}
			if body[endpoint.key] != (role == "admin") {
				t.Fatalf("%s %s entitlement: %+v", role, endpoint.path, body)
			}
		}
	}
}

func TestAdminAgentCanUpdateProfileAndPreferences(t *testing.T) {
	f := newAgentFixture(t)
	makeAdmin(t, f)
	ctx := context.Background()
	profile, err := account.AgentReadProfile(ctx, f.db, f.user)
	if err != nil {
		t.Fatal(err)
	}
	request, _ := data.NewUUID()
	name := "Admin profile"
	if _, err := account.AgentUpdateProfile(ctx, f.db, f.user, request, profile.ExpectedState, &name, false); err != nil {
		t.Fatalf("admin profile update: %v", err)
	}
	preferences, err := account.AgentReadPreferences(ctx, f.db, f.user)
	if err != nil {
		t.Fatal(err)
	}
	request, _ = data.NewUUID()
	if _, err := account.AgentPatchPreferences(ctx, f.db, f.user, request, preferences.ExpectedState, json.RawMessage(`{"locale":"ro"}`)); err != nil {
		t.Fatalf("admin preference update: %v", err)
	}
}
