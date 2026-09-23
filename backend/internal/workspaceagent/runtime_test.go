package workspaceagent

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"testing"
	"time"
)

func TestInvalidControlsCannotRestartTerminalOrUnapprovedRuns(t *testing.T) {
	for _, status := range []string{"completed", "failed", "cancelled", "waiting_for_confirmation"} {
		for _, command := range []string{"resume", "pause", "approve"} {
			if status == "waiting_for_confirmation" && command == "approve" {
				continue
			}
			t.Run(status+"/"+command, func(t *testing.T) {
				r := Run{Status: status, Action: &Action{Name: "create_project"}}
				if err := transition(&r, command); err == nil || r.Status != status {
					t.Fatalf("invalid transition changed operation: %+v %v", r, err)
				}
			})
		}
	}
	r := Run{Status: "waiting_for_confirmation"}
	if err := transition(&r, "approve"); err == nil {
		t.Fatal("approved a run without a validated action")
	}
}

func TestPlanningAnswersAndFailuresNeverExecute(t *testing.T) {
	for _, scenario := range []string{"question", "provider failure", "unsupported action", "malformed", "unknown intent", "missing execute action", "contradictory answer", "contradictory clarification"} {
		t.Run(scenario, func(t *testing.T) {
			f := newAgentFixture(t)
			f.handler.generator = generatorFunc(func(context.Context, string) (string, error) {
				switch scenario {
				case "question":
					return `{"intent":"answer","reply":"Open Projects to create one.","action":null}`, nil
				case "unknown intent":
					return `{"intent":"done","reply":"Finished."}`, nil
				case "missing execute action":
					return `{"intent":"execute","reply":"Doing it","action":null}`, nil
				case "contradictory answer":
					return `{"intent":"answer","reply":"Explanation","action":{"name":"create_project","input":{}}}`, nil
				case "contradictory clarification":
					return `{"intent":"clarify","reply":"Which project?","action":{"name":"create_project","input":{}}}`, nil
				case "provider failure":
					return "", errors.New("secret provider key")
				case "unsupported action":
					return `{"intent":"execute","reply":"Doing it","action":{"name":"delete_account","input":{}}}`, nil
				default:
					return "invalid JSON", nil
				}
			})
			r := f.create(t)
			f.advance(t, &r)
			f.advance(t, &r)
			if f.executor.calls != 0 {
				t.Fatal("planning dispatched an unauthorized action")
			}
			want := "failed"
			if scenario == "question" {
				want = "completed"
			}
			if r.Status != want || strings.Contains(r.Error, "secret") {
				t.Fatalf("unexpected outcome: %+v", r)
			}
		})
	}
}

func TestExecutionRechecksSessionAndPermissions(t *testing.T) {
	for _, change := range []string{"session", "role", "activation", "deletion"} {
		t.Run(change, func(t *testing.T) {
			f := newAgentFixture(t)
			r := f.create(t)
			f.advance(t, &r)
			var query string
			switch change {
			case "session":
				query = `DELETE FROM sessions WHERE user_id=$1`
			case "role":
				query = `UPDATE users SET access_role='viewer' WHERE id=$1`
			case "activation":
				query = `UPDATE users SET email_activation_required=true WHERE id=$1`
			case "deletion":
				query = `INSERT INTO account_deletion_requests(user_id) VALUES($1)`
			}
			if _, err := f.db.Exec(query, f.user); err != nil {
				t.Fatal(err)
			}
			f.advance(t, &r)
			if r.Status != "failed" || f.executor.calls != 0 {
				t.Fatalf("revoked access dispatched: %+v", r)
			}
		})
	}
}

func TestConcurrentControlWinsOverLateExecution(t *testing.T) {
	for _, command := range []string{"pause", "stop"} {
		t.Run(command, func(t *testing.T) {
			f := newAgentFixture(t)
			r := f.create(t)
			f.advance(t, &r)
			f.executor.execute = func() (ActionResult, error) {
				w := f.call("POST", "/api/workspace-agent/runs/"+r.ID+"/control", f.token, encode(map[string]any{"command": command, "revision": r.Revision}))
				if w.Code != 200 {
					t.Fatalf("concurrent control: %d %s", w.Code, w.Body.String())
				}
				return ActionResult{Summary: "Started", Pending: true}, nil
			}
			f.advance(t, &r)
			want := "paused"
			if command == "stop" {
				want = "cancel_requested"
			}
			if r.Status != want || r.Result == nil || !r.Result.Pending || f.executor.calls != 1 {
				t.Fatalf("late result overrode control: %+v", r)
			}
			f.advance(t, &r)
			if command == "stop" && (r.Status != "cancelled" || f.executor.cancels != 1) {
				t.Fatalf("pending job was not cancelled: %+v", r)
			}
			if f.executor.calls != 1 {
				t.Fatal("late result replayed action")
			}
		})
	}
}

func TestInterruptedDispatchIsNeverReplayed(t *testing.T) {
	f := newAgentFixture(t)
	r := f.create(t)
	f.advance(t, &r)
	if _, err := f.db.Exec(`UPDATE workspace_agent_runs SET executing=true WHERE id=$1`, r.ID); err != nil {
		t.Fatal(err)
	}
	f.advance(t, &r)
	f.advance(t, &r)
	if r.Status != "failed" || f.executor.calls != 0 || !strings.Contains(r.Error, "uncertain") {
		t.Fatalf("uncertain dispatch replayed: %+v", r)
	}
}

func TestResumeAfterLateCompletedResultDoesNotRepeatMutation(t *testing.T) {
	f := newAgentFixture(t)
	r := f.create(t)
	f.advance(t, &r)
	f.executor.execute = func() (ActionResult, error) {
		w := f.call("POST", "/api/workspace-agent/runs/"+r.ID+"/control", f.token, encode(map[string]any{"command": "pause", "revision": r.Revision}))
		if w.Code != 200 {
			t.Fatalf("pause: %d %s", w.Code, w.Body.String())
		}
		return ActionResult{Summary: "Created once", Pending: false}, nil
	}
	f.advance(t, &r)
	if r.Status != "paused" || r.Result == nil || r.Result.Pending {
		t.Fatalf("lost completed result: %+v", r)
	}
	w := f.call("POST", "/api/workspace-agent/runs/"+r.ID+"/control", f.token, encode(map[string]any{"command": "resume", "revision": r.Revision}))
	if w.Code != 200 {
		t.Fatalf("resume: %d %s", w.Code, w.Body.String())
	}
	r = f.load(t, r.ID)
	f.advance(t, &r)
	if f.executor.calls != 1 || r.Status != "completed" {
		t.Fatalf("resume repeated a completed mutation: calls=%d run=%+v", f.executor.calls, r)
	}
}

func TestPauseResumePreservesUncertainDispatchCheckpoint(t *testing.T) {
	f := newAgentFixture(t)
	r := f.create(t)
	f.advance(t, &r)
	if _, err := f.db.Exec(`UPDATE workspace_agent_runs SET executing=true WHERE id=$1`, r.ID); err != nil {
		t.Fatal(err)
	}
	for _, command := range []string{"pause", "resume"} {
		w := f.call("POST", "/api/workspace-agent/runs/"+r.ID+"/control", f.token, encode(map[string]any{"command": command, "revision": r.Revision}))
		if w.Code != 200 {
			t.Fatalf("%s: %d %s", command, w.Code, w.Body.String())
		}
		r = f.load(t, r.ID)
	}
	f.advance(t, &r)
	if f.executor.calls != 0 || r.Status != "failed" {
		t.Fatalf("control erased uncertain dispatch checkpoint: calls=%d run=%+v", f.executor.calls, r)
	}
}

func TestStaleCheckpointCannotOverwriteControlOrAppendAnEvent(t *testing.T) {
	f := newAgentFixture(t)
	r := f.create(t)
	stale := r
	w := f.call("POST", "/api/workspace-agent/runs/"+r.ID+"/control", f.token, encode(map[string]any{"command": "pause", "revision": r.Revision}))
	if w.Code != 200 {
		t.Fatalf("pause: %d %s", w.Code, w.Body.String())
	}
	stale.Status = "completed"
	stale.Reply = "Late provider result"
	if err := f.handler.save(context.Background(), &stale); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale save: %v", err)
	}
	current := f.load(t, r.ID)
	if current.Status != "paused" || current.Reply == stale.Reply {
		t.Fatalf("stale checkpoint replaced user control: %+v", current)
	}
	var events int
	if err := f.db.QueryRow(`SELECT count(*) FROM workspace_agent_events WHERE run_id=$1 AND status='completed'`, r.ID).Scan(&events); err != nil {
		t.Fatal(err)
	}
	if events != 0 {
		t.Fatal("rejected checkpoint leaked a completed event")
	}
}

func TestMultistepRequestUsesVerifiedResultAndApprovesBillableStep(t *testing.T) {
	f := newAgentFixture(t)
	f.executor.capabilities = []Capability{{Name: "read_script", Available: true}, {Name: "update_script", Available: true, CostCredits: 5}}
	plans := 0
	f.handler.generator = generatorFunc(func(_ context.Context, prompt string) (string, error) {
		plans++
		if plans == 1 {
			return `{"intent":"execute","reply":"Reading the script","continue":true,"action":{"name":"read_script","input":{"id":"synthetic"}}}`, nil
		}
		if !strings.Contains(prompt, `"summary":"Verified script content"`) {
			t.Fatal("next planner lacks verified prior result")
		}
		return `{"intent":"execute","reply":"Updating the script","continue":false,"action":{"name":"update_script","input":{"id":"synthetic","body":"Updated"}}}`, nil
	})
	f.executor.execute = func() (ActionResult, error) { return ActionResult{Summary: "Verified script content"}, nil }
	r := f.create(t)
	f.advance(t, &r)
	f.advance(t, &r)
	if r.Status != "planning" || len(r.Steps) != 1 || f.executor.calls != 1 {
		t.Fatalf("first step not checkpointed: %+v", r)
	}
	f.advance(t, &r)
	if r.Status != "waiting_for_confirmation" || f.executor.calls != 1 {
		t.Fatalf("billable next step bypassed confirmation: %+v", r)
	}
	w := f.call("POST", "/api/workspace-agent/runs/"+r.ID+"/control", f.token, encode(map[string]any{"command": "approve", "revision": r.Revision}))
	if w.Code != 200 {
		t.Fatalf("approve: %d %s", w.Code, w.Body.String())
	}
	r = f.load(t, r.ID)
	f.advance(t, &r)
	if r.Status != "completed" || len(r.Steps) != 2 || f.executor.calls != 2 || plans != 2 {
		t.Fatalf("multistep result: %+v calls=%d plans=%d", r, f.executor.calls, plans)
	}
}

func TestMultistepPlannerCannotRepeatCompletedAction(t *testing.T) {
	f := newAgentFixture(t)
	f.handler.generator = generatorFunc(func(context.Context, string) (string, error) {
		return `{"intent":"execute","reply":"Creating project","continue":true,"action":{"name":"create_project","input":{"name":"Demo"}}}`, nil
	})
	r := f.create(t)
	f.advance(t, &r)
	f.advance(t, &r)
	f.advance(t, &r)
	if r.Status != "failed" || f.executor.calls != 1 || len(r.Steps) != 1 {
		t.Fatalf("planner repeated mutation: %+v calls=%d", r, f.executor.calls)
	}
}

func TestPauseAfterUncertainExecutionFailureCannotRetryMutation(t *testing.T) {
	f := newAgentFixture(t)
	r := f.create(t)
	f.advance(t, &r)
	f.executor.execute = func() (ActionResult, error) {
		w := f.call("POST", "/api/workspace-agent/runs/"+r.ID+"/control", f.token, encode(map[string]any{"command": "pause", "revision": r.Revision}))
		if w.Code != 200 {
			t.Fatalf("pause: %d %s", w.Code, w.Body.String())
		}
		return ActionResult{}, errors.New("connection lost after downstream accepted mutation")
	}
	f.advance(t, &r)
	if r.Status == "paused" {
		w := f.call("POST", "/api/workspace-agent/runs/"+r.ID+"/control", f.token, encode(map[string]any{"command": "resume", "revision": r.Revision}))
		if w.Code != 200 {
			t.Fatalf("resume: %d %s", w.Code, w.Body.String())
		}
		r = f.load(t, r.ID)
		f.advance(t, &r)
	}
	if f.executor.calls != 1 || r.Status != "failed" {
		t.Fatalf("uncertain mutation repeated after pause: calls=%d run=%+v", f.executor.calls, r)
	}
}

func TestRevocationCancelsOnlyTheAlreadyDispatchedPendingOperation(t *testing.T) {
	f := newAgentFixture(t)
	f.executor.execute = func() (ActionResult, error) { return ActionResult{Summary: "Queued", Pending: true}, nil }
	r := f.create(t)
	f.advance(t, &r)
	f.advance(t, &r)
	if r.Result == nil || !r.Result.Pending {
		t.Fatalf("missing pending job: %+v", r)
	}
	if _, err := f.db.Exec(`DELETE FROM sessions WHERE user_id=$1`, f.user); err != nil {
		t.Fatal(err)
	}
	f.advance(t, &r)
	f.advance(t, &r)
	if r.Status != "failed" || f.executor.calls != 1 || f.executor.cancels != 1 {
		t.Fatalf("revocation left pending work active or dispatched again: %+v calls=%d cancels=%d", r, f.executor.calls, f.executor.cancels)
	}
}

func TestConcurrentWorkersShareDatabaseDispatchLock(t *testing.T) {
	f := newAgentFixture(t)
	r := f.create(t)
	f.advance(t, &r)
	if _, err := f.db.Exec(`UPDATE workspace_agent_runs SET next_check_at=now() WHERE id=$1`, r.ID); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	started := make(chan struct{}, 2)
	release := make(chan struct{})
	firstDone := make(chan struct{})
	secondDone := make(chan struct{})
	f.executor.execute = func() (ActionResult, error) {
		started <- struct{}{}
		select {
		case <-release:
			return ActionResult{Summary: "Executed exactly once"}, nil
		case <-ctx.Done():
			return ActionResult{}, ctx.Err()
		}
	}
	go func() { defer close(firstDone); f.handler.tick(ctx, slog.Default()) }()
	select {
	case <-started:
	case <-ctx.Done():
		t.Fatal("first worker did not dispatch")
	}
	replica := New(f.db, f.handler.auth, f.handler.generator, f.executor)
	go func() { defer close(secondDone); replica.tick(ctx, slog.Default()) }()
	select {
	case <-secondDone:
	case <-ctx.Done():
		t.Fatal("second worker blocked instead of skipping owner lock")
	}
	close(release)
	select {
	case <-firstDone:
	case <-ctx.Done():
		t.Fatal("first worker did not finish")
	}
	r = f.load(t, r.ID)
	if f.executor.calls != 1 || r.Status != "completed" {
		t.Fatalf("parallel workers duplicated dispatch: calls=%d run=%+v", f.executor.calls, r)
	}
}
