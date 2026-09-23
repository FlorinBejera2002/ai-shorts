package workspaceagent

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/scripts"
)

type scriptMutation struct {
	ID        string                 `json:"id"`
	Revision  int                    `json:"revision"`
	VersionID string                 `json:"version_id,omitempty"`
	Document  scripts.WorkspaceInput `json:"document"`
}

func scriptDocument(record scripts.ScriptRecord) scripts.WorkspaceInput {
	return scripts.WorkspaceInput{Title: record.Title, Status: record.Status, Topic: record.Topic, Platform: record.Platform, Language: record.Language, TargetDuration: record.TargetDuration, Tone: record.Tone, Style: record.Style, Audience: record.Audience, Snapshot: record.Snapshot}
}

func (e *PlatformExecutor) updateScript(ctx context.Context, user, requestID string, a Action) (ActionResult, error) {
	var in scriptMutation
	if err := decodeAction(a.Input, &in); err != nil {
		return ActionResult{}, err
	}
	if !data.ValidUUID(in.ID) || !data.ValidUUID(requestID) || in.Revision < 1 {
		return ActionResult{}, errors.New("A script ID and current revision are required")
	}
	if a.Name == "scripts.update" && in.VersionID != "" {
		return ActionResult{}, errors.New("Version restoration requires a saved undo receipt")
	}
	normalized, err := scripts.NormalizeWorkspaceInput(in.Document)
	if err != nil {
		return ActionResult{}, err
	}
	changeType := "manual"
	if a.Name == "scripts.restore" {
		if !data.ValidUUID(in.VersionID) {
			return ActionResult{}, errors.New("A saved script version is required")
		}
		var raw []byte
		err = e.db.QueryRowContext(ctx, `SELECT v.snapshot FROM script_versions v JOIN scripts s ON s.id=v.script_id WHERE s.user_id=$1 AND s.id=$2 AND v.id=$3 AND v.version_number<$4`, user, in.ID, in.VersionID, in.Revision).Scan(&raw)
		if err != nil {
			return ActionResult{}, err
		}
		var snapshot map[string]any
		if json.Unmarshal(raw, &snapshot) != nil || !reflect.DeepEqual(snapshot, normalized.Snapshot) {
			return ActionResult{}, errors.New("Undo document does not match its saved version")
		}
		changeType = "restore"
	}
	current, err := e.scripts.Get(ctx, user, in.ID)
	if err != nil {
		return ActionResult{}, err
	}
	marker := "Workspace agent execution " + requestID
	if current.Revision == in.Revision+1 {
		var found bool
		err = e.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM script_versions v JOIN scripts s ON s.id=v.script_id WHERE s.id=$1 AND s.user_id=$2 AND v.id=s.current_version_id AND v.summary=$3)`, in.ID, user, marker).Scan(&found)
		actual := scriptDocument(current)
		if err == nil && found && reflect.DeepEqual(actual, normalized) {
			return actionResult("Script changes verified", "/dashboard/script-generator", current), nil
		}
		if err != nil {
			return ActionResult{}, err
		}
		return ActionResult{}, scripts.ErrRevisionConflict
	}
	var beforeVersion string
	err = e.db.QueryRowContext(ctx, `SELECT current_version_id FROM scripts WHERE id=$1 AND user_id=$2 AND revision=$3`, in.ID, user, in.Revision).Scan(&beforeVersion)
	if err != nil {
		return ActionResult{}, err
	}
	if current.Revision != in.Revision {
		return ActionResult{}, scripts.ErrRevisionConflict
	}
	v, err := e.scripts.Update(ctx, user, in.ID, normalized, in.Revision, changeType, marker)
	if err != nil {
		return ActionResult{}, err
	}
	result := actionResult("Script changes saved with revision history", "/dashboard/script-generator", v)
	result.Undo = actionJSON(Action{Name: "scripts.restore", Input: actionJSON(scriptMutation{ID: in.ID, Revision: v.Revision, VersionID: beforeVersion, Document: scriptDocument(current)})})
	return result, nil
}
