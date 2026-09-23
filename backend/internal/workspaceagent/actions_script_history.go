package workspaceagent

import (
	"context"
	"encoding/json"
	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/scripts"
)

func (e *PlatformExecutor) scriptHistory(ctx context.Context, user, request string, a Action) (ActionResult, error) {
	if a.Name == "scripts.versions" {
		id, err := actionID(a.Input)
		if err != nil {
			return ActionResult{}, err
		}
		versions, err := e.scripts.Versions(ctx, user, id)
		return actionResult("Loaded saved script versions", "/dashboard/script-generator", versions), err
	}
	var in struct {
		ID        string `json:"id"`
		Revision  int    `json:"revision"`
		VersionID string `json:"version_id"`
	}
	if err := decodeAction(a.Input, &in); err != nil {
		return ActionResult{}, err
	}
	if !data.ValidUUID(in.ID) || in.Revision < 1 {
		return ActionResult{}, scripts.ErrWorkspaceInput
	}
	current, err := e.scripts.Get(ctx, user, in.ID)
	if err != nil {
		return ActionResult{}, err
	}
	document := scriptDocument(current)
	name := "scripts.update"
	if a.Name == "scripts.archive" {
		if in.VersionID != "" {
			return ActionResult{}, scripts.ErrWorkspaceInput
		}
		document.Status = "archived"
	} else {
		if !data.ValidUUID(in.VersionID) {
			return ActionResult{}, scripts.ErrWorkspaceInput
		}
		var raw []byte
		if err = e.db.QueryRowContext(ctx, `SELECT v.snapshot FROM script_versions v JOIN scripts s ON s.id=v.script_id WHERE s.user_id=$1 AND s.id=$2 AND v.id=$3`, user, in.ID, in.VersionID).Scan(&raw); err != nil {
			return ActionResult{}, err
		}
		if err = json.Unmarshal(raw, &document.Snapshot); err != nil {
			return ActionResult{}, err
		}
		name = "scripts.restore"
	}
	return e.updateScript(ctx, user, request, Action{Name: name, Input: actionJSON(scriptMutation{ID: in.ID, Revision: in.Revision, VersionID: in.VersionID, Document: document})})
}
