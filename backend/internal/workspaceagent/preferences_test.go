package workspaceagent

import (
	"encoding/json"
	"testing"
)

func TestStudioSelectionScopeIsBoundedAndRouteSpecific(t *testing.T) {
	project := "11111111-1111-4111-8111-111111111111"
	good := Scope{Route: "/dashboard/studio", ProjectID: project, StudioSelection: []string{"title"}}
	if !validScope(good) {
		t.Fatal("valid Studio scope rejected")
	}
	good.Route = "/dashboard/create"
	if validScope(good) {
		t.Fatal("selection accepted outside Studio")
	}
	good.Route = "/dashboard/studio"
	good.StudioSelection = make([]string, 21)
	if validScope(good) {
		t.Fatal("unbounded selection accepted")
	}
}

func TestAgentPreferencesOwnedPersistedAndReset(t *testing.T) {
	f := newAgentFixture(t)
	call := func(token, body string) agentPreferences {
		t.Helper()
		method := "POST"
		if body == "" {
			method = "GET"
		}
		w := f.call(method, "/api/workspace-agent/preferences", token, body)
		if w.Code != 200 {
			t.Fatalf("preferences %d %s", w.Code, w.Body.String())
		}
		var out agentPreferences
		if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
			t.Fatal(err)
		}
		return out
	}
	if p := call(f.token, ""); p.Follow || !p.Recommendations {
		t.Fatalf("default %+v", p)
	}
	call(f.token, `{"follow":true}`)
	if p := call(f.token, `{"recommendations":false}`); !p.Follow || p.Recommendations {
		t.Fatalf("merge %+v", p)
	}
	if p := call(f.otherToken, ""); p.Follow || !p.Recommendations {
		t.Fatalf("foreign leak %+v", p)
	}
	if p := call(f.token, `{"reset":true}`); p.Follow || !p.Recommendations {
		t.Fatalf("reset %+v", p)
	}
	if w := f.call("POST", "/api/workspace-agent/preferences", "", `{"follow":true}`); w.Code == 200 {
		t.Fatal("unauthenticated write")
	}
}
func TestClearHistoryPreservesActiveForeignAndRetryIdentity(t *testing.T) {
	f := newAgentFixture(t)
	done := f.create(t)
 if _,err:=f.db.Exec(`INSERT INTO workspace_agent_resources(id,user_id,kind,name,content) VALUES('77777777-7777-4777-8777-777777777777',$1,'document','Preserved brief','Keep this owned resource')`,f.user);err!=nil{t.Fatal(err)}
	if _, err := f.db.Exec(`UPDATE workspace_agent_runs SET status='completed' WHERE id=$1`, done.ID); err != nil {
		t.Fatal(err)
	}
	active := f.create(t)
	if w := f.call("POST", "/api/workspace-agent/history/clear", f.otherToken, `{}`); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	var cleared bool
	if err := f.db.QueryRow(`SELECT history_cleared_at IS NOT NULL FROM workspace_agent_runs WHERE id=$1`, done.ID).Scan(&cleared); err != nil || cleared {
		t.Fatalf("foreign cleared %v %v", cleared, err)
	}
	w := f.call("POST", "/api/workspace-agent/history/clear", f.token, `{}`)
	if w.Code != 200 {
		t.Fatalf("clear %d %s", w.Code, w.Body.String())
	}
	var result struct {
		IDs []string `json:"cleared_ids"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &result)
	if len(result.IDs) != 1 || result.IDs[0] != done.ID {
		t.Fatalf("cleared %+v", result)
	}
	history := f.call("GET", "/api/workspace-agent/runs", f.token, "")
	var page struct {
		Runs []Run `json:"runs"`
	}
	_ = json.Unmarshal(history.Body.Bytes(), &page)
	if len(page.Runs) != 1 || page.Runs[0].ID != active.ID {
		t.Fatalf("history %s", history.Body.String())
	}
	body := encode(createRequest{RequestID: done.ID, Message: done.Message, Context: done.Context})
	if retry := f.call("POST", "/api/workspace-agent/runs", f.token, body); retry.Code != 200 {
		t.Fatalf("retry identity lost %d %s", retry.Code, retry.Body.String())
	}
	var count int
	if err := f.db.QueryRow(`SELECT count(*) FROM workspace_agent_runs`).Scan(&count); err != nil || count != 2 {
		t.Fatalf("technical records lost %d %v", count, err)
	}
 if err:=f.db.QueryRow(`SELECT count(*) FROM workspace_agent_resources WHERE user_id=$1`,f.user).Scan(&count);err!=nil||count!=1{t.Fatalf("owned resource lost %d %v",count,err)}
}
