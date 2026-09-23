package workspaceagent

import (
	"context"
	"sneepcut/backend-go/internal/stories"
)

func (e *PlatformExecutor) patchStory(ctx context.Context, user, request string, a Action) (ActionResult, error) {
	var in struct {
		ID            string        `json:"id"`
		ExpectedState string        `json:"expected_state"`
		Patch         stories.Patch `json:"patch"`
	}
	if err := decodeAction(a.Input, &in); err != nil {
		return ActionResult{}, err
	}
	result, err := e.stories.AgentPatch(ctx, user, in.ID, request, in.ExpectedState, in.Patch)
	if err != nil {
		return ActionResult{}, err
	}
	out := actionResult("Saved and verified story settings, resource choices and protected sections", storyRoute(in.ID), map[string]any{"id": in.ID, "expected_state": result.ExpectedState})
	out.Undo = actionJSON(Action{Name: "stories.restore_settings", Input: actionJSON(map[string]any{"id": in.ID, "expected_state": result.ExpectedState, "patch": result.Previous})})
	return out, nil
}
