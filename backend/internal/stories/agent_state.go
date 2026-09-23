package stories

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
)

type stateReader interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

// AgentState binds a proposed operation to the full editable source state.
func (r *Repository) AgentState(ctx context.Context, user, id string) (string, error) {
	return agentState(ctx, r.db, user, id)
}
func agentState(ctx context.Context, q stateReader, user, id string) (string, error) {
	var raw []byte
	err := q.QueryRowContext(ctx, `SELECT jsonb_build_object('options',p.options,'version',p.current_version,'status',p.status,'locks',p.locks,'assets',COALESCE((SELECT jsonb_agg(a.asset ORDER BY a.id) FROM story_assets a WHERE a.project_id=p.id),'[]'::jsonb)) FROM story_projects p WHERE p.id=$1 AND p.user_id=$2`, id, user).Scan(&raw)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:]), nil
}
