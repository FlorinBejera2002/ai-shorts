package scripts

import (
	"context"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/aiprovider"
)

type scriptTaskProvider struct {
	generator aiprovider.Generator
	tasks     []aiprovider.Task
}

func (*scriptTaskProvider) Generate(context.Context, string) (string, error) {
	return "", errors.New("script task must be selected")
}

func (p *scriptTaskProvider) ForTask(_ context.Context, task aiprovider.Task) (aiprovider.Generator, error) {
	p.tasks = append(p.tasks, task)
	if task != aiprovider.TaskScripts {
		return nil, errors.New("unexpected task")
	}
	return p.generator, nil
}

func TestManualAndWorkspaceScriptDraftUseScriptsTask(t *testing.T) {
	calls := 0
	provider := &scriptTaskProvider{generator: generatorFunc(func(context.Context, string) (string, error) {
		calls++
		return `{"title":"Task-routed draft","scenes":[]}`, nil
	})}
	request := httptest.NewRequest("POST", "/api/scripts/generate", strings.NewReader(`{"topic":"Interesting story"}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	New(nil, provider).generate(response, request)
	if response.Code != 200 {
		t.Fatalf("manual generation failed: %d %s", response.Code, response.Body.String())
	}
	draft, err := GenerateDraft(context.Background(), provider, Request{Topic: "Interesting story", Duration: 30})
	if err != nil || draft["title"] != "Task-routed draft" || calls != 2 || len(provider.tasks) != 2 {
		t.Fatalf("workspace draft bypassed script routing: %#v %v tasks=%v calls=%d", draft, err, provider.tasks, calls)
	}
}
