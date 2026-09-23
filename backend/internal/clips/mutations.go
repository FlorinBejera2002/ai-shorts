package clips

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"time"
)

type domainError struct {
	status  int
	message string
}

func (e domainError) Error() string { return e.message }

var errBusy = domainError{409, "Wait for active processing to finish"}

func newID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(err)
	}
	b[6] = (b[6] & 15) | 64
	b[8] = (b[8] & 63) | 128
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[:4], b[4:6], b[6:8], b[8:10], b[10:])
}

// Lock jobs before editing/deleting clips, matching the Python worker lock order.
func lockClip(ctx context.Context, tx *sql.Tx, userID, id string) (string, error) {
	var jobID string
	if err := tx.QueryRowContext(ctx, `SELECT job_id FROM clips WHERE id=$1 AND user_id=$2`, id, userID).Scan(&jobID); err != nil {
		return "", err
	}
	var active bool
	var edits int
	if err := tx.QueryRowContext(ctx, `SELECT processing_active,active_edit_tasks FROM jobs WHERE id=$1 AND user_id=$2 FOR UPDATE`, jobID, userID).Scan(&active, &edits); err != nil {
		return "", err
	}
	if active || edits > 0 {
		return "", errBusy
	}
	var exists bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM clips WHERE id=$1 AND user_id=$2 AND job_id=$3)`, id, userID, jobID).Scan(&exists); err != nil {
		return "", err
	}
	if !exists {
		return "", sql.ErrNoRows
	}
	return jobID, nil
}

func (h *Handler) beginEdit(ctx context.Context, userID, id, kind string, payload map[string]any) (string, error) {
	return h.beginEditGuarded(ctx, userID, id, kind, payload, nil)
}

func (h *Handler) beginEditGuarded(ctx context.Context, userID, id, kind string, payload map[string]any, guard *agentEditGuard) (string, error) {
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()
	if guard != nil {
		if _, err = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, "agent-clip-edit:"+guard.RequestID); err != nil {
			return "", err
		}
		var owner, priorClip, priorKind, priorHash string
		err = tx.QueryRowContext(ctx, `SELECT j.user_id,d.clip_id,d.kind,coalesce(d.payload->>'agent_request_hash','') FROM edit_deliveries d JOIN jobs j ON j.id=d.job_id WHERE d.task_id=$1`, guard.RequestID).Scan(&owner, &priorClip, &priorKind, &priorHash)
		if err == nil {
			if owner != userID {
				return "", sql.ErrNoRows
			}
			if priorClip != id || priorKind != kind || priorHash != guard.RequestHash {
				return "", ErrAgentConflict
			}
			return guard.RequestID, tx.Commit()
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return "", err
		}
	}
	jobID, err := lockClip(ctx, tx, userID, id)
	if err != nil {
		return "", err
	}
	var storyClip bool
	if err = tx.QueryRowContext(ctx, `SELECT story_project_id IS NOT NULL FROM clips WHERE id=$1`, id).Scan(&storyClip); err != nil {
		return "", err
	}
	if storyClip {
		return "", domainError{409, "Edit this clip in Story Builder so its sources, captions and review remain synchronized"}
	}
	// Serializes with account freezing and role changes while holding the job
	// lock in the same order as the retained worker's cancellation/refund paths.
	var active bool
	if err = tx.QueryRowContext(ctx, `SELECT access_role='member' AND NOT email_activation_required AND NOT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=$1) FROM users WHERE id=$1 FOR UPDATE`, userID).Scan(&active); err != nil {
		return "", err
	}
	if !active {
		return "", domainError{403, "Account is unavailable"}
	}
	if guard != nil {
		current, stateErr := agentRead(ctx, tx, userID, id, true)
		if stateErr != nil {
			return "", stateErr
		}
		if current.ExpectedState != guard.ExpectedState {
			return "", ErrAgentConflict
		}
		if kind == "trim" && payload["end_time"].(float64) > current.Duration {
			return "", domainError{422, "Trim exceeds the inspected clip duration"}
		}
		payload["agent_request_hash"] = guard.RequestHash
		payload["agent_expected_state"] = guard.ExpectedState
	}
	var available bool
	if kind == "trim" {
		err = tx.QueryRowContext(ctx, `SELECT file_path<>'' FROM clips WHERE id=$1`, id).Scan(&available)
	} else {
		err = tx.QueryRowContext(ctx, `SELECT COALESCE(source_storage_key,source_video_url,source_file_path,'')<>'' FROM jobs WHERE id=$1`, jobID).Scan(&available)
	}
	if err != nil {
		return "", err
	}
	if !available {
		return "", domainError{400, "Source video not available"}
	}
	if kind == "transition" {
		var duration float64
		var key string
		if err = tx.QueryRowContext(ctx, `SELECT duration,coalesce(file_storage_key,'') FROM clips WHERE id=$1`, id).Scan(&duration, &key); err != nil {
			return "", err
		}
		payload["expected_duration"], payload["previous_key"] = duration, key
		var ready bool
		if err = tx.QueryRowContext(ctx, `SELECT coalesce(transition_state IS NOT NULL AND jsonb_array_length(transition_state->'decisions')>0,false) FROM clips WHERE id=$1`, id).Scan(&ready); err != nil {
			return "", err
		}
		if !ready {
			return "", domainError{400, "This clip has no saved transition analysis"}
		}
	}
	if kind == "trim" {
		if err = prepareTrimMapping(ctx, tx, id, payload); err != nil {
			return "", err
		}
	}
	if kind == "style" {
		if err = prepareStyle(ctx, tx, id, payload); err != nil {
			return "", err
		}
	}
	token, taskID, deliveryID := newID(), newID(), newID()
	if guard != nil {
		taskID = guard.RequestID
	}
	deadline := time.Now().UTC().Add(h.cfg.EditReservationTTL)
	if _, err = tx.ExecContext(ctx, `UPDATE jobs SET active_edit_tasks=1,active_edit_token=$2,edit_deadline=$3,updated_at=now() WHERE id=$1`, jobID, token, deadline); err != nil {
		return "", err
	}
	payload["clip_id"] = id
	payload["job_id"] = jobID
	payload["edit_token"] = token
	encoded, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO edit_deliveries (id,job_id,clip_id,kind,task_id,reservation_token,payload,state,dispatch_count) VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',0)`, deliveryID, jobID, id, kind, taskID, token, string(encoded)); err != nil {
		return "", err
	}
	if err = tx.Commit(); err != nil {
		return "", err
	}
	return taskID, nil
}

func (h *Handler) updateMetadata(ctx context.Context, userID, id string, p MetadataInput) error {
	return updateMetadataWith(ctx, h.db, userID, id, p)
}
func updateMetadataWith(ctx context.Context, q interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}, userID, id string, p MetadataInput) error {
	result, err := q.ExecContext(ctx, `UPDATE clips SET title=$3,hook_text=$4,transcript_text=$5 WHERE id=$1 AND user_id=$2 AND EXISTS(SELECT 1 FROM users WHERE id=$2 AND access_role='member') AND NOT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=$2)`, id, userID, p.Title, p.Hook, p.Transcript)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (h *Handler) deleteClip(ctx context.Context, userID, id string) error {
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = h.deleteClipTx(ctx, tx, userID, id); err != nil {
		return err
	}
	return tx.Commit()
}

func (h *Handler) deleteClipTx(ctx context.Context, tx *sql.Tx, userID, id string) error {
	jobID, err := lockClip(ctx, tx, userID, id)
	if err != nil {
		return err
	}
	var storyClip bool
	if err = tx.QueryRowContext(ctx, `SELECT story_project_id IS NOT NULL FROM clips WHERE id=$1`, id).Scan(&storyClip); err != nil {
		return err
	}
	if storyClip {
		// The file is an immutable story version and may be restored later.
		if _, err = tx.ExecContext(ctx, `DELETE FROM clips WHERE id=$1 AND user_id=$2`, id, userID); err != nil {
			return err
		}
		return nil
	}
	var refs [6]sql.NullString
	if err = tx.QueryRowContext(ctx, `SELECT file_path,file_url,file_storage_key,thumbnail_path,thumbnail_url,thumbnail_storage_key FROM clips WHERE id=$1 AND user_id=$2`, id, userID).Scan(&refs[0], &refs[1], &refs[2], &refs[3], &refs[4], &refs[5]); err != nil {
		return err
	}
	keys := map[string]bool{}
	for _, ref := range refs {
		if ref.Valid && ref.String != "" {
			key, e := h.media.KeyFromReference(ref.String)
			if e == nil && key != "" {
				keys[key] = true
			}
		}
	}
	ordered := make([]string, 0, len(keys))
	for key := range keys {
		ordered = append(ordered, key)
	}
	sort.Strings(ordered)
	cleanupError := domainError{502, "Clip media could not be removed; the clip was not deleted"}
	for _, key := range ordered {
		if err = h.media.Delete(ctx, key); err != nil {
			return cleanupError
		}
	}
	for _, prefix := range []string{"clips/" + jobID + "/edits/" + id + "/", "work/" + jobID + "/edits/" + id + "/"} {
		if err = h.media.DeletePrefix(ctx, prefix); err != nil {
			return cleanupError
		}
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM clips WHERE id=$1 AND user_id=$2`, id, userID); err != nil {
		return err
	}
	return nil
}

func errorStatus(err error) (int, string) {
	var d domainError
	if errors.As(err, &d) {
		return d.status, d.message
	}
	if errors.Is(err, sql.ErrNoRows) {
		return 404, "Clip not found"
	}
	return 503, "Clip service is temporarily unavailable"
}
