// Package agentaction stores domain receipts in the same transaction as effects.
package agentaction

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
)

var ErrConflict = errors.New("The action changed; inspect the current target before retrying")

// Replay serializes the request and returns a committed receipt if one exists.
// Call before domain locks, then Put in the same transaction as the mutation.
func Replay(ctx context.Context, tx *sql.Tx, user, request, action string, input any, result any) (bool, error) {
	raw, err := json.Marshal(input)
	if err != nil {
		return false, err
	}
	if _, err = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, "agent-action:"+user+":"+request); err != nil {
		return false, err
	}
	var saved []byte
	var equal bool
	err = tx.QueryRowContext(ctx, `SELECT result,(action=$3 AND input=$4::jsonb) FROM agent_action_receipts WHERE user_id=$1 AND request_id=$2`, user, request, action, string(raw)).Scan(&saved, &equal)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if !equal {
		return false, ErrConflict
	}
	return true, json.Unmarshal(saved, result)
}

func Put(ctx context.Context, tx *sql.Tx, user, request, action string, input, result any) error {
	in, err := json.Marshal(input)
	if err != nil {
		return err
	}
	out, err := json.Marshal(result)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO agent_action_receipts(user_id,request_id,action,input,result) VALUES($1,$2,$3,$4,$5)`, user, request, action, string(in), string(out))
	return err
}
