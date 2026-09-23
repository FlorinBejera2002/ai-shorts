package stories

import (
	"context"
	"database/sql"
	"errors"
	"sneepcut/backend-go/internal/agentaction"
)

type LifecycleInput struct {
	ID            string `json:"id"`
	ExpectedState string `json:"expected_state"`
	Version       int    `json:"version,omitempty"`
	AssetID       string `json:"asset_id,omitempty"`
}
type LifecycleResult struct {
	ID             string          `json:"id"`
	Deleted        bool            `json:"deleted,omitempty"`
	Pending        bool            `json:"pending,omitempty"`
	CurrentVersion int             `json:"current_version,omitempty"`
	ExpectedState  string          `json:"expected_state,omitempty"`
	RemovedAsset   string          `json:"removed_asset,omitempty"`
	Undo           *LifecycleInput `json:"undo,omitempty"`
}
type lifecycleDeleteGuard struct {
	RequestID string
	Input     LifecycleInput
	Result    LifecycleResult
}

func checkLifecycleState(ctx context.Context, tx *sql.Tx, user, id, expected string) error {
	if err := checkLifecycleMember(ctx, tx, user); err != nil {
		return err
	}
	state, err := agentState(ctx, tx, user, id)
	if err != nil {
		return err
	}
	if state != expected {
		return ErrConflict
	}
	return nil
}
func checkLifecycleMember(ctx context.Context, tx *sql.Tx, user string) error {
	var member bool
	if err := tx.QueryRowContext(ctx, `SELECT access_role='member' AND NOT email_activation_required AND NOT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=$1) FROM users WHERE id=$1 FOR UPDATE`, user).Scan(&member); err != nil {
		return err
	}
	if !member {
		return errors.New("Account is unavailable")
	}
	return nil
}
func finishLifecycleDelete(ctx context.Context, tx *sql.Tx, user string, g *lifecycleDeleteGuard) error {
	_, err := tx.ExecContext(ctx, `UPDATE agent_action_receipts SET result=$3 WHERE user_id=$1 AND request_id=$2 AND action='stories.delete'`, user, g.RequestID, encoded(g.Result))
	return err
}

func (h *Handler) AgentLifecycle(ctx context.Context, user, request, action string, in LifecycleInput) (LifecycleResult, error) {
	result := LifecycleResult{ID: in.ID}
	if !idPattern.MatchString(in.ID) || !idPattern.MatchString(request) || len(in.ExpectedState) != 64 {
		return result, ErrInvalid
	}
	switch action {
	case "stories.delete":
		if in.Version != 0 || in.AssetID != "" || h.media == nil {
			return result, ErrInvalid
		}
		guard := &lifecycleDeleteGuard{RequestID: request, Input: in}
		err := h.repo.deleteGuarded(ctx, user, in.ID, h.media, guard)
		return guard.Result, err
	case "stories.rollback":
		if in.Version < 1 || in.AssetID != "" {
			return result, ErrInvalid
		}
	case "stories.remove_asset":
		if in.Version != 0 || !idPattern.MatchString(in.AssetID) {
			return result, ErrInvalid
		}
	default:
		return result, ErrInvalid
	}
	tx, err := h.repo.db.BeginTx(ctx, nil)
	if err != nil {
		return result, err
	}
	defer tx.Rollback()
	found, err := agentaction.Replay(ctx, tx, user, request, action, in, &result)
	if err != nil || found {
		return result, err
	}
	if _, err = lockProject(ctx, tx, user, in.ID); err != nil {
		return result, err
	}
	if action == "stories.rollback" {
		var job string
		if err = tx.QueryRowContext(ctx, `SELECT id FROM jobs WHERE id=$1 AND user_id=$2 FOR UPDATE`, in.ID, user).Scan(&job); err != nil && !errors.Is(err, sql.ErrNoRows) {
			return result, err
		}
	}
	if err = checkLifecycleState(ctx, tx, user, in.ID, in.ExpectedState); err != nil {
		return result, err
	}
	var previous int
	if err = tx.QueryRowContext(ctx, `SELECT current_version FROM story_projects WHERE id=$1`, in.ID).Scan(&previous); err != nil {
		return result, err
	}
	if action == "stories.rollback" {
		var key string
		if err = tx.QueryRowContext(ctx, `SELECT version->'output'->>'key' FROM story_versions WHERE project_id=$1 AND number=$2`, in.ID, in.Version).Scan(&key); err != nil {
			return result, err
		}
		verifier, ok := h.media.(interface {
			Exists(context.Context, string) (bool, error)
		})
		if !ok {
			return result, errors.New("Story artifact verification is unavailable")
		}
		exists, e := verifier.Exists(ctx, key)
		if e != nil || !exists {
			return result, errors.New("Selected story version is missing from storage")
		}
		if err = h.repo.rollbackTx(ctx, tx, user, in.ID, in.Version, request); err != nil {
			return result, err
		}
	} else {
		var exists bool
		if err = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM story_assets WHERE project_id=$1 AND id=$2)`, in.ID, in.AssetID).Scan(&exists); err != nil {
			return result, err
		}
		if !exists {
			return result, sql.ErrNoRows
		}
		if err = h.repo.removeAssetTx(ctx, tx, user, in.ID, in.AssetID); err != nil {
			return result, err
		}
		result.RemovedAsset = in.AssetID
	}
	if err = tx.QueryRowContext(ctx, `SELECT current_version FROM story_projects WHERE id=$1`, in.ID).Scan(&result.CurrentVersion); err != nil {
		return result, err
	}
	result.ExpectedState, err = agentState(ctx, tx, user, in.ID)
	if err != nil {
		return result, err
	}
	if action == "stories.rollback" && previous > 0 {
		result.Undo = &LifecycleInput{ID: in.ID, ExpectedState: result.ExpectedState, Version: previous}
	}
	if err = agentaction.Put(ctx, tx, user, request, action, in, result); err != nil {
		return result, err
	}
	return result, tx.Commit()
}

func (h *Handler) AgentLifecyclePreview(ctx context.Context, user string, in LifecycleInput) (map[string]any, error) {
	if !idPattern.MatchString(in.ID) || len(in.ExpectedState) != 64 || in.Version != 0 || in.AssetID != "" {
		return nil, ErrInvalid
	}
	tx, err := h.repo.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	state, err := agentState(ctx, tx, user, in.ID)
	if err != nil {
		return nil, err
	}
	if state != in.ExpectedState {
		return nil, ErrConflict
	}
	var status, title string
	var version, assets int
	if err = tx.QueryRowContext(ctx, `SELECT p.status,p.current_version,coalesce(v.version->'plan'->>'title','Story project'),(SELECT count(*) FROM story_assets WHERE project_id=p.id) FROM story_projects p LEFT JOIN story_versions v ON v.project_id=p.id AND v.number=p.current_version WHERE p.id=$1 AND p.user_id=$2`, in.ID, user).Scan(&status, &version, &title, &assets); err != nil {
		return nil, err
	}
	if !idle(status) && status != "deleting" {
		return nil, ErrConflict
	}
	result := map[string]any{"action": "stories.delete", "story_id": in.ID, "title": title, "current_version": version, "asset_count": assets, "expected_state": state, "irreversible": true, "effect": "Permanently delete this story, all its versions, library outputs and derived media. Shared original uploads remain in your library. No Undo is available."}
	return result, tx.Commit()
}
