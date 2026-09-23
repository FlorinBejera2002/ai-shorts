package workspaceagent

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

var ErrConflict = errors.New("The operation changed. Refresh its current state before continuing.")
var ErrUnavailable = errors.New("This action is not available to the workspace agent.")

func encode(v any) string { b, _ := json.Marshal(v); return string(b) }
func digest(v any) string {
	// JSONB and model responses may reorder object keys. Hash the semantic JSON,
	// so reordered fields cannot evade duplicate-step or request checks.
	raw := encode(v)
	var canonical any
	decoder := json.NewDecoder(strings.NewReader(raw))
	decoder.UseNumber()
	if decoder.Decode(&canonical) == nil {
		raw = encode(canonical)
	}
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

const runColumns = `id,user_id,session_id,message,reply,status,context,action,result,error,cost_credits,revision,created_at,updated_at,steps,continue_plan,resource_ids,missing_resources,approval_preview`

func scanRun(row interface{ Scan(...any) error }) (Run, error) {
	var r Run
	var scope, action, result, steps, resources, missing, preview []byte
	err := row.Scan(&r.ID, &r.UserID, &r.SessionID, &r.Message, &r.Reply, &r.Status, &scope, &action, &result, &r.Error, &r.CostCredits, &r.Revision, &r.CreatedAt, &r.UpdatedAt, &steps, &r.Continue, &resources, &missing, &preview)
	if err != nil {
		return r, err
	}
	r.ApprovalPreview = preview
	if err = json.Unmarshal(scope, &r.Context); err != nil {
		return r, err
	}
	if len(action) > 0 {
		if err = json.Unmarshal(action, &r.Action); err != nil {
			return r, err
		}
	}
	if len(result) > 0 {
		err = json.Unmarshal(result, &r.Result)
	}
	if err == nil {
		err = json.Unmarshal(steps, &r.Steps)
	}
	if err == nil {
		err = json.Unmarshal(resources, &r.ResourceIDs)
	}
	if err == nil {
		err = json.Unmarshal(missing, &r.MissingResources)
	}
	return r, err
}
func (h *Handler) get(ctx context.Context, user, id string) (Run, error) {
	return scanRun(h.db.QueryRowContext(ctx, `SELECT `+runColumns+` FROM workspace_agent_runs WHERE user_id=$1 AND id=$2`, user, id))
}

func (h *Handler) save(ctx context.Context, r *Run) error {
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var action, result any
	if r.Action != nil {
		action = encode(r.Action)
	}
	if r.Result != nil {
		result = encode(r.Result)
	}
	finishedDispatch := r.Result != nil || r.Status == "completed" || r.Status == "failed" || r.Status == "cancelled"
	if r.Steps == nil {
		r.Steps = []Step{}
	}
	err = tx.QueryRowContext(ctx, `UPDATE workspace_agent_runs SET reply=$3,status=$4,action=$5,result=$6,error=$7,cost_credits=$8,revision=revision+1,updated_at=clock_timestamp(),next_check_at=now()+interval '2 seconds',executing=CASE WHEN $9 THEN false ELSE executing END,steps=$10,continue_plan=$11 WHERE id=$1 AND revision=$2 RETURNING revision,updated_at`, r.ID, r.Revision, r.Reply, r.Status, action, result, r.Error, r.CostCredits, finishedDispatch, encode(r.Steps), r.Continue).Scan(&r.Revision, &r.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrConflict
	}
	if err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE workspace_agent_runs SET missing_resources=$2,context=$3,resource_ids=$4 WHERE id=$1`, r.ID, encode(r.MissingResources), encode(r.Context), encode(r.ResourceIDs)); err != nil {
		return err
	}
	var preview any
	if len(r.ApprovalPreview) > 0 {
		preview = string(r.ApprovalPreview)
	}
	if _, err = tx.ExecContext(ctx, `UPDATE workspace_agent_runs SET approval_preview=$2 WHERE id=$1`, r.ID, preview); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO workspace_agent_events(run_id,sequence,status) VALUES($1,$2,$3)`, r.ID, r.Revision, r.Status); err != nil {
		return err
	}
	return tx.Commit()
}

func (h *Handler) authorized(ctx context.Context, r Run) bool {
	var ok bool
	err := h.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM users u JOIN sessions s ON s.user_id=u.id WHERE u.id=$1 AND s.session_token=$2 AND s.expires>now() AND u.access_role='member' AND NOT u.email_activation_required AND NOT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=u.id))`, r.UserID, "go-jwt:"+r.SessionID).Scan(&ok)
	return err == nil && ok
}

// Only compare-and-swap transitions are accepted: stale approvals cannot approve
// a different plan, and polling never writes user-visible state optimistically.
func transition(r *Run, command string) error {
	switch command {
	case "pause":
		if r.Status != "planning" && r.Status != "running" {
			return ErrConflict
		}
		r.Status = "paused"
	case "resume":
		if r.Status != "paused" {
			return ErrConflict
		}
		r.Status = "planning"
		if r.Action != nil {
			r.Status = "running"
		}
	case "stop", "reject":
		if r.Status == "completed" || r.Status == "cancelled" || r.Status == "failed" {
			return ErrConflict
		}
		if r.Result != nil && r.Result.Pending || r.Status == "running" || r.Status == "paused" && r.Action != nil {
			r.Status = "cancel_requested"
		} else {
			r.Status = "cancelled"
		}
	case "approve":
		if r.Status != "waiting_for_confirmation" || r.Action == nil {
			return ErrConflict
		}
		r.Status = "running"
	default:
		return fmt.Errorf("invalid control")
	}
	return nil
}
