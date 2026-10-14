package stories

import (
	"context"
	"database/sql"
	"encoding/json"
)

// ProjectSnapshot binds the response and optimistic edit token to one MVCC
// snapshot. Concurrent uploads remain successful and cannot mix source states.
func (r *Repository) ProjectSnapshot(ctx context.Context, user, id string) (Project, []Lock, string, error) {
	tx, err := r.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		return Project{}, nil, "", err
	}
	defer tx.Rollback()
	project, err := readProject(ctx, tx, r.limits, user, id)
	if err != nil {
		return Project{}, nil, "", err
	}
	state, err := agentState(ctx, tx, user, id)
	if err != nil {
		return Project{}, nil, "", err
	}
	var raw []byte
	var locks []Lock
	if err = tx.QueryRowContext(ctx, "SELECT locks FROM story_projects WHERE id=$1 AND user_id=$2", id, user).Scan(&raw); err != nil {
		return Project{}, nil, "", err
	}
	if err = json.Unmarshal(raw, &locks); err != nil {
		return Project{}, nil, "", err
	}
	if err = tx.Commit(); err != nil {
		return Project{}, nil, "", err
	}
	return project, locks, state, nil
}
