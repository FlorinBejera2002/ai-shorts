package workspaceagent

import (
	"context"
	"encoding/json"
	"testing"
)

func TestPlannerIntentAndActionMustAgree(t *testing.T) {
	for _, p := range []plannedReply{
		{Intent: "unknown", Reply: "done"},
		{Intent: "execute", Reply: "doing"},
		{Intent: "answer", Reply: "answer", Action: &Action{Name: "mutate"}},
		{Intent: "clarify", Reply: "question", Action: &Action{Name: "mutate"}},
		{Intent: "answer", Reply: "answer", Continue: true},
		{Intent: "execute", Reply: "doing", Action: &Action{Name: " "}},
	} {
		if p.valid() {
			t.Fatalf("contradictory plan accepted: %+v", p)
		}
	}
	for _, p := range []plannedReply{{Intent: "answer", Reply: "answer"}, {Intent: "clarify", Reply: "question"}, {Intent: "execute", Reply: "doing", Action: &Action{Name: "read"}}} {
		if !p.valid() {
			t.Fatalf("valid plan rejected: %+v", p)
		}
	}
}

type recordingCancelExecutor struct {
	*fakeExecutor
	receipt ActionResult
}

func (e *recordingCancelExecutor) Cancel(ctx context.Context, user string, a Action, r ActionResult) error {
	e.receipt = r
	return e.fakeExecutor.Cancel(ctx, user, a, r)
}
func TestPauseThenStopRetainsLatePendingReceipt(t *testing.T) {
	f := newAgentFixture(t)
	recording := &recordingCancelExecutor{fakeExecutor: f.executor}
	f.handler.executor = recording
	r := f.create(t)
	f.advance(t, &r)
	receipt := ActionResult{Summary: "Queued exactly once", Pending: true, Data: json.RawMessage(`{"request_id":"own-operation"}`)}
	f.executor.execute = func() (ActionResult, error) {
		// Controls arrive while Execute has not returned its durable job receipt.
		current := f.load(t, r.ID)
		for _, command := range []string{"pause", "stop"} {
			response := f.call("POST", "/api/workspace-agent/runs/"+r.ID+"/control", f.token, encode(map[string]any{"command": command, "revision": current.Revision}))
			if response.Code != 200 {
				t.Fatalf("%s: %d %s", command, response.Code, response.Body.String())
			}
			current = f.load(t, r.ID)
		}
		if current.Status != "cancel_requested" {
			t.Fatalf("in-flight stop became terminal before receipt: %+v", current)
		}
		return receipt, nil
	}
	f.advance(t, &r)
	if r.Status != "cancel_requested" || r.Result == nil || !r.Result.Pending {
		t.Fatalf("late pending receipt lost: %+v", r)
	}
	f.advance(t, &r)
	var cancelledReceipt struct {
		RequestID string `json:"request_id"`
	}
	if err := json.Unmarshal(recording.receipt.Data, &cancelledReceipt); err != nil {
		t.Fatal(err)
	}
	if r.Status != "cancelled" || f.executor.calls != 1 || f.executor.cancels != 1 || cancelledReceipt.RequestID != "own-operation" {
		t.Fatalf("wrong cancellation: %+v calls=%d cancels=%d receipt=%s", r, f.executor.calls, f.executor.cancels, recording.receipt.Data)
	}
}
