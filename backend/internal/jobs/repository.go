package jobs

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

var ErrCredits = errors.New("Insufficient credits")
var ErrInactive = errors.New("Account is unavailable")

type Repository struct{ db *sql.DB }

func NewRepository(db *sql.DB) *Repository { return &Repository{db: db} }

// An explicit projection preserves the Python JobRead contract without exposing
// execution fencing tokens or worker delivery payloads to API clients.
const jobFields = `j.id,j.user_id,j.source_type,j.source_url,j.source_file_path,j.status,j.progress,j.progress_message,j.num_clips_requested,j.aspect_ratio,j.language,j.subtitle_style,j.include_brand,j.user_instructions,j.credits_charged,j.error_message,j.celery_task_id,j.processing_active,j.active_edit_tasks,j.started_at,j.completed_at,j.created_at,j.updated_at`

func newID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(err)
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

type Prepared struct {
	Input        CreateInput
	WorkerSource string
	Batch        bool
}

func (s *Repository) Create(ctx context.Context, userID string, inputs []Prepared) ([]json.RawMessage, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	result, err := s.createTx(ctx, tx, userID, inputs)
	if err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return result, nil
}

func (s *Repository) createTx(ctx context.Context, tx *sql.Tx, userID string, inputs []Prepared) ([]json.RawMessage, error) {
	var err error
	amount := 0
	for _, p := range inputs {
		amount += p.Input.NumClips * 10
	}
	var reserved string
	err = tx.QueryRowContext(ctx, `UPDATE users SET credits=credits-$2,updated_at=now() WHERE id=$1 AND credits >= $2 AND access_role='member' AND NOT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=$1) RETURNING id`, userID, amount).Scan(&reserved)
	if errors.Is(err, sql.ErrNoRows) {
		var active bool
		if e := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE id=$1 AND access_role='member' AND NOT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=$1))`, userID).Scan(&active); e != nil {
			return nil, e
		}
		if !active {
			return nil, ErrInactive
		}
		return nil, ErrCredits
	}
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(inputs))
	for _, p := range inputs {
		id, taskID := newID(), newID()
		in := p.Input
		message := "Queued"
		if p.Batch {
			message = "Queued (batch)"
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO jobs (id,user_id,source_type,source_url,source_file_path,source_storage_key,status,progress,progress_message,num_clips_requested,aspect_ratio,language,subtitle_style,include_brand,user_instructions,credits_charged,celery_task_id) VALUES ($1,$2,$3,$4,$5,$6,'pending',0,$7,$8,$9,$10,$11,$12,$13,$14,$15)`, id, userID, in.SourceType, in.SourceURL, in.SourceFilePath, in.SourceStorageKey, message, in.NumClips, in.AspectRatio, in.Language, in.SubtitleStyle, in.IncludeBrand, in.UserInstructions, in.NumClips*10, taskID)
		if err != nil {
			return nil, err
		}
		sourceType := "auto"
		if in.SourceType == "youtube" {
			sourceType = "youtube"
		}
		payload := map[string]any{"job_id": id, "source": p.WorkerSource, "source_type": sourceType, "requested_clips": in.NumClips, "aspect_ratio": in.AspectRatio, "burn_subtitles": in.BurnSubtitles, "smart_crop": in.SmartCrop, "user_instructions": in.UserInstructions}
		if !empty(in.SourceStorageKey) {
			payload["source_storage_key"] = *in.SourceStorageKey
		}
		encoded, err := json.Marshal(payload)
		if err != nil {
			return nil, err
		}
		if _, err = tx.ExecContext(ctx, `INSERT INTO job_deliveries (job_id,payload,dispatch_count,execution_count) VALUES ($1,$2,0,0)`, id, string(encoded)); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	result := make([]json.RawMessage, 0, len(ids))
	for _, id := range ids {
		var raw json.RawMessage
		if err = tx.QueryRowContext(ctx, `SELECT row_to_json(row) FROM (SELECT `+jobFields+` FROM jobs j WHERE j.id=$1) row`, id).Scan(&raw); err != nil {
			return nil, err
		}
		result = append(result, raw)
	}
	return result, nil
}

func (s *Repository) List(ctx context.Context, userID string, history bool) ([]json.RawMessage, error) {
	fields := jobFields
	if history {
		fields += `,(SELECT count(*) FROM clips c WHERE c.job_id=j.id AND c.user_id=j.user_id) AS clip_count`
	}
	rows, err := s.db.QueryContext(ctx, `SELECT row_to_json(row) FROM (SELECT `+fields+` FROM jobs j WHERE j.user_id=$1 ORDER BY j.created_at DESC,j.id DESC LIMIT 100) row`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []json.RawMessage{}
	for rows.Next() {
		var raw json.RawMessage
		if err = rows.Scan(&raw); err != nil {
			return nil, err
		}
		if history {
			raw, err = camelJob(raw)
			if err != nil {
				return nil, err
			}
		}
		result = append(result, raw)
	}
	return result, rows.Err()
}

func (s *Repository) Get(ctx context.Context, userID, id string) (json.RawMessage, error) {
	var raw json.RawMessage
	err := s.db.QueryRowContext(ctx, `SELECT row_to_json(row) FROM (SELECT `+jobFields+` FROM jobs j WHERE j.id=$1 AND j.user_id=$2) row`, id, userID).Scan(&raw)
	return raw, err
}

func (s *Repository) Cancel(ctx context.Context, userID, id string) (json.RawMessage, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var status, sourceType string
	var credits int
	if err = tx.QueryRowContext(ctx, `SELECT status,credits_charged,source_type FROM jobs WHERE id=$1 AND user_id=$2 FOR UPDATE`, id, userID).Scan(&status, &credits, &sourceType); err != nil {
		return nil, err
	}
	if status != "completed" && status != "failed" && status != "cancelled" {
		if sourceType == "story" {
			var current int
			if err = tx.QueryRowContext(ctx, `SELECT current_version FROM story_projects WHERE id=$1`, id).Scan(&current); err != nil {
				return nil, err
			}
			if current > 0 {
				credits = 0
			} else if _, err = tx.ExecContext(ctx, `UPDATE jobs SET credits_charged=0 WHERE id=$1`, id); err != nil {
				return nil, err
			}
		}
		if _, err = tx.ExecContext(ctx, `UPDATE jobs SET status='cancelled',progress_message='Cancelled',completed_at=now(),updated_at=now() WHERE id=$1`, id); err != nil {
			return nil, err
		}
		if _, err = tx.ExecContext(ctx, `UPDATE users SET credits=credits+$2,updated_at=now() WHERE id=$1`, userID, credits); err != nil {
			return nil, err
		}
	}
	var raw json.RawMessage
	if err = tx.QueryRowContext(ctx, `SELECT row_to_json(row) FROM (SELECT `+jobFields+` FROM jobs j WHERE j.id=$1) row`, id).Scan(&raw); err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return raw, nil
}

func camelJob(raw json.RawMessage) (json.RawMessage, error) {
	var in map[string]any
	if err := json.Unmarshal(raw, &in); err != nil {
		return nil, err
	}
	out := make(map[string]any, len(in))
	for key, value := range in {
		if key == "clip_count" {
			out["_count"] = map[string]any{"clips": value}
			continue
		}
		parts := strings.Split(key, "_")
		for i := 1; i < len(parts); i++ {
			parts[i] = strings.ToUpper(parts[i][:1]) + parts[i][1:]
		}
		out[strings.Join(parts, "")] = value
	}
	return json.Marshal(out)
}
