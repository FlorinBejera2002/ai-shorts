package stories

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sneepcut/backend-go/internal/story"
	"strings"
)

type execution struct {
	repo                         *Repository
	ID, UserID, Token, RequestID string
	Input                        story.Request
}

func (r *Repository) Claim(ctx context.Context) (*execution, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	e := &execution{repo: r, Token: newID()}
	var raw []byte
	err = tx.QueryRowContext(ctx, `SELECT p.id,p.user_id,p.request FROM story_projects p JOIN jobs j ON j.id=p.id WHERE p.status='pending' AND p.lease_token IS NULL AND j.status='pending' AND NOT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=p.user_id) ORDER BY p.updated_at FOR UPDATE OF p SKIP LOCKED LIMIT 1`).Scan(&e.ID, &e.UserID, &raw)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var request struct {
		ID    string        `json:"request_id"`
		Input story.Request `json:"input"`
	}
	if err = json.Unmarshal(raw, &request); err != nil {
		return nil, err
	}
	e.Input = request.Input
	e.RequestID = request.ID
	requestVersionStart := request.Input.VersionStart
	attempts, err := tx.QueryContext(ctx, `SELECT attempt FROM story_attempts WHERE project_id=$1 AND request_id=$2 ORDER BY created_at`, e.ID, e.RequestID)
	if err != nil {
		return nil, err
	}
	for attempts.Next() {
		var b []byte
		var a story.Attempt
		if err = attempts.Scan(&b); err == nil {
			err = json.Unmarshal(b, &a)
		}
		if err != nil {
			attempts.Close()
			return nil, err
		}
		e.Input.PreviousAttempts = append(e.Input.PreviousAttempts, a)
	}
	err = attempts.Err()
	attempts.Close()
	if err != nil {
		return nil, err
	}
	// Sources and accepted versions are checkpoints, not snapshots from the
	// original queue request. Refresh analyses after interrupted work.
	rows, err := tx.QueryContext(ctx, `SELECT asset FROM story_assets WHERE project_id=$1 ORDER BY (asset->>'order')::int,id`, e.ID)
	if err != nil {
		return nil, err
	}
	e.Input.Assets = nil
	for rows.Next() {
		var b []byte
		var a story.Asset
		if err = rows.Scan(&b); err == nil {
			err = json.Unmarshal(b, &a)
		}
		if err != nil {
			rows.Close()
			return nil, err
		}
		e.Input.Assets = append(e.Input.Assets, a)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	if err = tx.QueryRowContext(ctx, `SELECT greatest(coalesce((SELECT max(number) FROM story_versions WHERE project_id=$1),0),coalesce((SELECT max(version) FROM story_attempts WHERE project_id=$1),0))+1`, e.ID).Scan(&e.Input.VersionStart); err != nil {
		return nil, err
	}
	var executions, current int
	if err = tx.QueryRowContext(ctx, `UPDATE story_projects SET status='analyzing',message='Analyzing source clips',lease_token=$2,lease_until=now()+interval '180 seconds',executions=executions+1,stage_started_at=clock_timestamp(),updated_at=now() WHERE id=$1 RETURNING executions,current_version`, e.ID, e.Token).Scan(&executions, &current); err != nil {
		return nil, err
	}
	if executions > 1 && current > 0 && current >= requestVersionStart {
		var b []byte
		if err = tx.QueryRowContext(ctx, `SELECT version FROM story_versions WHERE project_id=$1 AND number=$2`, e.ID, current).Scan(&b); err != nil {
			return nil, err
		}
		e.Input.Base = &story.Version{}
		if err = json.Unmarshal(b, e.Input.Base); err != nil {
			return nil, err
		}
		e.Input.Action = "resume"
	}
	if _, err = tx.ExecContext(ctx, `UPDATE jobs SET processing_active=true,status='analyzing',started_at=coalesce(started_at,now()),progress=0,progress_message='Analyzing source clips',updated_at=now() WHERE id=$1`, e.ID); err != nil {
		return nil, err
	}
	return e, tx.Commit()
}

func (e *execution) owned(ctx context.Context, tx *sql.Tx, active bool) error {
	var valid bool
	err := tx.QueryRowContext(ctx, `SELECT lease_token=$2 AND lease_until>now() AND ($3=false OR (status NOT IN ('cancelled','deleting','failed') AND NOT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=p.user_id))) FROM story_projects p WHERE id=$1 FOR UPDATE`, e.ID, e.Token, active).Scan(&valid)
	if err != nil {
		return err
	}
	if !valid {
		return ErrOwnership
	}
	if active {
		var cancelled bool
		if err = tx.QueryRowContext(ctx, `SELECT status='cancelled' FROM jobs WHERE id=$1`, e.ID).Scan(&cancelled); err != nil {
			return err
		}
		if cancelled {
			return ErrOwnership
		}
	}
	return nil
}

func (e *execution) mutate(ctx context.Context, fn func(*sql.Tx) error) error {
	tx, err := e.repo.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = e.owned(ctx, tx, true); err != nil {
		return err
	}
	if err = fn(tx); err != nil {
		return err
	}
	return tx.Commit()
}

func (e *execution) Progress(ctx context.Context, status, message string) error {
	return e.mutate(ctx, func(tx *sql.Tx) error {
		if status != "" {
			switch status {
			case "analyzing", "building_story", "editing", "reviewing", "improving":
			default:
				return ErrInvalid
			}
			if err := trackStage(ctx, tx, e.ID, status); err != nil {
				return err
			}
			if _, err := tx.ExecContext(ctx, `UPDATE story_projects SET status=$2,message=$3,updated_at=now() WHERE id=$1`, e.ID, status, message); err != nil {
				return err
			}
			if _, err := tx.ExecContext(ctx, `UPDATE jobs SET status=$2,progress_message=$3,updated_at=now() WHERE id=$1`, e.ID, status, message); err != nil {
				return err
			}
		}
		_, err := tx.ExecContext(ctx, `UPDATE story_projects SET lease_until=now()+interval '180 seconds' WHERE id=$1`, e.ID)
		return err
	})
}

func (e *execution) reserveAI(ctx context.Context) error {
	return e.mutate(ctx, func(tx *sql.Tx) error {
		result, err := tx.ExecContext(ctx, `UPDATE story_projects SET ai_calls=ai_calls+1,stage_metrics=stage_metrics || jsonb_build_object('ai_calls_' || status,coalesce((stage_metrics->>('ai_calls_' || status))::integer,0)+1) WHERE id=$1 AND ai_calls<$2`, e.ID, e.repo.limits.MaxAICalls)
		if err != nil {
			return err
		}
		n, _ := result.RowsAffected()
		if n != 1 {
			return errors.New("Story AI review/repair budget exhausted")
		}
		return nil
	})
}

func (e *execution) SaveAsset(ctx context.Context, a story.Asset) error {
	return e.mutate(ctx, func(tx *sql.Tx) error {
		var original []byte
		if err := tx.QueryRowContext(ctx, `SELECT asset FROM story_assets WHERE project_id=$1 AND id=$2`, e.ID, a.ID).Scan(&original); err != nil {
			return err
		}
		var before story.Asset
		if err := json.Unmarshal(original, &before); err != nil {
			return err
		}
		if a.Key != before.Key || a.Hash != before.Hash || a.Kind != before.Kind {
			return ErrInvalid
		}
		_, err := tx.ExecContext(ctx, `UPDATE story_assets SET asset=$3 WHERE project_id=$1 AND id=$2`, e.ID, a.ID, encoded(a))
		return err
	})
}

func (e *execution) SaveVersion(ctx context.Context, v story.Version) error {
	return e.mutate(ctx, func(tx *sql.Tx) error {
		if v.Number < e.Input.VersionStart {
			return ErrInvalid
		}
		if v.Output.Key != "" && !strings.HasPrefix(v.Output.Key, "clips/"+e.ID+"/") {
			return ErrInvalid
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO story_versions(project_id,number,version) VALUES($1,$2,$3) ON CONFLICT(project_id,number) DO UPDATE SET version=excluded.version`, e.ID, v.Number, encoded(v)); err != nil {
			return err
		}
		if v.Accepted {
			if v.RenderOptions != nil {
				if err := story.ValidateOptions(*v.RenderOptions); err != nil {
					return ErrInvalid
				}
				if _, err := tx.ExecContext(ctx, `UPDATE story_projects SET options=$2 WHERE id=$1`, e.ID, encoded(v.RenderOptions)); err != nil {
					return err
				}
			}
			_, err := tx.ExecContext(ctx, `UPDATE story_projects SET current_version=$2,updated_at=now() WHERE id=$1`, e.ID, v.Number)
			return err
		}
		return nil
	})
}

func (e *execution) SaveAttempt(ctx context.Context, a story.Attempt) error {
	return e.mutate(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `INSERT INTO story_attempts(project_id,request_id,attempt) VALUES($1,$2,$3) ON CONFLICT(project_id,request_id,version,operation) DO UPDATE SET attempt=excluded.attempt`, e.ID, e.RequestID, encoded(a))
		return err
	})
}

func (e *execution) finish(ctx context.Context, result story.Result, runErr error) error {
	tx, err := e.repo.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = e.owned(ctx, tx, false); err != nil {
		return err
	}
	var status string
	var current, charge int
	var deleting, cancelled bool
	if err = tx.QueryRowContext(ctx, `SELECT p.status,p.current_version,j.credits_charged,EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=p.user_id),j.status='cancelled' FROM story_projects p JOIN jobs j ON j.id=p.id WHERE p.id=$1 FOR UPDATE OF j`, e.ID).Scan(&status, &current, &charge, &deleting, &cancelled); err != nil {
		return err
	}
	message := "Story is ready"
	jobStatus := "completed"
	if status == "cancelled" || deleting || cancelled {
		status = "cancelled"
		message = "Cancelled; previous versions retained"
		jobStatus = "cancelled"
	} else if runErr != nil {
		status = "failed"
		message = "Story processing could not finish. Retry retains uploaded clips and saved versions."
		jobStatus = "failed"
		if current > 0 {
			status = "needs_review"
			message = "Processing stopped; the previous draft is retained and needs review"
			jobStatus = "completed"
			var raw []byte
			if err = tx.QueryRowContext(ctx, `SELECT version FROM story_versions WHERE project_id=$1 AND number=$2`, e.ID, current).Scan(&raw); err != nil {
				return err
			}
			var previous story.Version
			if err = json.Unmarshal(raw, &previous); err != nil {
				return err
			}
			if readyVersion(previous) {
				status = "ready"
				message = "The edit could not finish; the previous reviewed version is retained"
			}
		}
	} else {
		status = result.Best.Report.Status
		if !readyVersion(result.Best) {
			status = "needs_review"
			message = "Draft saved; review the reported issues before using it"
		}
	}
	if current == 0 && (jobStatus == "failed" || jobStatus == "cancelled") && charge > 0 {
		if _, err = tx.ExecContext(ctx, `UPDATE users SET credits=credits+$2 WHERE id=$1`, e.UserID, charge); err != nil {
			return err
		}
		charge = 0
	}
	if err = trackStage(ctx, tx, e.ID, status); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE story_projects SET status=$2,message=$3,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=$1`, e.ID, status, message); err != nil {
		return err
	}
	progress := 0
	if jobStatus == "completed" {
		progress = 100
	}
	if _, err = tx.ExecContext(ctx, `UPDATE jobs SET status=$2,processing_active=false,credits_charged=$3,progress=$5,progress_message=$4,completed_at=now(),updated_at=now() WHERE id=$1`, e.ID, jobStatus, charge, message, progress); err != nil {
		return err
	}
	if runErr == nil && status == "ready" {
		if err = saveClip(ctx, tx, e.ID, e.UserID, result.Best, e.Input.Options); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func trackStage(ctx context.Context, tx *sql.Tx, id, next string) error {
	_, err := tx.ExecContext(ctx, `UPDATE story_projects SET stage_metrics=stage_metrics || jsonb_build_object(status || '_seconds',coalesce((stage_metrics->>(status || '_seconds'))::double precision,0)+greatest(0,extract(epoch FROM clock_timestamp()-stage_started_at))),stage_started_at=clock_timestamp() WHERE id=$1 AND status<>$2`, id, next)
	return err
}

func saveClip(ctx context.Context, tx *sql.Tx, id, user string, v story.Version, options story.Options) error {
	if !readyVersion(v) || v.Output.Key == "" {
		return ErrInvalid
	}
	// Editorial titles are metadata; an overlong model title must not discard a
	// reviewed render at the library's VARCHAR(255) boundary.
	title := []rune(strings.TrimSpace(v.Plan.Title))
	if len(title) > 255 {
		v.Plan.Title = string(title[:255])
	}
	var text strings.Builder
	for _, entry := range v.Timeline {
		for _, word := range entry.Words {
			if text.Len() > 0 {
				text.WriteByte(' ')
			}
			text.WriteString(word.Text)
		}
	}
	_, err := tx.ExecContext(ctx, `INSERT INTO clips(id,job_id,user_id,title,viral_score,start_time,end_time,duration,segments,file_path,file_storage_key,thumbnail_path,thumbnail_storage_key,file_size,resolution,aspect_ratio,has_subtitles,transcript_text,story_project_id,story_version) VALUES($1,$2,$3,$4,0,0,$5,$5,'[]',$6,$6,$7,$7,$8,$9,$10,$11,$12,$2,$13) ON CONFLICT(story_project_id) WHERE story_project_id IS NOT NULL DO UPDATE SET title=excluded.title,end_time=excluded.end_time,duration=excluded.duration,file_path=excluded.file_path,file_storage_key=excluded.file_storage_key,thumbnail_path=excluded.thumbnail_path,thumbnail_storage_key=excluded.thumbnail_storage_key,file_size=excluded.file_size,resolution=excluded.resolution,aspect_ratio=excluded.aspect_ratio,has_subtitles=excluded.has_subtitles,transcript_text=excluded.transcript_text,story_version=excluded.story_version`, newID(), id, user, v.Plan.Title, v.Output.Duration, v.Output.Key, v.Output.ThumbnailKey, v.Output.Size, v.Output.Resolution, options.AspectRatio, v.Output.Captions, text.String(), v.Number)
	return err
}

func (r *Repository) Recover(ctx context.Context) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	rows, err := tx.QueryContext(ctx, `SELECT id FROM story_projects WHERE lease_until<now() ORDER BY lease_until FOR UPDATE SKIP LOCKED LIMIT 20`)
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
		var status, user string
		var count, current, charge int
		var deleting, cancelled bool
		if err = tx.QueryRowContext(ctx, `SELECT p.status,p.user_id,p.executions,p.current_version,j.credits_charged,j.status='cancelled',EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=p.user_id) FROM story_projects p JOIN jobs j ON j.id=p.id WHERE p.id=$1 FOR UPDATE OF j`, id).Scan(&status, &user, &count, &current, &charge, &cancelled, &deleting); err != nil {
			return err
		}
		jobStatus := "pending"
		message := "Resuming saved source analyses"
		if deleting || cancelled || status == "cancelled" {
			status = "cancelled"
			jobStatus = "cancelled"
			message = "Cancelled"
		} else if count >= 3 {
			status = "failed"
			jobStatus = "failed"
			message = "Repeated worker interruptions; retry available"
			if current > 0 {
				status = "needs_review"
				jobStatus = "completed"
			}
		} else {
			status = "pending"
		}
		if current == 0 && (jobStatus == "failed" || jobStatus == "cancelled") && charge > 0 {
			if _, err = tx.ExecContext(ctx, `UPDATE users SET credits=credits+$2 WHERE id=$1`, user, charge); err != nil {
				return err
			}
			charge = 0
		}
		if err = trackStage(ctx, tx, id, status); err != nil {
			return err
		}
		if _, err = tx.ExecContext(ctx, `UPDATE story_projects SET status=$2,message=$3,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=$1`, id, status, message); err != nil {
			return err
		}
		if _, err = tx.ExecContext(ctx, `UPDATE jobs SET status=$2,processing_active=false,credits_charged=$3,progress_message=$4,updated_at=now() WHERE id=$1`, id, jobStatus, charge, message); err != nil {
			return err
		}
	}
	// Pending jobs may be cancelled through the legacy job/account APIs.
	_, err = tx.ExecContext(ctx, `UPDATE story_projects p SET status='cancelled',message='Cancelled',updated_at=now() FROM jobs j WHERE p.id=j.id AND p.status='pending' AND j.status='cancelled'`)
	if err != nil {
		return fmt.Errorf("cancel pending story: %w", err)
	}
	return tx.Commit()
}
