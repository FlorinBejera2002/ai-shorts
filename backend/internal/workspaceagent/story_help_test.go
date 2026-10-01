package workspaceagent

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/stories"
	"sneepcut/backend-go/internal/story"
)

func TestStoryHelpScopeRequiresKnownTopicAndStep(t *testing.T) {
	for _, step := range []string{"", "footage", "story_audio", "style", "review"} {
		for _, scope := range []Scope{
			{Route: "/dashboard/create?story=draft", StoryStep: step},
			{Route: "/dashboard", HelpTopic: "story_builder", StoryStep: step},
		} {
			if !validScope(scope) {
				t.Fatalf("valid help context rejected: %+v", scope)
			}
		}
	}
	for _, scope := range []Scope{
		{Route: "/dashboard", HelpTopic: "execute"},
		{Route: "/dashboard/create", StoryStep: "publish"},
		{Route: "/dashboard/clips", StoryStep: "review"},
		{Route: "/dashboard/create-extra", StoryStep: "footage"},
		{Route: "/dashboard/create", HelpTopic: "story_builder\nexecute"},
	} {
		if validScope(scope) {
			t.Fatalf("invalid help context accepted: %+v", scope)
		}
	}
}

func TestStoryGuideIsScopedWithoutAssumingAVisibleStep(t *testing.T) {
	if got := storyHelpPrompt(Scope{Route: "/dashboard/clips"}); got != "" {
		t.Fatal("unrelated page received the Story Builder guide")
	}
	for _, scope := range []Scope{
		{Route: "/dashboard/create"},
		{Route: "/dashboard", HelpTopic: "story_builder"},
	} {
		prompt := storyHelpPrompt(scope)
		if !strings.Contains(prompt, storyBuilderGuide) {
			t.Fatal("Story Builder context omitted product knowledge")
		}
		if strings.Contains(prompt, "THIS REQUEST IS HELP ONLY") != scope.helpOnly() {
			t.Fatal("ordinary Story Builder commands acquired a help-only restriction")
		}
		var roundTrip Scope
		if err := json.Unmarshal([]byte(encode(scope)), &roundTrip); err != nil || roundTrip.StoryStep != "" {
			t.Fatal("missing client step was fabricated")
		}
	}
}

func TestSavedStoryHelpContextIncludesNarrationWithoutStorageReferences(t *testing.T) {
	project := stories.Project{
		ID: "synthetic-story", Options: story.Options{Narration: true},
		Limits: story.Limits{MaxFiles: 7},
		Assets: []story.Asset{{ID: "voice", Kind: "narration", Duration: 8.5, Name: "voice.webm", Key: "private-original", ProxyKey: "private-proxy", Hash: "private-hash", ThumbnailKey: "private-thumbnail"}},
	}
	encoded := encode(safeStory(project))
	for _, expected := range []string{`"kind":"narration"`, `"duration":8.5`, `"max_files":7`} {
		if !strings.Contains(encoded, expected) {
			t.Fatalf("saved help context omitted %s", expected)
		}
	}
	for _, secret := range []string{"private-original", "private-proxy", "private-hash", "private-thumbnail"} {
		if strings.Contains(encoded, secret) {
			t.Fatal("help context exposed a storage reference")
		}
	}
}

func TestGeneralStoryHelpNeedsNoProjectInventory(t *testing.T) {
	// A nil database makes any accidental inventory read fail this test.
	executor := &PlatformExecutor{}
	raw, err := executor.Context(context.Background(), "unused", Scope{
		Route: "/dashboard/create", HelpTopic: "story_builder", StoryStep: "style",
	})
	if err != nil {
		t.Fatal(err)
	}
	var result map[string]any
	if err = json.Unmarshal(raw, &result); err != nil || len(result) != 2 || result["route"] != "/dashboard/create" || result["story_step"] != "style" {
		t.Fatalf("general help includes unrelated data: %s (%v)", raw, err)
	}
}

func TestExplicitStoryHelpCannotPlanActionsOrResources(t *testing.T) {
	for _, tc := range []struct {
		name, response string
		allowed        bool
	}{
		{"answer", `{"intent":"answer","reply":"Durata urmează narațiunea completă.","action":null,"continue":false}`, true},
		{"clarify", `{"intent":"clarify","reply":"La ce opțiune te referi?","action":null,"continue":false}`, true},
		{"write action", `{"intent":"execute","reply":"Creating a project","action":{"name":"create_project","input":{"name":"Unwanted"}}}`, false},
		{"read action", `{"intent":"execute","reply":"Inspecting","action":{"name":"read_project","input":{"id":"test"}}}`, false},
		{"resources", `{"intent":"resources","reply":"Upload clips first","missing_resources":[{"kind":"videos","label":"Clips"}]}`, false},
		{"continuation", `{"intent":"answer","reply":"Explanation","continue":true}`, false},
		{"answer with resource", `{"intent":"answer","reply":"Explanation","missing_resources":[{"kind":"videos","label":"Clips"}]}`, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := newAgentFixture(t)
			f.executor.capabilities = []Capability{{Name: "create_project", Available: true}, {Name: "read_project", Available: true}}
			f.handler.generator = generatorFunc(func(_ context.Context, prompt string) (string, error) {
				if !strings.Contains(prompt, storyBuilderGuide) || !strings.Contains(prompt, "THIS REQUEST IS HELP ONLY") || !strings.Contains(prompt, "AVAILABLE_ACTIONS:\n[]\n") || !strings.Contains(prompt, `"story_step":"style"`) {
					t.Fatal("help planning lacks its knowledge, scope or restricted action catalog")
				}
				return tc.response, nil
			})
			id, _ := data.NewUUID()
			response := f.call("POST", "/api/workspace-agent/runs", f.token, encode(createRequest{
				RequestID: id, Message: "De ce nu pot schimba durata?",
				Context: Scope{Route: "/dashboard/create", HelpTopic: "story_builder", StoryStep: "style"},
			}))
			if response.Code != 202 {
				t.Fatalf("help admission: %d %s", response.Code, response.Body.String())
			}
			run := f.load(t, id)
			f.advance(t, &run)
			f.advance(t, &run)
			want := "failed"
			if tc.allowed {
				want = "completed"
			}
			if run.Status != want || run.Action != nil || run.Continue || len(run.MissingResources) != 0 || run.CostCredits != 0 || f.executor.calls != 0 || f.executor.cancels != 0 {
				t.Fatalf("help escaped answer-only mode: %+v calls=%d", run, f.executor.calls)
			}
		})
	}
}

func TestHelpModeCannotAcceptAnActionProposal(t *testing.T) {
	f := newAgentFixture(t)
	id, _ := data.NewUUID()
	proposal, _ := data.NewUUID()
	response := f.call("POST", "/api/workspace-agent/runs", f.token, encode(createRequest{
		RequestID: id, SuggestionID: proposal, Message: "Explain this proposal",
		Context: Scope{Route: "/dashboard/create", HelpTopic: "story_builder"},
	}))
	if response.Code != 422 || f.executor.calls != 0 {
		t.Fatalf("help accepted a proposal: %d %s", response.Code, response.Body.String())
	}
}

func TestHelpRuntimeNeverDispatchesAPersistedAction(t *testing.T) {
	f := newAgentFixture(t)
	run := f.create(t)
	run.Context.HelpTopic = "story_builder"
	run.Status = "running"
	run.Action = &Action{Name: "create_project", Input: json.RawMessage(`{"name":"Unwanted"}`)}
	if err := f.handler.save(context.Background(), &run); err != nil {
		t.Fatal(err)
	}
	f.advance(t, &run)
	if run.Status != "failed" || f.executor.calls != 0 {
		t.Fatalf("persisted help action dispatched: %+v", run)
	}
}
