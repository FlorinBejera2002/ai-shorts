package account

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"sneepcut/backend-go/internal/agentaction"
	"sneepcut/backend-go/internal/data"
)

type AgentProfile struct {
	Name          *string `json:"name"`
	ExpectedState string  `json:"expected_state"`
	Previous      *string `json:"previous,omitempty"`
}

func agentProfile(ctx context.Context, q interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}, user string) (out AgentProfile, err error) {
	var raw []byte
	err = q.QueryRowContext(ctx, `SELECT jsonb_build_object('name',name,'updated_at',updated_at) FROM users WHERE id=$1`, user).Scan(&raw)
	if err != nil {
		return out, err
	}
	if err = json.Unmarshal(raw, &out); err != nil {
		return out, err
	}
	sum := sha256.Sum256(raw)
	out.ExpectedState = hex.EncodeToString(sum[:])
	return out, nil
}
func AgentReadProfile(ctx context.Context, db *sql.DB, user string) (AgentProfile, error) {
	return agentProfile(ctx, db, user)
}
func AgentUpdateProfile(ctx context.Context, db *sql.DB, user, request, expected string, name *string, restore bool) (out AgentProfile, err error) {
	if !data.ValidUUID(request) || len(expected) != 64 {
		return out, errors.New("Invalid profile update")
	}
	if !restore {
		if name == nil {
			return out, errors.New("Invalid profile name")
		}
		in := ProfileInput{Name: *name}
		if err = in.Validate(); err != nil {
			return out, err
		}
		name = &in.Name
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return out, err
	}
	defer tx.Rollback()
	input := struct {
		Expected string
		Name     *string
		Restore  bool
	}{expected, name, restore}
	replay, err := agentaction.Replay(ctx, tx, user, request, "settings.profile", input, &out)
	if err != nil {
		return out, err
	}
	if replay {
		return out, tx.Commit()
	}
	var active bool
	if err = tx.QueryRowContext(ctx, `SELECT access_role='member' AND NOT email_activation_required AND NOT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=$1) FROM users WHERE id=$1 FOR UPDATE`, user).Scan(&active); err != nil {
		return out, err
	}
	if !active {
		return out, errors.New("Account is unavailable")
	}
	before, err := agentProfile(ctx, tx, user)
	if err != nil {
		return out, err
	}
	if expected != before.ExpectedState {
		return out, agentaction.ErrConflict
	}
	if _, err = tx.ExecContext(ctx, `UPDATE users SET name=$2,updated_at=clock_timestamp() WHERE id=$1`, user, name); err != nil {
		return out, err
	}
	out, err = agentProfile(ctx, tx, user)
	if err != nil {
		return out, err
	}
	out.Previous = before.Name
	if err = agentaction.Put(ctx, tx, user, request, "settings.profile", input, out); err != nil {
		return out, err
	}
	return out, tx.Commit()
}
