package stories

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"sneepcut/backend-go/internal/agentaction"
	"sneepcut/backend-go/internal/story"
)

type AgentPatchResult struct {
	ExpectedState string `json:"expected_state"`
	Previous      Patch  `json:"previous"`
}

func (r *Repository) AgentPatch(ctx context.Context, user, id, request, expected string, in Patch) (out AgentPatchResult, err error) {
	if !idPattern.MatchString(id) || !idPattern.MatchString(request) || len(expected) != 64 {
		return out, ErrInvalid
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return out, err
	}
	defer tx.Rollback()
	input := struct {
		ID, Expected string
		Patch        Patch
	}{id, expected, in}
	replay, err := agentaction.Replay(ctx, tx, user, request, "stories.patch", input, &out)
	if err != nil {
		return out, err
	}
	if replay {
		return out, tx.Commit()
	}
	if _, err = lockProject(ctx, tx, user, id); err != nil {
		return out, err
	}
	var job string
	if err = tx.QueryRowContext(ctx, `SELECT id FROM jobs WHERE id=$1 AND user_id=$2 FOR UPDATE`, id, user).Scan(&job); err != nil && !errors.Is(err, sql.ErrNoRows) {
		return out, err
	}
	if err = checkLifecycleMember(ctx, tx, user); err != nil {
		return out, err
	}
	state, err := agentState(ctx, tx, user, id)
	if err != nil {
		return out, err
	}
	if state != expected {
		return out, ErrConflict
	}
	var options, locks []byte
	var version int
	if err = tx.QueryRowContext(ctx, `SELECT options,locks,current_version FROM story_projects WHERE id=$1`, id).Scan(&options, &locks, &version); err != nil {
		return out, err
	}
	out.Previous.Version = version
	if in.Options != nil {
		var before story.Options
		if err = json.Unmarshal(options, &before); err != nil {
			return out, err
		}
		out.Previous.Options = &before
	}
	if in.Locks != nil {
		if err = json.Unmarshal(locks, &out.Previous.Locks); err != nil {
			return out, err
		}
		if out.Previous.Locks == nil {
			out.Previous.Locks = []Lock{}
		}
	}
	if in.Assets != nil {
		out.Previous.Assets = []AssetEdit{}
		rows, e := tx.QueryContext(ctx, `SELECT asset FROM story_assets WHERE project_id=$1 ORDER BY id`, id)
		if e != nil {
			return out, e
		}
		for rows.Next() {
			var raw []byte
			var a story.Asset
			if e = rows.Scan(&raw); e == nil {
				e = json.Unmarshal(raw, &a)
			}
			if e != nil {
				rows.Close()
				return out, e
			}
			out.Previous.Assets = append(out.Previous.Assets, AssetEdit{ID: a.ID, Role: a.Role, Include: a.Include, Order: a.Order})
		}
		e = rows.Err()
		rows.Close()
		if e != nil {
			return out, e
		}
	}
	if err = r.patchTx(ctx, tx, user, id, in); err != nil {
		return out, err
	}
	out.ExpectedState, err = agentState(ctx, tx, user, id)
	if err != nil {
		return out, err
	}
	if err = agentaction.Put(ctx, tx, user, request, "stories.patch", input, out); err != nil {
		return out, err
	}
	return out, tx.Commit()
}
