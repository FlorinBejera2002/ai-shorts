package workspaceagent

import (
	"context"
	"errors"
	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/stories"
)

func (e *PlatformExecutor) restyleStory(ctx context.Context, user, requestID string, a Action) (ActionResult, error) {
	var in storyAction
	if err := decodeAction(a.Input, &in); err != nil {
		return ActionResult{}, err
	}
	if !data.ValidUUID(in.ID) || !data.ValidUUID(requestID) || in.Version < 1 || len(in.ExpectedState) != 64 || in.Style == nil || in.Action != "" || in.BlockID != "" || in.CandidateID != "" {
		return ActionResult{}, errors.New("Inspect an existing rendered story and choose visual style changes")
	}
	if err := e.stories.Queue(ctx, user, in.ID, stories.Generate{ExpectedState: in.ExpectedState, RequestID: requestID, Version: in.Version, Action: "restyle", Style: in.Style}); err != nil {
		return ActionResult{}, err
	}
	result := actionResult("Story style update queued; source selection and protected sections are preserved", storyRoute(in.ID), map[string]any{"id": in.ID, "request_id": requestID, "base_version": in.Version})
	result.Pending = true
	return result, nil
}
