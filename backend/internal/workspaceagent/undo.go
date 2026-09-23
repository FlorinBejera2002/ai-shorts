package workspaceagent

import (
	"encoding/json"
	"net/http"
	"sneepcut/backend-go/internal/httpx"
	"sneepcut/backend-go/internal/identity"
)

// Undo is a new audited execution of a server-authored compensation. Its stable
// identity makes repeated clicks resolve to the same run. Domain revision checks
// protect manual changes made after the original action.
func (h *Handler) undo(w http.ResponseWriter, r *http.Request, source Run) {
	if source.Status != "completed" || source.Result == nil || len(source.Result.Undo) == 0 {
		failure(w, ErrConflict)
		return
	}
	var action Action
	if json.Unmarshal(source.Result.Undo, &action) != nil || !undoActionAllowed(action.Name) {
		failure(w, ErrConflict)
		return
	}
	id := derivedID(source.ID + ":undo")
	_, err := h.db.ExecContext(r.Context(), `INSERT INTO workspace_agent_runs(id,user_id,session_id,request_hash,message,status,context,action) VALUES($1,$2,$3,$4,$5,'running',$6,$7) ON CONFLICT(id) DO NOTHING`, id, source.UserID, identity.Current(r).SessionID, digest(action), clipText("Undo: "+source.Message, 4000), encode(source.Context), encode(action))
	if err != nil {
		failure(w, err)
		return
	}
	run, err := h.get(r.Context(), source.UserID, id)
	if err != nil {
		failure(w, err)
		return
	}
	httpx.JSON(w, 202, run)
}

func undoActionAllowed(name string) bool {
	switch name {
	case "brand.logo.restore", "settings.preferences.update", "stories.rollback", "projects.brand.restore", "clips.metadata", "scripts.restore", "projects.restore", "brand.restore", "stories.restore_settings", "studio.restore", "settings.restore", "folders.delete", "folders.update", "clips.move":
		return true
	}
	return false
}
