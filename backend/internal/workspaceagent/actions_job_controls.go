package workspaceagent

import (
	"context"
	"errors"
	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/stories"
)

func (e *PlatformExecutor) jobControlCapabilities() []Capability {
	available, limitation := e.jobs != nil, ""
	if !available {
		limitation = "The video processing service is not connected."
	}
	return []Capability{
		{Name: "jobs.list", Description: "Inspect up to 100 recent owned processing jobs, including those started outside chat. Input {}. Returns actual status and whether a worker is still active; no private paths. Story jobs use stories.get/cancel.", Risk: "read", Available: available, Limitation: limitation},
		{Name: "jobs.cancel", Description: "Cancel an inspected non-story processing job at the user's request. Input {id}. Uses existing cancellation/refund rules; safe to retry. Does not delete completed clips. A worker may still be stopping; report returned processing_active accurately.", Risk: "write", Available: available, Limitation: limitation},
		{Name: "stories.cancel", Description: "Cancel an inspected current story operation, including generation started outside chat. Input {id,expected_state}. Read stories.get first; cancellation is fenced to the inspected execution. Previous accepted versions and original sources remain; a worker may still be stopping.", Risk: "write", Available: true},
	}
}

func (e *PlatformExecutor) executeJobControl(ctx context.Context, user string, a Action) (ActionResult, error) {
	if a.Name == "stories.cancel" {
		var in struct {
			ID            string `json:"id"`
			ExpectedState string `json:"expected_state"`
		}
		if err := decodeAction(a.Input, &in); err != nil {
			return ActionResult{}, err
		}
		if !data.ValidUUID(in.ID) || len(in.ExpectedState) != 64 {
			return ActionResult{}, errors.New("Inspect the story before cancelling its current operation")
		}
		// Capture the request before checking the state. A replacement between
		// either read or the cancellation transaction fails the request fence.
		var request string
		if err := e.db.QueryRowContext(ctx, `SELECT coalesce(request->>'request_id','') FROM story_projects WHERE id=$1 AND user_id=$2`, in.ID, user).Scan(&request); err != nil {
			return ActionResult{}, err
		}
		state, err := e.stories.AgentState(ctx, user, in.ID)
		if err != nil {
			return ActionResult{}, err
		}
		if state != in.ExpectedState {
			return ActionResult{}, stories.ErrConflict
		}
		if !data.ValidUUID(request) {
			return ActionResult{}, errors.New("This story has no current processing operation")
		}
		if err = e.stories.CancelRequest(ctx, user, in.ID, request); err != nil {
			return ActionResult{}, err
		}
		result, err := e.inspectedStory(ctx, user, in.ID)
		if err != nil {
			return ActionResult{}, err
		}
		summary := "Story operation is already finished; saved versions remain available"
		if result["status"] == "cancelled" {
			summary = "Story cancellation recorded; the worker may still be stopping. Saved versions and sources are retained"
		}
		return actionResult(summary, storyRoute(in.ID), result), nil
	}
	if e.jobs == nil {
		return ActionResult{}, ErrUnavailable
	}
	if a.Name == "jobs.list" {
		if err := decodeAction(a.Input, &struct{}{}); err != nil {
			return ActionResult{}, err
		}
		result, err := e.jobs.AgentList(ctx, user)
		return actionResult("Loaded processing jobs", "/dashboard/clips", result), err
	}
	id, err := actionID(a.Input)
	if err != nil {
		return ActionResult{}, err
	}
	result, err := e.jobs.AgentCancelOwned(ctx, user, id)
	if err != nil {
		return ActionResult{}, err
	}
	summary := "Processing job is already " + result.Status + "; saved clips remain available"
	if result.Status == "cancelled" {
		summary = "Cancellation recorded; saved clips remain available"
		if result.ProcessingActive {
			summary += ". The worker is still stopping"
		}
	}
	return actionResult(summary, "/dashboard/clips", result), nil
}
