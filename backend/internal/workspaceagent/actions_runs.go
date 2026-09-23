package workspaceagent

import (
	"context"
	"encoding/json"
	"errors"
	"sneepcut/backend-go/internal/data"
)

func (e *PlatformExecutor) runControls(ctx context.Context, user, request string, a Action) (ActionResult, error) {
	h := &Handler{db: e.db}
	if a.Name == "runs.list" {
		if err := decodeAction(a.Input, &struct{}{}); err != nil {
			return ActionResult{}, err
		}
		rows, err := e.db.QueryContext(ctx, `SELECT id,status,context,revision,message FROM workspace_agent_runs WHERE user_id=$1 AND status NOT IN ('completed','failed','cancelled') ORDER BY created_at DESC LIMIT 20`, user)
		if err != nil {
			return ActionResult{}, err
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id, status, message string
			var scope []byte
			var revision int
			if err = rows.Scan(&id, &status, &scope, &revision, &message); err != nil {
				return ActionResult{}, err
			}
			out = append(out, map[string]any{"id": id, "status": status, "context": string(scope), "revision": revision, "message": clipText(message, 500)})
		}
		return actionResult("Loaded your active operations", "", out), rows.Err()
	}
	var in struct {
		ID       string `json:"id"`
		Revision int    `json:"revision"`
		Command  string `json:"command"`
	}
	if err := decodeAction(a.Input, &in); err != nil {
		return ActionResult{}, err
	}
	if !data.ValidUUID(in.ID) || in.ID == request || (in.Command != "pause" && in.Command != "resume" && in.Command != "stop") {
		return ActionResult{}, errors.New("Invalid operation control")
	}
	target, err := h.get(ctx, user, in.ID)
	if err != nil {
		return ActionResult{}, err
	}
	if stepID(target) == request {
		return ActionResult{}, errors.New("A run cannot control itself")
	}
	if target.Revision != in.Revision {
		return ActionResult{}, ErrConflict
	}
	if in.Command == "resume" && target.Status == "waiting_for_resources" {
		return ActionResult{}, errors.New("Use the resource card to validate pending uploads before continuing")
	}
	if err = transition(&target, in.Command); err != nil {
		return ActionResult{}, err
	}
	if err = h.save(ctx, &target); err != nil {
		return ActionResult{}, err
	}
	result := actionResult("Operation control saved", "", map[string]any{"id": target.ID, "status": target.Status, "revision": target.Revision})
	result.Pending = target.Status == "cancel_requested"
	return result, nil
}

func (e *PlatformExecutor) pollRunControl(ctx context.Context, user string, previous ActionResult) (ActionResult, error) {
	var in struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(previous.Data, &in); err != nil {
		return previous, err
	}
	h := &Handler{db: e.db}
	target, err := h.get(ctx, user, in.ID)
	if err != nil {
		return previous, err
	}
	result := actionResult("Operation cancellation confirmed", "", map[string]any{"id": target.ID, "status": target.Status, "revision": target.Revision})
	result.Pending = target.Status == "cancel_requested"
	if result.Pending {
		result.Summary = "Waiting for operation cancellation"
	}
	if target.Status != "cancel_requested" && target.Status != "cancelled" {
		return result, errors.New("The target changed before cancellation was confirmed; inspect its current result")
	}
	return result, nil
}
