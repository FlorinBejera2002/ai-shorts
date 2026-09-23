package workspaceagent

import (
	"database/sql"
	"errors"
	"net/http"
	"sneepcut/backend-go/internal/httpx"
	"sneepcut/backend-go/internal/identity"
)

type agentPreferences struct {
	Follow          bool `json:"follow"`
	Recommendations bool `json:"recommendations"`
}

func (h *Handler) preferences(w http.ResponseWriter, r *http.Request) {
	out := agentPreferences{Recommendations: true}
	err := h.db.QueryRowContext(r.Context(), `SELECT follow,recommendations FROM workspace_agent_preferences WHERE user_id=$1`, identity.Current(r).User.ID).Scan(&out.Follow, &out.Recommendations)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		failure(w, err)
		return
	}
	httpx.JSON(w, 200, out)
}
func (h *Handler) savePreferences(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Follow          *bool `json:"follow"`
		Recommendations *bool `json:"recommendations"`
		Reset           bool  `json:"reset"`
	}
	if !httpx.Read(w, r, &in, 1024) {
		return
	}
	user := identity.Current(r).User.ID
	if in.Reset {
		_, err := h.db.ExecContext(r.Context(), `DELETE FROM workspace_agent_preferences WHERE user_id=$1`, user)
		if err != nil {
			failure(w, err)
			return
		}
		h.preferences(w, r)
		return
	}
	if in.Follow == nil && in.Recommendations == nil {
		httpx.Error(w, 422, "Provide a preference to update")
		return
	}
	_, err := h.db.ExecContext(r.Context(), `INSERT INTO workspace_agent_preferences(user_id,follow,recommendations) VALUES($1,COALESCE($2,false),COALESCE($3,true)) ON CONFLICT(user_id) DO UPDATE SET follow=COALESCE($2,workspace_agent_preferences.follow),recommendations=COALESCE($3,workspace_agent_preferences.recommendations)`, user, in.Follow, in.Recommendations)
	if err != nil {
		failure(w, err)
		return
	}
	h.preferences(w, r)
}
func (h *Handler) clearHistory(w http.ResponseWriter, r *http.Request) {
	var in struct{}
	if !httpx.Read(w, r, &in, 1024) {
		return
	}
	rows, err := h.db.QueryContext(r.Context(), `UPDATE workspace_agent_runs SET history_cleared_at=clock_timestamp() WHERE user_id=$1 AND status IN ('completed','failed','cancelled') AND history_cleared_at IS NULL RETURNING id`, identity.Current(r).User.ID)
	if err != nil {
		failure(w, err)
		return
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			failure(w, err)
			return
		}
		ids = append(ids, id)
	}
	if err = rows.Err(); err != nil {
		failure(w, err)
		return
	}
	httpx.JSON(w, 200, map[string]any{"cleared_ids": ids})
}
