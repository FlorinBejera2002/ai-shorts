package worker

import (
	"context"
	"encoding/json"
	"sneepcut/backend-go/internal/audiocleanup"
)

// Save comparison state even on provider failure; retry never needs re-upload.
func (r *Repository) recordAudioCleanup(ctx context.Context, j *Job, d *audiocleanup.Derivative) error {
	if d == nil {
		return nil
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = owned(ctx, tx, j, true); err != nil {
		return err
	}
	raw, err := json.Marshal(d)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `UPDATE job_deliveries SET payload=jsonb_set(payload::jsonb,'{audio_cleanup_result}',$2::jsonb) WHERE job_id=$1`, j.ID, string(raw))
	if err != nil {
		return err
	}
	return tx.Commit()
}
