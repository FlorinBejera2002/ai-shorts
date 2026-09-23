package projects

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"
)

var ErrProjectChanged = errors.New("Project changed after it was inspected; refresh before renaming")

type RenameInput struct {
	Name              *string   `json:"name"`
	ExpectedUpdatedAt time.Time `json:"expected_updated_at"`
	Restore           bool      `json:"restore"`
}
type RenameResult struct {
	ID           string    `json:"id"`
	Name         *string   `json:"name"`
	PreviousName *string   `json:"previous_name"`
	UpdatedAt    time.Time `json:"updated_at"`
}
type projectUpdater interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

// updateProject is shared by manual and conditional project mutations.
func updateProject(ctx context.Context, q projectUpdater, user, id string, in ProjectUpdate, replaceName bool) (time.Time, error) {
	var updated time.Time
	err := q.QueryRowContext(ctx, `UPDATE jobs SET project_name=CASE WHEN $5::boolean THEN $3::text ELSE COALESCE($3::text,project_name) END,project_brand=COALESCE($4::jsonb,project_brand),updated_at=clock_timestamp() WHERE id=$1 AND user_id=$2 RETURNING updated_at`, id, user, in.Name, nullableJSON(in.BrandKit), replaceName).Scan(&updated)
	return updated, err
}

// RenameConditional checks ownership, current revision and replay receipt in one
// transaction. A worker or manual edit updates the same revision timestamp.
func (r *Repository) RenameConditional(ctx context.Context, user, id, requestID string, in RenameInput) (RenameResult, error) {
	if !uuidPattern.MatchString(id) || !uuidPattern.MatchString(requestID) || in.ExpectedUpdatedAt.IsZero() {
		return RenameResult{}, ErrInvalid
	}
	update := ProjectUpdate{Name: in.Name}
	if !in.Restore || in.Name != nil && *in.Name != "" {
		if err := update.Validate(); err != nil {
			return RenameResult{}, err
		}
		in.Name = update.Name
	}
	in.ExpectedUpdatedAt = in.ExpectedUpdatedAt.UTC()
	raw, err := json.Marshal(in)
	if err != nil {
		return RenameResult{}, err
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return RenameResult{}, err
	}
	defer tx.Rollback()
	// Match clip editing and worker lock order: project before its owner.
	var previous sql.NullString
	var stamp time.Time
	if err = tx.QueryRowContext(ctx, `SELECT project_name,updated_at FROM jobs WHERE id=$1 AND user_id=$2 FOR UPDATE`, id, user).Scan(&previous, &stamp); err != nil {
		return RenameResult{}, err
	}
	var active bool
	err = tx.QueryRowContext(ctx, `SELECT access_role='member' AND NOT email_activation_required FROM users WHERE id=$1 FOR UPDATE`, user).Scan(&active)
	if err != nil {
		return RenameResult{}, err
	}
	if !active {
		return RenameResult{}, ErrInvalid
	}
	var deleting bool
	if err = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=$1)`, user).Scan(&deleting); err != nil {
		return RenameResult{}, err
	}
	if deleting {
		return RenameResult{}, ErrInvalid
	}
	var receipt []byte
	var same bool
	err = tx.QueryRowContext(ctx, `SELECT result,input=$3::jsonb AND project_id=$4 FROM project_agent_edits WHERE user_id=$1 AND request_id=$2`, user, requestID, string(raw), id).Scan(&receipt, &same)
	if err == nil {
		if !same {
			return RenameResult{}, ErrProjectChanged
		}
		var result RenameResult
		if err = json.Unmarshal(receipt, &result); err != nil {
			return result, err
		}
		return result, tx.Commit()
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return RenameResult{}, err
	}
	if !stamp.Equal(in.ExpectedUpdatedAt) {
		return RenameResult{}, ErrProjectChanged
	}
	result := RenameResult{ID: id, Name: in.Name}
	if previous.Valid {
		result.PreviousName = &previous.String
	}
	result.UpdatedAt, err = updateProject(ctx, tx, user, id, ProjectUpdate{Name: in.Name}, true)
	if err != nil {
		return result, err
	}
	encoded, err := json.Marshal(result)
	if err != nil {
		return result, err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO project_agent_edits(user_id,request_id,project_id,input,result) VALUES($1,$2,$3,$4,$5)`, user, requestID, id, string(raw), string(encoded)); err != nil {
		return result, err
	}
	return result, tx.Commit()
}
