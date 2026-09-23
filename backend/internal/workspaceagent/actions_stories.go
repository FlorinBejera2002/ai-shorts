package workspaceagent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/stories"
	"sneepcut/backend-go/internal/story"
)

type storyAction struct {
	Style         *story.Style `json:"style,omitempty"`
	ExpectedState string       `json:"expected_state"`
	ID            string       `json:"id"`
	Version       int          `json:"version"`
	Action        string       `json:"action,omitempty"`
	BlockID       string       `json:"block_id,omitempty"`
	CandidateID   string       `json:"candidate_id,omitempty"`
}

func storyRoute(id string) string { return "/dashboard/create?story=" + id }
func (e *PlatformExecutor) queueStory(ctx context.Context, user, requestID string, a Action) (ActionResult, error) {
	var in storyAction
	if err := decodeAction(a.Input, &in); err != nil {
		return ActionResult{}, err
	}
	if !data.ValidUUID(in.ID) || !data.ValidUUID(requestID) || in.Version < 0 {
		return ActionResult{}, errors.New("Invalid story identity or version")
	}
	if len(in.ExpectedState) != 64 {
		return ActionResult{}, errors.New("Refresh the story before execution; its expected state is required")
	}
	if in.Style != nil {
		return ActionResult{}, errors.New("Use stories.restyle for visual style changes")
	}
	if a.Name == "stories.generate" && (in.Action != "" || in.BlockID != "" || in.CandidateID != "") {
		return ActionResult{}, errors.New("Generation does not accept revision options")
	}
	if a.Name == "stories.revise" && (in.Action == "" || in.Version < 1) {
		return ActionResult{}, errors.New("A revision action and existing version are required")
	}
	err := e.stories.Queue(ctx, user, in.ID, stories.Generate{ExpectedState: in.ExpectedState, RequestID: requestID, Action: in.Action, BlockID: in.BlockID, CandidateID: in.CandidateID, Version: in.Version})
	if err != nil {
		return ActionResult{}, err
	}
	result := actionResult("Story processing queued", storyRoute(in.ID), map[string]any{"id": in.ID, "request_id": requestID, "base_version": in.Version})
	result.Pending = true
	return result, nil
}
func (e *PlatformExecutor) Poll(ctx context.Context, user string, a Action, previous ActionResult) (ActionResult, error) {
	if a.Name == "jobs.create" {
		return e.pollJob(ctx, user, previous)
	}
	if a.Name == "runs.control" {
		return e.pollRunControl(ctx, user, previous)
	}
	if a.Name == "studio.render" {
		return e.studioPoll(ctx, user, previous)
	}
	if a.Name == "publishing.publish" {
		return e.publishingPoll(ctx, user, a, previous)
	}
	if a.Name == "clips.trim" || a.Name == "clips.recut" || a.Name == "clips.style" || a.Name == "clips.transitions" {
		return e.clipPoll(ctx, user, a, previous)
	}
	if a.Name != "stories.generate" && a.Name != "stories.revise" && a.Name != "stories.restyle" {
		return previous, nil
	}
	var in storyAction
	if err := decodeAction(a.Input, &in); err != nil {
		return previous, err
	}
	requestID, err := pendingStoryRequest(previous)
	if err != nil {
		return previous, err
	}
	var currentRequest string
	err = e.db.QueryRowContext(ctx, `SELECT COALESCE(request->>'request_id','') FROM story_projects WHERE id=$1 AND user_id=$2`, in.ID, user).Scan(&currentRequest)
	if err != nil {
		return previous, err
	}
	if currentRequest != requestID {
		return previous, errors.New("This story execution was superseded by another operation")
	}
	p, err := e.stories.Get(ctx, user, in.ID)
	if err != nil {
		return previous, err
	}
	snapshot := safeStory(p)
	snapshot["request_id"] = requestID
	result := actionResult(p.Message, storyRoute(in.ID), snapshot)
	result.Pending = true
	switch p.Status {
	case "ready":
		for _, v := range p.Versions {
			if v.Number == p.CurrentVersion && v.Number > in.Version && v.Accepted && v.Report.Status == "ready" && v.Output.Key != "" {
				result.Pending = false
				result.Summary = "Story render completed and passed review"
				return result, nil
			}
		}
		return result, errors.New("The requested revision did not produce a new accepted render; the previous version is preserved")
	case "failed", "cancelled", "needs_review", "deleting":
		return result, fmt.Errorf("Story processing ended with status %s; inspect the saved story", p.Status)
	case "draft":
		return result, errors.New("Story is not queued for processing")
	default:
		return result, nil
	}
}
func (e *PlatformExecutor) Cancel(ctx context.Context, user string, a Action, previous ActionResult) error {
	if a.Name == "jobs.create" {
		return e.cancelJob(ctx, user, previous)
	}
	if a.Name == "studio.render" {
		return e.studioCancel(ctx, user, previous)
	}
	if a.Name == "publishing.publish" {
		return e.publishingCancel(ctx, user, a, previous)
	}
	if a.Name == "clips.trim" || a.Name == "clips.recut" || a.Name == "clips.style" || a.Name == "clips.transitions" {
		return e.clipCancel(ctx, user, a, previous)
	}
	if a.Name != "stories.generate" && a.Name != "stories.revise" && a.Name != "stories.restyle" {
		return nil
	}
	var in storyAction
	if err := decodeAction(a.Input, &in); err != nil {
		return err
	}
	requestID, err := pendingStoryRequest(previous)
	if err != nil {
		return err
	}
	return e.stories.CancelRequest(ctx, user, in.ID, requestID)
}
func pendingStoryRequest(previous ActionResult) (string, error) {
	var state struct {
		RequestID string `json:"request_id"`
	}
	if json.Unmarshal(previous.Data, &state) != nil || !data.ValidUUID(state.RequestID) {
		return "", errors.New("Story execution receipt is missing")
	}
	return state.RequestID, nil
}
