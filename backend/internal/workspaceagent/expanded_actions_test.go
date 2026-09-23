package workspaceagent

import (
	"context"
	"encoding/json"
	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/story"
	"strings"
	"testing"
)

func TestActionDigestIgnoresObjectKeyOrdering(t *testing.T) {
	a := Action{Name: "write", Input: json.RawMessage(`{"id":"a","settings":{"b":2,"a":1}}`)}
	b := Action{Name: "write", Input: json.RawMessage(`{ "settings": {"a":1,"b":2}, "id":"a" }`)}
	if digest(a) != digest(b) {
		t.Fatal("JSONB key ordering changes action identity")
	}
	b.Input = json.RawMessage(`{"id":"a","settings":{"b":3,"a":1}}`)
	if digest(a) == digest(b) {
		t.Fatal("changed values share identity")
	}
}
func TestGenerationCostUsesValidatedClipCount(t *testing.T) {
	e := NewExecutor(nil, nil, story.DefaultLimits())
	for _, count := range []int{1, 5, 15} {
		cost, err := e.EstimateCost(Action{Name: "jobs.create", Input: actionJSON(map[string]any{"num_clips_requested": count})})
		if err != nil || cost != count*10 {
			t.Fatal(cost, err)
		}
	}
	for _, count := range []int{0, -1, 16} {
		if _, err := e.EstimateCost(Action{Name: "jobs.create", Input: actionJSON(map[string]any{"num_clips_requested": count})}); err == nil {
			t.Fatal("invalid billable count", count)
		}
	}
}
func TestScriptGenerationExportAndActivityUseOwnedRealState(t *testing.T) {
	f := newAgentFixture(t)
	ctx := context.Background()
	calls := 0
	e := NewExecutor(f.db, generatorFunc(func(context.Context, string) (string, error) {
		calls++
		return `{"title":"Synthetic script","hook":"A useful hook","scenes":[{"text":"Only a draft","duration":30}],"call_to_action":"Try it"}`, nil
	}), story.DefaultLimits())
	result, err := e.Execute(ctx, f.user, f.user, Action{Name: "scripts.generate", Input: json.RawMessage(`{"topic":"A synthetic example"}`)})
	if err != nil || calls != 1 || !strings.Contains(string(result.Data), `"saved":false`) {
		t.Fatal(result, err, calls)
	}
	var count int
	if err = f.db.QueryRow(`SELECT count(*) FROM scripts WHERE user_id=$1`, f.user).Scan(&count); err != nil || count != 0 {
		t.Fatal("generation persisted implicitly", err)
	}
	id, _ := data.NewUUID()
	if _, err = e.Execute(ctx, f.user, id, Action{Name: "scripts.create", Input: json.RawMessage(`{"title":"Export fixture"}`)}); err != nil {
		t.Fatal(err)
	}
	result, err = e.Execute(ctx, f.user, id, Action{Name: "scripts.export", Input: actionJSON(map[string]any{"id": id})})
	if err != nil || !strings.Contains(string(result.Data), `"document"`) {
		t.Fatal(result, err)
	}
	other, _ := data.NewUUID()
	if _, err = e.Execute(ctx, other, id, Action{Name: "scripts.export", Input: actionJSON(map[string]any{"id": id})}); err == nil {
		t.Fatal("foreign export allowed")
	}
	result, err = e.Execute(ctx, f.user, id, Action{Name: "analytics.activity", Input: json.RawMessage(`{"days":7}`)})
	if err != nil || !strings.Contains(string(result.Data), `"days":[]`) {
		t.Fatal(result, err)
	}
}
