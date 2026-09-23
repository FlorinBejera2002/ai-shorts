package clips

import (
	"net/http"
	"sneepcut/backend-go/internal/identity"
)

func (h *Handler) improveTransitions(w http.ResponseWriter, r *http.Request) {
	id := requestID(w, r)
	if id == "" {
		return
	}
	taskID, err := h.beginEdit(r.Context(), identity.Current(r).User.ID, id, "transition", map[string]any{})
	if err != nil {
		failure(w, err)
		return
	}
	reply(w, http.StatusAccepted, map[string]any{"task_id": taskID, "status": "processing"})
}
