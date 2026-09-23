package workspaceagent

import (
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"log/slog"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/julienschmidt/httprouter"
	"golang.org/x/crypto/bcrypt"
	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/identity"
	"sneepcut/backend-go/internal/testdb"
)

type generatorFunc func(context.Context, string) (string, error)

func (f generatorFunc) Generate(ctx context.Context, prompt string) (string, error) {
	return f(ctx, prompt)
}

type fakeExecutor struct {
	mu             sync.Mutex
	calls, cancels int
	execute        func() (ActionResult, error)
	capabilities   []Capability
}

func (f *fakeExecutor) Catalog() []Capability { return f.capabilities }
func (f *fakeExecutor) Context(context.Context, string, Scope) (json.RawMessage, error) {
	return json.RawMessage(`{"projects":[]}`), nil
}
func (f *fakeExecutor) Execute(context.Context, string, string, Action) (ActionResult, error) {
	f.mu.Lock()
	f.calls++
	f.mu.Unlock()
	if f.execute != nil {
		return f.execute()
	}
	return ActionResult{Summary: "Created"}, nil
}
func (f *fakeExecutor) Poll(context.Context, string, Action, ActionResult) (ActionResult, error) {
	return ActionResult{Summary: "Finished"}, nil
}
func (f *fakeExecutor) Cancel(context.Context, string, Action, ActionResult) error {
	f.mu.Lock()
	f.cancels++
	f.mu.Unlock()
	return nil
}

type agentFixture struct {
	db                      *sql.DB
	handler                 *Handler
	router                  *httprouter.Router
	executor                *fakeExecutor
	user, token, otherToken string
}

func newAgentFixture(t *testing.T) *agentFixture {
	t.Helper()
	db := testdb.Open(t)
	hash, err := bcrypt.GenerateFromPassword([]byte("agent-test-password"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	tokens, err := identity.NewTokens(identity.TokenConfig{Secret: strings.Repeat("a", 32), Issuer: "test", Audience: "test", AccessLifetime: time.Minute, RefreshLifetime: time.Hour})
	if err != nil {
		t.Fatal(err)
	}
	service := identity.NewService(identity.NewPostgres(db), tokens)
	seed := func() (string, string) {
		t.Helper()
		id, err := data.NewUUID()
		if err != nil {
			t.Fatal(err)
		}
		if _, err = db.Exec(`INSERT INTO users(id,email,provider,password_hash,credits,plan) VALUES($1,$2,'credentials',$3,100,'free')`, id, id+"@example.invalid", string(hash)); err != nil {
			t.Fatal(err)
		}
		session, _, _, err := service.Login(context.Background(), id+"@example.invalid", "agent-test-password")
		if err != nil {
			t.Fatal(err)
		}
		return id, session.AccessToken
	}
	f := &agentFixture{db: db, executor: &fakeExecutor{capabilities: []Capability{{Name: "create_project", Available: true, Risk: "reversible"}}}}
	f.user, f.token = seed()
	_, f.otherToken = seed()
	auth := identity.NewHandler(service, identity.HTTPConfig{}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	f.handler = New(db, auth, generatorFunc(func(context.Context, string) (string, error) {
		return `{"intent":"execute","reply":"Creating your project","action":{"name":"create_project","input":{"name":"Demo"}}}`, nil
	}), f.executor)
	f.router = httprouter.New()
	f.handler.Register(f.router)
	return f
}
func (f *agentFixture) call(method, path, token, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	f.router.ServeHTTP(w, r)
	return w
}
func (f *agentFixture) create(t *testing.T) Run {
	t.Helper()
	id, err := data.NewUUID()
	if err != nil {
		t.Fatal(err)
	}
	w := f.call("POST", "/api/workspace-agent/runs", f.token, encode(createRequest{RequestID: id, Message: "Create a project", Context: Scope{Route: "/dashboard"}}))
	if w.Code != 202 {
		t.Fatalf("create: %d %s", w.Code, w.Body.String())
	}
	var r Run
	if err = json.Unmarshal(w.Body.Bytes(), &r); err != nil {
		t.Fatal(err)
	}
	return f.load(t, r.ID)
}
func (f *agentFixture) load(t *testing.T, id string) Run {
	t.Helper()
	r, err := f.handler.get(context.Background(), f.user, id)
	if err != nil {
		t.Fatal(err)
	}
	return r
}
func (f *agentFixture) advance(t *testing.T, r *Run) {
	t.Helper()
	if err := f.handler.advance(context.Background(), r); err != nil {
		t.Fatal(err)
	}
	*r = f.load(t, r.ID)
}

func TestRunAdmissionIdempotencyOwnershipAndStrictInput(t *testing.T) {
	f := newAgentFixture(t)
	r := f.create(t)
	body := encode(createRequest{RequestID: r.ID, Message: r.Message, Context: r.Context})
	for _, token := range []string{f.token, f.token} {
		w := f.call("POST", "/api/workspace-agent/runs", token, body)
		if w.Code != 200 {
			t.Fatalf("retry: %d %s", w.Code, w.Body.String())
		}
	}
	var count int
	if err := f.db.QueryRow(`SELECT count(*) FROM workspace_agent_runs`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("duplicate runs: %d %v", count, err)
	}
	w := f.call("POST", "/api/workspace-agent/runs", f.token, strings.Replace(body, r.Message, "Different request", 1))
	if w.Code != 409 {
		t.Fatalf("changed replay: %d", w.Code)
	}
	for _, method := range []string{"GET", "POST"} {
		path := "/api/workspace-agent/runs/" + r.ID
		if method == "POST" {
			path += "/control"
		}
		w = f.call(method, path, f.otherToken, `{"command":"stop","revision":1}`)
		if w.Code != 404 {
			t.Fatalf("foreign %s: %d", method, w.Code)
		}
	}
	w = f.call("GET", "/api/workspace-agent/runs/"+r.ID, "", "")
	if w.Code != 401 {
		t.Fatalf("anonymous read: %d", w.Code)
	}
	for _, field := range []string{`"action":{"name":"delete_account","input":{}}`, `"status":"running"`, `"context":{"route":"/dashboard","user_id":"other"}`} {
		candidate := strings.TrimSuffix(body, "}") + "," + field + "}"
		w = f.call("POST", "/api/workspace-agent/runs", f.token, candidate)
		if w.Code != 400 {
			t.Fatalf("untrusted input accepted: %d %s", w.Code, candidate)
		}
	}
}

func TestStaleApprovalCannotExecute(t *testing.T) {
	f := newAgentFixture(t)
	f.executor.capabilities[0].CostCredits = 10
	r := f.create(t)
	f.advance(t, &r)
	if r.Status != "waiting_for_confirmation" || f.executor.calls != 0 {
		t.Fatalf("billable dispatch without approval: %+v", r)
	}
	w := f.call("POST", "/api/workspace-agent/runs/"+r.ID+"/control", f.token, encode(map[string]any{"command": "approve", "revision": r.Revision - 1}))
	if w.Code != 409 {
		t.Fatalf("stale approval: %d", w.Code)
	}
	r = f.load(t, r.ID)
	f.advance(t, &r)
	if f.executor.calls != 0 {
		t.Fatal("stale approval caused execution")
	}
	w = f.call("POST", "/api/workspace-agent/runs/"+r.ID+"/control", f.token, encode(map[string]any{"command": "approve", "revision": r.Revision}))
	if w.Code != 200 {
		t.Fatalf("current approval: %d %s", w.Code, w.Body.String())
	}
	r = f.load(t, r.ID)
	f.advance(t, &r)
	if r.Status != "completed" || f.executor.calls != 1 {
		t.Fatalf("approved action missing: %+v", r)
	}
}

func TestUndoIsOwnedRevisionCheckedAndIdempotent(t *testing.T) {
	f := newAgentFixture(t)
	receipt := json.RawMessage(`{"name":"scripts.restore","input":{"id":"synthetic","version":2,"body":"Original"}}`)
	f.executor.execute = func() (ActionResult, error) { return ActionResult{Summary: "Updated", Undo: receipt}, nil }
	source := f.create(t)
	// Undo adds a label without exceeding the run-message constraint.
	if _, err := f.db.Exec(`UPDATE workspace_agent_runs SET message=$2 WHERE id=$1`, source.ID, strings.Repeat("ă", 4000)); err != nil {
		t.Fatal(err)
	}
	source = f.load(t, source.ID)
	f.advance(t, &source)
	f.advance(t, &source)
	path := "/api/workspace-agent/runs/" + source.ID + "/control"
	control := func(token string, revision int) *httptest.ResponseRecorder {
		return f.call("POST", path, token, encode(map[string]any{"command": "undo", "revision": revision}))
	}
	if w := control(f.otherToken, source.Revision); w.Code != 404 {
		t.Fatalf("foreign undo: %d", w.Code)
	}
	if w := control(f.token, source.Revision-1); w.Code != 409 {
		t.Fatalf("stale undo: %d", w.Code)
	}
	var undoID string
	for i := 0; i < 2; i++ {
		w := control(f.token, source.Revision)
		if w.Code != 202 {
			t.Fatalf("undo: %d %s", w.Code, w.Body.String())
		}
		var run Run
		if err := json.Unmarshal(w.Body.Bytes(), &run); err != nil {
			t.Fatal(err)
		}
		if i == 0 {
			undoID = run.ID
		} else if undoID != run.ID {
			t.Fatal("repeated undo created another operation")
		}
		if run.ID == source.ID || run.Action == nil || run.Action.Name != "scripts.restore" {
			t.Fatalf("undo action missing: %+v", run)
		}
	}
	undo := f.load(t, undoID)
	f.advance(t, &undo)
	if undo.Status != "completed" || f.executor.calls != 2 {
		t.Fatalf("undo not executed exactly once: %+v calls=%d", undo, f.executor.calls)
	}
	if w := control(f.token, source.Revision); w.Code != 202 {
		t.Fatalf("completed undo replay: %d", w.Code)
	}
	undo = f.load(t, undoID)
	f.advance(t, &undo)
	var count int
	if err := f.db.QueryRow(`SELECT count(*) FROM workspace_agent_runs WHERE user_id=$1`, f.user).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 2 || f.executor.calls != 2 {
		t.Fatalf("undo replay dispatched another mutation: count=%d calls=%d", count, f.executor.calls)
	}
}

func TestUndoRejectsMissingOrUnsupportedReceipt(t *testing.T) {
	for _, receipt := range []json.RawMessage{nil, json.RawMessage(`{"name":"delete_account","input":{}}`)} {
		f := newAgentFixture(t)
		f.executor.execute = func() (ActionResult, error) { return ActionResult{Summary: "Completed", Undo: receipt}, nil }
		r := f.create(t)
		f.advance(t, &r)
		f.advance(t, &r)
		w := f.call("POST", "/api/workspace-agent/runs/"+r.ID+"/control", f.token, encode(map[string]any{"command": "undo", "revision": r.Revision}))
		if w.Code != 409 {
			t.Fatalf("unsupported undo admitted: %d %s", w.Code, w.Body.String())
		}
	}
}

func TestSuggestionsDisplayDismissAndAcceptanceNeverAutoExecute(t *testing.T) {
	f := newAgentFixture(t)
	f.handler.generator = generatorFunc(func(context.Context, string) (string, error) { t.Fatal("suggestions called planner"); return "", nil })
	read := func() []Suggestion {
		t.Helper()
		w := f.call("GET", "/api/workspace-agent/suggestions", f.token, "")
		if w.Code != 200 {
			t.Fatalf("suggestions: %d %s", w.Code, w.Body.String())
		}
		var body struct {
			Suggestions []Suggestion `json:"suggestions"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		return body.Suggestions
	}
	assertNoDomainEffects := func() {
		t.Helper()
		var count int
		if err := f.db.QueryRow(`SELECT (SELECT count(*) FROM story_projects)+(SELECT count(*) FROM scripts)+(SELECT count(*) FROM jobs)+(SELECT count(*) FROM project_folders)`).Scan(&count); err != nil {
			t.Fatal(err)
		}
		if count != 0 || f.executor.calls != 0 {
			t.Fatalf("suggestion interaction mutated platform: resources=%d calls=%d", count, f.executor.calls)
		}
	}
	suggestions := read()
	if len(suggestions) < 2 {
		t.Fatalf("missing suggestions: %+v", suggestions)
	}
	assertNoDomainEffects()
	again := read()
	if len(again) != len(suggestions) || again[0].ID != suggestions[0].ID {
		t.Fatal("suggestion IDs changed on refresh")
	}
	dismissed := suggestions[0].ID
	path := "/api/workspace-agent/suggestions/" + dismissed + "/dismiss"
	if w := f.call("POST", path, f.otherToken, ""); w.Code != 404 {
		t.Fatalf("foreign dismiss: %d", w.Code)
	}
	if w := f.call("POST", path, f.token, ""); w.Code != 204 {
		t.Fatalf("dismiss: %d %s", w.Code, w.Body.String())
	}
	remaining := read()
	if len(remaining) != len(suggestions)-1 {
		t.Fatal("dismissed suggestion remained visible")
	}
	assertNoDomainEffects()
	var acceptedID string
	for i := 0; i < 2; i++ {
		requestID, err := data.NewUUID()
		if err != nil {
			t.Fatal(err)
		}
		w := f.call("POST", "/api/workspace-agent/runs", f.token, encode(createRequest{RequestID: requestID, Context: Scope{Route: "/dashboard"}, SuggestionID: remaining[0].ID}))
		want := 202
		if i > 0 {
			want = 200
		}
		if w.Code != want {
			t.Fatalf("accept: %d %s", w.Code, w.Body.String())
		}
		var r Run
		if err = json.Unmarshal(w.Body.Bytes(), &r); err != nil {
			t.Fatal(err)
		}
		if i == 0 {
			acceptedID = r.ID
		} else if r.ID != acceptedID {
			t.Fatal("double acceptance created another run")
		}
	}
	assertNoDomainEffects()
	var runs int
	if err := f.db.QueryRow(`SELECT count(*) FROM workspace_agent_runs WHERE user_id=$1`, f.user).Scan(&runs); err != nil {
		t.Fatal(err)
	}
	if runs != 1 {
		t.Fatalf("suggestions created extra runs: %d", runs)
	}
	if len(read()) != len(remaining)-1 {
		t.Fatal("accepted suggestion remained visible")
	}
	requestID, err := data.NewUUID()
	if err != nil {
		t.Fatal(err)
	}
	w := f.call("POST", "/api/workspace-agent/runs", f.token, encode(createRequest{RequestID: requestID, Context: Scope{Route: "/dashboard"}, SuggestionID: dismissed}))
	if w.Code != 409 {
		t.Fatalf("dismissed suggestion accepted: %d", w.Code)
	}
}
