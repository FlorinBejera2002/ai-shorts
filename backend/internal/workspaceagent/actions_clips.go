package workspaceagent

import (
	"context"
	"encoding/json"
	"errors"
	"sneepcut/backend-go/internal/clips"
	"sneepcut/backend-go/internal/data"
	"strings"
)

func (e *PlatformExecutor) SetClips(handler *clips.Handler) { e.clips = handler }

type clipAction struct {
	ID            string          `json:"id"`
	ExpectedState string          `json:"expected_state"`
	Edit          json.RawMessage `json:"edit"`
}

type clipMetadataAction struct {
	ID            string          `json:"id"`
	ExpectedState string          `json:"expected_state"`
	Metadata      json.RawMessage `json:"metadata"`
}

func clipRoute(id string) string { return "/dashboard/clips/" + id }
func (e *PlatformExecutor) clipExecute(ctx context.Context, user, requestID string, a Action) (ActionResult, error) {
	if e.clips == nil {
		return ActionResult{}, ErrUnavailable
	}
	if a.Name == "clips.get" {
		id, err := actionID(a.Input)
		if err != nil {
			return ActionResult{}, err
		}
		v, err := e.clips.AgentRead(ctx, user, id)
		return actionResult("Loaded clip state and saved transcript", clipRoute(id), v), err
	}
	if a.Name == "clips.metadata" || a.Name == "clips.delete" {
		var in clipMetadataAction
		if err := decodeAction(a.Input, &in); err != nil {
			return ActionResult{}, err
		}
		value, err := e.clips.AgentMutate(ctx, user, requestID, in.ID, in.ExpectedState, strings.TrimPrefix(a.Name, "clips."), in.Metadata)
		if err != nil {
			return ActionResult{}, err
		}
		if value.Deleted {
			return actionResult("Clip removed using the existing deletion service", "/dashboard/clips", value), nil
		}
		result := actionResult("Clip metadata saved", clipRoute(in.ID), value)
		if value.Undo != nil {
			input, _ := json.Marshal(value.Undo)
			result.Undo, _ = json.Marshal(Action{Name: "clips.metadata", Input: input})
		}
		return result, nil
	}
	var in clipAction
	if err := decodeAction(a.Input, &in); err != nil {
		return ActionResult{}, err
	}
	if a.Name == "clips.export" {
		if len(in.Edit) > 0 {
			return ActionResult{}, errors.New("Export does not accept edit options")
		}
		clip, err := e.clips.AgentExport(ctx, user, in.ID, in.ExpectedState)
		return actionResult("Saved clip export verified in storage; open the clip to download", clipRoute(in.ID), clip), err
	}
	if a.Name != "clips.trim" && a.Name != "clips.recut" && a.Name != "clips.style" && a.Name != "clips.transitions" {
		return ActionResult{}, ErrUnavailable
	}
	kind := strings.TrimPrefix(a.Name, "clips.")
	if kind == "transitions" {
		kind = "transition"
	}
	taskID, err := e.clips.AgentEdit(ctx, user, requestID, in.ID, in.ExpectedState, kind, in.Edit)
	if err != nil {
		return ActionResult{}, err
	}
	receipt := clips.AgentDelivery{TaskID: taskID, ClipID: in.ID, State: "pending", Pending: true}
	result := actionResult("Clip edit queued in the existing render service", clipRoute(in.ID), receipt)
	result.Pending = true
	return result, nil
}

func (e *PlatformExecutor) clipApproval(ctx context.Context, user string, a Action) (json.RawMessage, error) {
	if e.clips == nil || a.Name != "clips.delete" {
		return nil, ErrUnavailable
	}
	var in clipMetadataAction
	if err := decodeAction(a.Input, &in); err != nil {
		return nil, err
	}
	if len(in.Metadata) > 0 {
		return nil, errors.New("Deletion does not accept metadata")
	}
	clip, err := e.clips.AgentDeletePreview(ctx, user, in.ID, in.ExpectedState)
	if err != nil {
		return nil, err
	}
	effect := "Permanently delete this clip and its clip media, thumbnails and edit outputs. The original uploaded source is retained. No Undo is available."
	if clip.StoryOwned {
		effect = "Remove this clip from the library. The immutable Story Builder version and its media are retained. No Undo is available."
	}
	return json.Marshal(map[string]any{"action": a.Name, "clip_id": clip.ID, "title": clip.Title, "duration": clip.Duration, "expected_state": clip.ExpectedState, "irreversible": true, "effect": effect})
}
func clipReceipt(a Action, previous ActionResult) (clipAction, clips.AgentDelivery, error) {
	var in clipAction
	var receipt clips.AgentDelivery
	if err := decodeAction(a.Input, &in); err != nil {
		return in, receipt, err
	}
	if json.Unmarshal(previous.Data, &receipt) != nil || !data.ValidUUID(receipt.TaskID) || receipt.ClipID != in.ID {
		return in, receipt, errors.New("Clip execution receipt is missing")
	}
	return in, receipt, nil
}
func (e *PlatformExecutor) clipPoll(ctx context.Context, user string, a Action, previous ActionResult) (ActionResult, error) {
	if e.clips == nil {
		return previous, ErrUnavailable
	}
	in, receipt, err := clipReceipt(a, previous)
	if err != nil {
		return previous, err
	}
	state, err := e.clips.AgentPoll(ctx, user, in.ID, receipt.TaskID)
	if err != nil {
		return previous, err
	}
	summary := "Clip edit is processing"
	if !state.Pending {
		summary = "Clip edit completed; the saved output and duration match this operation"
	}
	result := actionResult(summary, clipRoute(in.ID), state)
	result.Pending = state.Pending
	return result, nil
}
func (e *PlatformExecutor) clipCancel(ctx context.Context, user string, a Action, previous ActionResult) error {
	if e.clips == nil {
		return ErrUnavailable
	}
	in, receipt, err := clipReceipt(a, previous)
	if err != nil {
		return err
	}
	return e.clips.AgentCancel(ctx, user, in.ID, receipt.TaskID)
}
