package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"sneepcut/backend-go/internal/audiocleanup"
	"sneepcut/backend-go/internal/credits"
	"sneepcut/backend-go/internal/identity"
)

var errRetryConflict = errors.New("The job is already processing or cannot be retried")

type audioRetryInput struct {
	RequestID    string                 `json:"request_id"`
	AudioCleanup *audiocleanup.Settings `json:"audio_cleanup,omitempty"`
}

func (h *Handler) retryAudio(w http.ResponseWriter, r *http.Request) {
	id := requestID(w, r)
	if id == "" {
		return
	}
	var in audioRetryInput
	if !decode(w, r, &in) {
		return
	}
	if !idPattern.MatchString(in.RequestID) {
		reply(w, 422, map[string]any{"detail": "A unique retry request ID is required"})
		return
	}
	err := h.repo.retryAudio(r.Context(), identity.Current(r).User.ID, id, in)
	if errors.Is(err, errRetryConflict) {
		reply(w, 409, map[string]any{"detail": err.Error()})
		return
	}
	if err != nil {
		failure(w, err)
		return
	}
	h.get(w, r)
}

// Same project/source, new fenced attempt. Replay does not charge or queue twice.
func (r *Repository) retryAudio(ctx context.Context, user, id string, in audioRetryInput) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var status, sourceType string
	var active bool
	var clips int
	err = tx.QueryRowContext(ctx, `SELECT status,processing_active,num_clips_requested,source_type FROM jobs WHERE id=$1 AND user_id=$2 FOR UPDATE`, id, user).Scan(&status, &active, &clips, &sourceType)
	if err != nil {
		return err
	}
	var raw []byte
	if err = tx.QueryRowContext(ctx, `SELECT payload FROM job_deliveries WHERE job_id=$1 FOR UPDATE`, id).Scan(&raw); err != nil {
		return err
	}
	var payload map[string]json.RawMessage
	if err = json.Unmarshal(raw, &payload); err != nil {
		return err
	}
	encoded, _ := json.Marshal(in)
	history := map[string]audioRetryInput{}
	if saved, ok := payload["audio_retry_history"]; ok {
		if err = json.Unmarshal(saved, &history); err != nil {
			return err
		}
	}
	// Retain all retry IDs: a delayed response from an earlier attempt must not
	// reserve credits again after a later attempt has also failed.
	if last, ok := payload["audio_retry"]; ok {
		var previous audioRetryInput
		if json.Unmarshal(last, &previous) == nil && previous.RequestID != "" {
			history[previous.RequestID] = previous
		}
	}
	if previous, ok := history[in.RequestID]; ok {
		previousJSON, _ := json.Marshal(previous)
		if string(previousJSON) != string(encoded) {
			return errRetryConflict
		}
		return tx.Commit()
	}
	if active || (status != "failed" && status != "cancelled") || sourceType == "story" {
		return errRetryConflict
	}
	if in.AudioCleanup != nil {
		payload["audio_cleanup"], _ = json.Marshal(in.AudioCleanup)
	}
	var cleanup *audiocleanup.Settings
	if raw := payload["audio_cleanup"]; len(raw) > 0 {
		if err = json.Unmarshal(raw, &cleanup); err != nil {
			return err
		}
	}
	if err = audiocleanup.Check(cleanup); err != nil {
		return err
	}
	payload["audio_retry"] = encoded
	history[in.RequestID] = in
	payload["audio_retry_history"], _ = json.Marshal(history)
	delete(payload, "audio_cleanup_result")
	nextPayload, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	amount, err := credits.Reserve(ctx, tx, user, clips*10)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `UPDATE jobs SET status='pending',progress=0,progress_message='Queued',error_message=NULL,completed_at=NULL,started_at=NULL,credits_charged=$2,updated_at=now() WHERE id=$1`, id, amount)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `UPDATE job_deliveries SET payload=$2,token=NULL,lease_until=NULL,last_error=NULL,execution_count=0,next_dispatch_at=now() WHERE job_id=$1`, id, string(nextPayload))
	if err != nil {
		return err
	}
	return tx.Commit()
}
