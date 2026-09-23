package workspaceagent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/jobs"
)

func (e *PlatformExecutor) SetJobs(handler *jobs.Handler) { e.jobs = handler }
func jobInput(a Action) (jobs.AgentInput, error) {
	in := jobs.AgentInput{Options: jobs.DefaultOptions()}
	err := decodeAction(a.Input, &in)
	if err == nil {
		err = in.Options.Validate()
	}
	return in, err
}
func (e *PlatformExecutor) EstimateCost(a Action) (int, error) {
	if a.Name == "jobs.create" {
		in, err := jobInput(a)
		return in.NumClips * 10, err
	}
	for _, c := range e.Catalog() {
		if c.Name == a.Name {
			return c.CostCredits, nil
		}
	}
	return 0, ErrUnavailable
}
func (e *PlatformExecutor) jobApproval(ctx context.Context, user string, a Action) (json.RawMessage, error) {
	if e.jobs == nil {
		return nil, ErrUnavailable
	}
	in, err := jobInput(a)
	if err != nil {
		return nil, err
	}
	if err = e.jobs.AgentValidate(ctx, user, in); err != nil {
		return nil, err
	}
	return actionJSON(map[string]any{"action": a.Name, "source_type": in.SourceType, "source_url": in.SourceURL, "asset_id": in.AssetID, "num_clips": in.NumClips, "cost_credits": in.NumClips * 10, "aspect_ratio": in.AspectRatio}), nil
}
func (e *PlatformExecutor) executeJob(ctx context.Context, user, request string, a Action) (ActionResult, error) {
	if e.jobs == nil {
		return ActionResult{}, ErrUnavailable
	}
	if a.Name == "jobs.get" {
		id, err := actionID(a.Input)
		if err != nil {
			return ActionResult{}, err
		}
		v, err := e.jobs.AgentGet(ctx, user, id)
		return actionResult("Loaded processing status", "/dashboard/clips", v), err
	}
	in, err := jobInput(a)
	if err != nil {
		return ActionResult{}, err
	}
	v, err := e.jobs.AgentCreate(ctx, user, request, in)
	if err != nil {
		return ActionResult{}, err
	}
	result := actionResult("Video processing queued", "/dashboard/clips", map[string]any{"id": v.ID, "request_id": request, "status": v.Status, "credits_charged": v.Credits})
	result.Pending = true
	return result, nil
}

type pendingJob struct {
	ID        string `json:"id"`
	RequestID string `json:"request_id"`
}

func jobReceipt(previous ActionResult) (pendingJob, error) {
	var in pendingJob
	err := json.Unmarshal(previous.Data, &in)
	if err == nil && (!data.ValidUUID(in.ID) || !data.ValidUUID(in.RequestID)) {
		err = errors.New("Job execution receipt is missing")
	}
	return in, err
}
func (e *PlatformExecutor) pollJob(ctx context.Context, user string, previous ActionResult) (ActionResult, error) {
	in, err := jobReceipt(previous)
	if err != nil {
		return previous, err
	}
	if e.jobs == nil {
		return previous, ErrUnavailable
	}
	v, err := e.jobs.AgentGet(ctx, user, in.ID)
	if err != nil {
		return previous, err
	}
	result := actionResult("Video processing "+v.Status, "/dashboard/clips", map[string]any{"id": v.ID, "request_id": in.RequestID, "status": v.Status, "progress": v.Progress, "clip_ids": v.ClipIDs, "credits_charged": v.Credits})
	result.Pending = v.Status != "completed"
	if v.Status == "failed" || v.Status == "cancelled" {
		return result, fmt.Errorf("Video processing ended with status %s", v.Status)
	}
	if !result.Pending {
		result.Summary = "Video processing completed; saved outputs verified in storage"
	}
	return result, nil
}
func (e *PlatformExecutor) cancelJob(ctx context.Context, user string, previous ActionResult) error {
	in, err := jobReceipt(previous)
	if err != nil {
		return err
	}
	if e.jobs == nil {
		return ErrUnavailable
	}
	return e.jobs.AgentCancel(ctx, user, in.RequestID, in.ID)
}
