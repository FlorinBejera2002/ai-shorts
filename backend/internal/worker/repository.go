// Package worker executes durable database intents with expiring, fenced ownership.
package worker

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
)

var ErrOwnership = errors.New("execution ownership lost")

type Repository struct{ db *sql.DB }

func NewRepository(db *sql.DB) *Repository { return &Repository{db: db} }
func token() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(err)
	}
	b[6] = (b[6] & 15) | 64
	b[8] = (b[8] & 63) | 128
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[:4], b[4:6], b[6:8], b[8:10], b[10:])
}

type Job struct {
	ID, UserID, Token, Language, SubtitleStyle, AspectRatio, SourceKey string
	Payload                                                            json.RawMessage
	Brand                                                              map[string]any
}

func (r *Repository) Claim(ctx context.Context) (*Job, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	j := &Job{Token: token()}
	var include bool
	err = tx.QueryRowContext(ctx, `SELECT j.id,j.user_id,coalesce(j.language,'auto'),coalesce(j.subtitle_style,'default'),j.aspect_ratio,coalesce(j.source_storage_key,''),j.include_brand FROM jobs j JOIN job_deliveries d ON d.job_id=j.id WHERE j.status='pending' AND NOT j.processing_active AND d.next_dispatch_at<=now() AND NOT EXISTS(SELECT 1 FROM account_deletion_requests a WHERE a.user_id=j.user_id) ORDER BY d.next_dispatch_at FOR UPDATE OF j SKIP LOCKED LIMIT 1`).Scan(&j.ID, &j.UserID, &j.Language, &j.SubtitleStyle, &j.AspectRatio, &j.SourceKey, &include)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	err = tx.QueryRowContext(ctx, `UPDATE job_deliveries SET token=$2,lease_until=now()+interval '180 seconds',execution_count=execution_count+1,last_error=NULL WHERE job_id=$1 RETURNING payload`, j.ID, j.Token).Scan(&j.Payload)
	if err != nil {
		return nil, err
	}
	var kit []byte
	var plan string
	err = tx.QueryRowContext(ctx, `SELECT u.plan,coalesce((SELECT row_to_json(b) FROM brand_kits b WHERE b.user_id=u.id LIMIT 1),'{}'::json) FROM users u WHERE u.id=$1`, j.UserID).Scan(&plan, &kit)
	if err != nil {
		return nil, err
	}
	j.Brand = map[string]any{}
	if err = json.Unmarshal(kit, &j.Brand); err != nil {
		return nil, err
	}
	j.Brand["apply_brand"] = include && len(j.Brand) > 0
	j.Brand["user_id"] = j.UserID
	j.Brand["hide_platform_badge"] = plan == "agency" && j.Brand["hide_platform_badge"] == true
	j.Brand["logo_key"] = j.Brand["logo_path"]
	_, err = tx.ExecContext(ctx, `UPDATE jobs SET status='downloading',progress=5,progress_message='Processing started',started_at=now(),processing_active=true,updated_at=now() WHERE id=$1`, j.ID)
	if err != nil {
		return nil, err
	}
	return j, tx.Commit()
}

// Lock the job first on every mutation, matching cancellation and deletion.
func owned(ctx context.Context, tx *sql.Tx, j *Job, active bool) error {
	var status string
	var deleting bool
	err := tx.QueryRowContext(ctx, `SELECT status,EXISTS(SELECT 1 FROM account_deletion_requests a WHERE a.user_id=j.user_id) FROM jobs j WHERE id=$1 FOR UPDATE`, j.ID).Scan(&status, &deleting)
	if err != nil {
		return err
	}
	var valid bool
	err = tx.QueryRowContext(ctx, `SELECT token=$2 AND lease_until>now() FROM job_deliveries WHERE job_id=$1 FOR UPDATE`, j.ID, j.Token).Scan(&valid)
	if err != nil {
		return err
	}
	if !valid || (active && (deleting || status == "completed" || status == "failed" || status == "cancelled")) {
		return ErrOwnership
	}
	return nil
}
func (r *Repository) Progress(ctx context.Context, j *Job, status string, pct int, message string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = owned(ctx, tx, j, true); err != nil {
		return err
	}
	if status != "" {
		_, err = tx.ExecContext(ctx, `UPDATE jobs SET status=$2,progress=$3,progress_message=$4,updated_at=now() WHERE id=$1`, j.ID, status, pct, message)
		if err != nil {
			return err
		}
	}
	_, err = tx.ExecContext(ctx, `UPDATE job_deliveries SET lease_until=now()+interval '180 seconds' WHERE job_id=$1`, j.ID)
	if err != nil {
		return err
	}
	return tx.Commit()
}
func (r *Repository) Fail(ctx context.Context, j *Job, message string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = owned(ctx, tx, j, false); err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `WITH failed AS (UPDATE jobs j SET status=CASE WHEN EXISTS(SELECT 1 FROM account_deletion_requests a WHERE a.user_id=j.user_id) THEN 'cancelled' ELSE 'failed' END,error_message=$2,completed_at=now(),updated_at=now() WHERE id=$1 AND status NOT IN ('completed','failed','cancelled') RETURNING user_id,credits_charged,status) UPDATE users u SET credits=u.credits+f.credits_charged FROM failed f WHERE u.id=f.user_id AND f.status='failed'`, j.ID, message)
	if err != nil {
		return err
	}
	if err = release(ctx, tx, j); err != nil {
		return err
	}
	return tx.Commit()
}
func release(ctx context.Context, tx *sql.Tx, j *Job) error {
	_, err := tx.ExecContext(ctx, `UPDATE jobs SET processing_active=false WHERE id=$1`, j.ID)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `UPDATE job_deliveries SET token=NULL,lease_until=NULL WHERE job_id=$1`, j.ID)
	return err
}

func (r *Repository) Recover(ctx context.Context) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	rows, err := tx.QueryContext(ctx, `SELECT j.id FROM jobs j JOIN job_deliveries d ON d.job_id=j.id WHERE j.processing_active AND d.lease_until<now() ORDER BY d.lease_until FOR UPDATE OF j SKIP LOCKED LIMIT 50`)
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
		var previous string
		var user string
		var charge int
		if err = tx.QueryRowContext(ctx, `SELECT status,user_id,credits_charged FROM jobs WHERE id=$1`, id).Scan(&previous, &user, &charge); err != nil {
			return err
		}
		var count int
		err = tx.QueryRowContext(ctx, `SELECT execution_count FROM job_deliveries WHERE job_id=$1 FOR UPDATE`, id).Scan(&count)
		if err != nil {
			return err
		}
		_, err = tx.ExecContext(ctx, `WITH failed AS (UPDATE jobs j SET status=CASE WHEN status IN ('completed','failed','cancelled') THEN status WHEN EXISTS(SELECT 1 FROM account_deletion_requests a WHERE a.user_id=j.user_id) THEN 'cancelled' WHEN $2>=3 THEN 'failed' ELSE 'pending' END,processing_active=false,progress=CASE WHEN status IN ('completed','failed','cancelled') THEN progress ELSE 0 END,error_message=CASE WHEN $2>=3 AND status NOT IN ('completed','failed','cancelled') THEN 'Processing stopped repeatedly; credits refunded' ELSE error_message END,completed_at=CASE WHEN $2>=3 THEN coalesce(completed_at,now()) ELSE completed_at END,updated_at=now() WHERE id=$1 RETURNING user_id,credits_charged,status) SELECT 1`, id, count)
		if err != nil {
			return err
		}
		if count >= 3 && previous != "completed" && previous != "failed" && previous != "cancelled" {
			_, err = tx.ExecContext(ctx, `UPDATE users SET credits=credits+$2 WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=$1)`, user, charge)
			if err != nil {
				return err
			}
		}
		_, err = tx.ExecContext(ctx, `UPDATE job_deliveries SET token=NULL,lease_until=NULL,next_dispatch_at=now() WHERE job_id=$1`, id)
		if err != nil {
			return err
		}
	}
	return tx.Commit()
}
