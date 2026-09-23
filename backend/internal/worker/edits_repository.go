package worker

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"sneepcut/backend-go/internal/processing"
)

type Edit struct {
	ID, JobID, ClipID, Token, Kind, SourceKey, FileKey, TikTokKey, ThumbnailKey string
	Payload                                                                     json.RawMessage
	Badge                                                                       sql.NullBool
}

func (r *Repository) ClaimEdit(ctx context.Context) (*Edit, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	e := &Edit{Token: token()}
	err = tx.QueryRowContext(ctx, `SELECT d.id,j.id,d.clip_id,d.kind,coalesce(j.source_storage_key,''),coalesce(c.file_storage_key,''),coalesce(c.tiktok_file_storage_key,''),coalesce(c.thumbnail_storage_key,''),c.contains_platform_badge FROM edit_deliveries d JOIN jobs j ON j.id=d.job_id JOIN clips c ON c.id=d.clip_id WHERE d.state='pending' AND d.next_dispatch_at<=now() AND j.active_edit_token=d.reservation_token AND j.edit_deadline>now() AND NOT EXISTS(SELECT 1 FROM account_deletion_requests a WHERE a.user_id=j.user_id) ORDER BY d.created_at FOR UPDATE OF j SKIP LOCKED LIMIT 1`).Scan(&e.ID, &e.JobID, &e.ClipID, &e.Kind, &e.SourceKey, &e.FileKey, &e.TikTokKey, &e.ThumbnailKey, &e.Badge)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	err = tx.QueryRowContext(ctx, `UPDATE edit_deliveries SET execution_token=$2,state='running',last_error=NULL WHERE id=$1 AND state='pending' RETURNING payload`, e.ID, e.Token).Scan(&e.Payload)
	if err != nil {
		return nil, err
	}
	_, err = tx.ExecContext(ctx, `UPDATE jobs SET active_edit_token=$2,edit_deadline=now()+interval '1 hour' WHERE id=$1`, e.JobID, e.Token)
	if err != nil {
		return nil, err
	}
	return e, tx.Commit()
}
func editOwner(ctx context.Context, tx *sql.Tx, e *Edit) error {
	var ok bool
	err := tx.QueryRowContext(ctx, `SELECT coalesce(active_edit_token=$2 AND edit_deadline>now(),false) AND NOT EXISTS(SELECT 1 FROM account_deletion_requests a WHERE a.user_id=j.user_id) FROM jobs j WHERE id=$1 FOR UPDATE`, e.JobID, e.Token).Scan(&ok)
	if err != nil {
		return err
	}
	if !ok {
		return ErrOwnership
	}
	return nil
}
func (r *Repository) EditActive(ctx context.Context, e *Edit) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	return editOwner(ctx, tx, e)
}
func finishEdit(ctx context.Context, tx *sql.Tx, e *Edit, state, message string) error {
	_, err := tx.ExecContext(ctx, `UPDATE edit_deliveries SET state=$3,last_error=nullif($4,''),completed_at=now() WHERE id=$1 AND execution_token=$2 AND state='running'`, e.ID, e.Token, state, message)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `UPDATE jobs SET active_edit_tasks=0,active_edit_token=NULL,edit_deadline=NULL,updated_at=now() WHERE id=$1 AND active_edit_token=$2`, e.JobID, e.Token)
	return err
}
func (r *Repository) FailEdit(ctx context.Context, e *Edit) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = editOwner(ctx, tx, e); err != nil {
		return err
	}
	if err = finishEdit(ctx, tx, e, "failed", "Editing failed; retry the edit"); err != nil {
		return err
	}
	return tx.Commit()
}
func (r *Repository) CompleteEdit(ctx context.Context, e *Edit, c processing.Clip, segments []orderedSegment) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = editOwner(ctx, tx, e); err != nil {
		return err
	}
	if e.Kind == "trim" {
		var payload struct {
			SourceSegments json.RawMessage `json:"source_segments"`
		}
		if err = json.Unmarshal(e.Payload, &payload); err != nil {
			return err
		}
		var mapping any
		if len(payload.SourceSegments) > 0 && string(payload.SourceSegments) != "null" {
			mapping = string(payload.SourceSegments)
		}
		_, err = tx.ExecContext(ctx, `UPDATE clips SET file_path=$2,file_url=NULL,file_storage_key=$2,tiktok_file_storage_key=nullif($3,''),start_time=$4,end_time=$5,duration=$6,file_size=$7,segments=$9 WHERE id=$1 AND job_id=$8`, e.ClipID, c.StorageKey, c.TikTokStorageKey, c.Start, c.End, c.Duration, c.FileSize, e.JobID, mapping)
	} else {
		raw, encodeErr := json.Marshal(segments)
		if encodeErr != nil {
			return encodeErr
		}
		_, err = tx.ExecContext(ctx, `UPDATE clips SET file_path=$2,file_url=NULL,file_storage_key=$2,tiktok_file_storage_key=NULL,thumbnail_path=nullif($3,''),thumbnail_url=NULL,thumbnail_storage_key=nullif($3,''),contains_platform_badge=false,segments=$4,start_time=$5,end_time=$6,duration=$7,file_size=$8 WHERE id=$1 AND job_id=$9`, e.ClipID, c.StorageKey, c.ThumbnailKey, string(raw), c.Start, c.End, c.Duration, c.FileSize, e.JobID)
	}
	if err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE clips SET transition_state=NULL WHERE id=$1 AND job_id=$2`, e.ClipID, e.JobID); err != nil {
		return err
	}
	if err = finishEdit(ctx, tx, e, "completed", ""); err != nil {
		return err
	}
	return tx.Commit()
}
func (r *Repository) RecoverEdits(ctx context.Context) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	rows, err := tx.QueryContext(ctx, `SELECT j.id FROM jobs j WHERE EXISTS(SELECT 1 FROM edit_deliveries d WHERE d.job_id=j.id AND d.state IN ('pending','running') AND (j.active_edit_token IS DISTINCT FROM CASE WHEN d.state='running' THEN d.execution_token ELSE d.reservation_token END OR j.edit_deadline IS NULL OR j.edit_deadline<=now() OR EXISTS(SELECT 1 FROM account_deletion_requests a WHERE a.user_id=j.user_id))) FOR UPDATE OF j SKIP LOCKED LIMIT 50`)
	if err != nil {
		return err
	}
	var ids []string
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		ids = append(ids, id)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, id := range ids {
		_, err = tx.ExecContext(ctx, `UPDATE edit_deliveries d SET state='expired',completed_at=now(),last_error='Editing reservation expired; retry the edit' FROM jobs j WHERE j.id=$1 AND d.job_id=j.id AND d.state IN ('pending','running') AND (j.active_edit_token IS DISTINCT FROM CASE WHEN d.state='running' THEN d.execution_token ELSE d.reservation_token END OR j.edit_deadline IS NULL OR j.edit_deadline<=now() OR EXISTS(SELECT 1 FROM account_deletion_requests a WHERE a.user_id=j.user_id))`, id)
		if err != nil {
			return err
		}
		_, err = tx.ExecContext(ctx, `UPDATE jobs j SET active_edit_tasks=0,active_edit_token=NULL,edit_deadline=NULL WHERE id=$1 AND (edit_deadline IS NULL OR edit_deadline<=now() OR EXISTS(SELECT 1 FROM account_deletion_requests a WHERE a.user_id=j.user_id))`, id)
		if err != nil {
			return err
		}
	}
	return tx.Commit()
}
