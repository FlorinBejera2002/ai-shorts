package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"sneepcut/backend-go/internal/data"
)

// AgentControlState deliberately omits source paths, URLs and worker tokens.
type AgentControlState struct {
	ID               string `json:"id"`
	Name             string `json:"name"`
	SourceType       string `json:"source_type"`
	Status           string `json:"status"`
	Progress         int    `json:"progress"`
	Credits          int    `json:"credits_charged"`
	ProcessingActive bool   `json:"processing_active"`
}

func (h *Handler) AgentList(ctx context.Context, user string) ([]AgentControlState, error) {
	rows, err := h.repo.db.QueryContext(ctx, `SELECT id,coalesce(nullif(project_name,''),'Untitled project'),source_type,status,progress,credits_charged,processing_active FROM jobs WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100`, user)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AgentControlState{}
	for rows.Next() {
		var state AgentControlState
		if err = rows.Scan(&state.ID, &state.Name, &state.SourceType, &state.Status, &state.Progress, &state.Credits, &state.ProcessingActive); err != nil {
			return nil, err
		}
		out = append(out, state)
	}
	return out, rows.Err()
}

// Non-story jobs cannot be restarted under the same identity, and Cancel is
// already transactional and idempotent. Story revisions use a separate fence.
func (h *Handler) AgentCancelOwned(ctx context.Context, user, id string) (AgentControlState, error) {
	var state AgentControlState
	if !data.ValidUUID(id) {
		return state, errors.New("A valid processing job ID is required")
	}
	var sourceType string
	if err := h.repo.db.QueryRowContext(ctx, `SELECT source_type FROM jobs WHERE id=$1 AND user_id=$2`, id, user).Scan(&sourceType); err != nil {
		return state, err
	}
	if sourceType == "story" {
		return state, errors.New("Use stories.cancel for a story, or runs.control for its active agent operation")
	}
	raw, err := h.repo.Cancel(ctx, user, id)
	if err != nil {
		return state, err
	}
	if err = json.Unmarshal(raw, &state); err != nil {
		return state, err
	}
	return state, nil
}
