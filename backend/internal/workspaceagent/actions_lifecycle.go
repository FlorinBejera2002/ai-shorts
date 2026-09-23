package workspaceagent

import (
	"context"
	"encoding/json"
	"sneepcut/backend-go/internal/stories"
)

func (e *PlatformExecutor) SetStoryLifecycle(handler *stories.Handler) { e.storyLifecycle = handler }
func (e *PlatformExecutor) lifecycleExecute(ctx context.Context, user, request string, a Action) (ActionResult, error) {
	if e.storyLifecycle == nil {
		return ActionResult{}, ErrUnavailable
	}
	var in stories.LifecycleInput
	if err := decodeAction(a.Input, &in); err != nil {
		return ActionResult{}, err
	}
	value, err := e.storyLifecycle.AgentLifecycle(ctx, user, request, a.Name, in)
	if err != nil {
		return ActionResult{}, err
	}
	summary, route := "Story version restored", storyRoute(in.ID)
	if value.Deleted {
		summary = "Story and derived artifacts deleted; original uploads retained"
		route = "/dashboard/clips"
	} else if value.RemovedAsset != "" {
		summary = "Source removed from the draft story; original upload retained"
	}
	result := actionResult(summary, route, value)
	if value.Undo != nil {
		raw, _ := json.Marshal(value.Undo)
		result.Undo, _ = json.Marshal(Action{Name: "stories.rollback", Input: raw})
	}
	return result, nil
}
func (e *PlatformExecutor) lifecycleApproval(ctx context.Context, user string, a Action) (json.RawMessage, error) {
	if e.storyLifecycle == nil || a.Name != "stories.delete" {
		return nil, ErrUnavailable
	}
	var in stories.LifecycleInput
	if err := decodeAction(a.Input, &in); err != nil {
		return nil, err
	}
	preview, err := e.storyLifecycle.AgentLifecyclePreview(ctx, user, in)
	if err != nil {
		return nil, err
	}
	return json.Marshal(preview)
}
