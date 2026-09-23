package scripts

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"sneepcut/backend-go/internal/data"
)

var ErrRevisionConflict = errors.New("script changed in another session")

type ScriptRecord struct {
	ID             string         `json:"id"`
	Title          string         `json:"title"`
	Status         string         `json:"status"`
	Topic          string         `json:"topic"`
	Platform       string         `json:"platform"`
	Language       string         `json:"language"`
	TargetDuration int            `json:"targetDurationSeconds"`
	Tone           string         `json:"tone"`
	Style          string         `json:"style"`
	Audience       string         `json:"audience"`
	Revision       int            `json:"revision"`
	Snapshot       map[string]any `json:"snapshot"`
	Archived       bool           `json:"archived"`
	CreatedAt      string         `json:"createdAt"`
	UpdatedAt      string         `json:"updatedAt"`
}

type Version struct {
	ID            string         `json:"id"`
	VersionNumber int            `json:"versionNumber"`
	Snapshot      map[string]any `json:"snapshot,omitempty"`
	ChangeType    string         `json:"changeType"`
	Summary       string         `json:"summary"`
	CreatedAt     string         `json:"createdAt"`
}

type Repository struct{ db *sql.DB }

func NewRepository(db *sql.DB) *Repository { return &Repository{db: db} }

func scriptTime(value time.Time) string { return value.UTC().Format("2006-01-02T15:04:05.000Z") }

func scanRecord(row interface{ Scan(...any) error }) (ScriptRecord, error) {
	var record ScriptRecord
	var snapshot []byte
	var archived sql.NullTime
	var created, updated time.Time
	err := row.Scan(&record.ID, &record.Title, &record.Status, &record.Topic, &record.Platform, &record.Language, &record.TargetDuration, &record.Tone, &record.Style, &record.Audience, &record.Revision, &snapshot, &archived, &created, &updated)
	if err != nil {
		return record, err
	}
	if err = json.Unmarshal(snapshot, &record.Snapshot); err != nil {
		return record, err
	}
	if record.Snapshot == nil {
		record.Snapshot = map[string]any{}
	}
	record.Archived = archived.Valid
	record.CreatedAt = scriptTime(created)
	record.UpdatedAt = scriptTime(updated)
	return record, nil
}

const recordSelect = `SELECT s.id,s.title,s.status,s.topic,s.platform,s.language,s.target_duration_seconds,s.tone,s.style,s.audience,s.revision,COALESCE(v.snapshot,'{}'::jsonb),s.archived_at,s.created_at,s.updated_at FROM scripts s LEFT JOIN script_versions v ON v.id=s.current_version_id AND v.script_id=s.id`

func (r *Repository) List(ctx context.Context, userID, query string, includeArchived bool) ([]ScriptRecord, error) {
	records := []ScriptRecord{}
	query = strings.TrimSpace(query)
	rows, err := r.db.QueryContext(ctx, recordSelect+` WHERE s.user_id=$1 AND ($2 OR s.archived_at IS NULL) AND ($3='' OR s.title ILIKE '%'||$3||'%' OR s.topic ILIKE '%'||$3||'%') ORDER BY s.updated_at DESC,s.id DESC LIMIT 100`, userID, includeArchived, query)
	if err != nil {
		return records, err
	}
	defer rows.Close()
	for rows.Next() {
		record, scanErr := scanRecord(rows)
		if scanErr != nil {
			return records, scanErr
		}
		records = append(records, record)
	}
	return records, rows.Err()
}

func (r *Repository) Get(ctx context.Context, userID, id string) (ScriptRecord, error) {
	return scanRecord(r.db.QueryRowContext(ctx, recordSelect+` WHERE s.id=$1 AND s.user_id=$2`, id, userID))
}

func (r *Repository) Create(ctx context.Context, userID string, input WorkspaceInput) (ScriptRecord, error) {
	id, err := data.NewUUID()
	if err != nil {
		return ScriptRecord{}, err
	}
	return r.CreateWithID(ctx, userID, id, input)
}

// CreateWithID preserves identity when durable callers retry a draft creation.
func (r *Repository) CreateWithID(ctx context.Context, userID, id string, input WorkspaceInput) (ScriptRecord, error) {
	if !data.ValidUUID(id) {
		return ScriptRecord{}, ErrWorkspaceInput
	}
	var err error
	input, err = NormalizeWorkspaceInput(input)
	if err != nil {
		return ScriptRecord{}, err
	}
	versionID, err := data.NewUUID()
	if err != nil {
		return ScriptRecord{}, err
	}
	snapshot := input.Snapshot
	if snapshot == nil {
		snapshot = map[string]any{}
	}
	encoded, err := json.Marshal(snapshot)
	if err != nil {
		return ScriptRecord{}, ErrWorkspaceInput
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return ScriptRecord{}, err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, id); err != nil {
		return ScriptRecord{}, err
	}
	existing, lookupErr := scanRecord(tx.QueryRowContext(ctx, recordSelect+` WHERE s.id=$1 AND s.user_id=$2`, id, userID))
	if lookupErr == nil {
		if existing.Revision != 1 || !sameWorkspaceInput(existing, input) {
			return ScriptRecord{}, ErrRevisionConflict
		}
		return existing, tx.Commit()
	}
	if !errors.Is(lookupErr, sql.ErrNoRows) {
		return ScriptRecord{}, lookupErr
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO scripts(id,user_id,title,status,topic,platform,language,target_duration_seconds,tone,style,audience,revision,current_version_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1,$12)`, id, userID, input.Title, input.Status, input.Topic, input.Platform, input.Language, input.TargetDuration, input.Tone, input.Style, input.Audience, versionID)
	if err == nil {
		_, err = tx.ExecContext(ctx, `INSERT INTO script_versions(id,script_id,version_number,snapshot,change_type,summary) VALUES($1,$2,1,$3,'create','Initial draft')`, versionID, id, encoded)
	}
	if err != nil {
		return ScriptRecord{}, err
	}
	record, err := scanRecord(tx.QueryRowContext(ctx, recordSelect+` WHERE s.id=$1 AND s.user_id=$2`, id, userID))
	if err != nil {
		return ScriptRecord{}, err
	}
	if err = tx.Commit(); err != nil {
		return ScriptRecord{}, err
	}
	return record, nil
}

func (r *Repository) Update(ctx context.Context, userID, id string, input WorkspaceInput, expectedRevision int, changeType, summary string) (ScriptRecord, error) {
	versionID, err := data.NewUUID()
	if err != nil {
		return ScriptRecord{}, err
	}
	encoded, err := json.Marshal(input.Snapshot)
	if err != nil {
		return ScriptRecord{}, ErrWorkspaceInput
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return ScriptRecord{}, err
	}
	defer tx.Rollback()
	var current int
	err = tx.QueryRowContext(ctx, `SELECT revision FROM scripts WHERE id=$1 AND user_id=$2 FOR UPDATE`, id, userID).Scan(&current)
	if err != nil {
		return ScriptRecord{}, err
	}
	if current != expectedRevision {
		return ScriptRecord{}, ErrRevisionConflict
	}
	next := current + 1
	_, err = tx.ExecContext(ctx, `INSERT INTO script_versions(id,script_id,version_number,snapshot,change_type,summary) VALUES($1,$2,$3,$4,$5,$6)`, versionID, id, next, encoded, changeType, summary)
	if err == nil {
		_, err = tx.ExecContext(ctx, `UPDATE scripts SET title=$3,status=$4::varchar,topic=$5,platform=$6,language=$7,target_duration_seconds=$8,tone=$9,style=$10,audience=$11,revision=$12,current_version_id=$13,archived_at=CASE WHEN $4::varchar='archived' THEN COALESCE(archived_at,now()) ELSE NULL END,updated_at=now() WHERE id=$1 AND user_id=$2`, id, userID, input.Title, input.Status, input.Topic, input.Platform, input.Language, input.TargetDuration, input.Tone, input.Style, input.Audience, next, versionID)
	}
	if err != nil {
		return ScriptRecord{}, err
	}
	record, err := scanRecord(tx.QueryRowContext(ctx, recordSelect+` WHERE s.id=$1 AND s.user_id=$2`, id, userID))
	if err != nil {
		return ScriptRecord{}, err
	}
	if err = tx.Commit(); err != nil {
		return ScriptRecord{}, err
	}
	return record, nil
}

func (r *Repository) Versions(ctx context.Context, userID, id string) ([]Version, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT v.id,v.version_number,v.change_type,v.summary,v.created_at FROM script_versions v JOIN scripts s ON s.id=v.script_id WHERE v.script_id=$1 AND s.user_id=$2 ORDER BY v.version_number DESC LIMIT 50`, id, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	versions := []Version{}
	for rows.Next() {
		var version Version
		var created time.Time
		if err = rows.Scan(&version.ID, &version.VersionNumber, &version.ChangeType, &version.Summary, &created); err != nil {
			return nil, err
		}
		version.CreatedAt = scriptTime(created)
		versions = append(versions, version)
	}
	return versions, rows.Err()
}

func (r *Repository) Restore(ctx context.Context, userID, id, versionID string, expectedRevision int) (ScriptRecord, error) {
	record, err := r.Get(ctx, userID, id)
	if err != nil {
		return ScriptRecord{}, err
	}
	var raw []byte
	err = r.db.QueryRowContext(ctx, `SELECT v.snapshot FROM script_versions v JOIN scripts s ON s.id=v.script_id WHERE v.id=$1 AND v.script_id=$2 AND s.user_id=$3`, versionID, id, userID).Scan(&raw)
	if err != nil {
		return ScriptRecord{}, err
	}
	if err = json.Unmarshal(raw, &record.Snapshot); err != nil {
		return ScriptRecord{}, err
	}
	input := WorkspaceInput{Title: record.Title, Status: record.Status, Topic: record.Topic, Platform: record.Platform, Language: record.Language, TargetDuration: record.TargetDuration, Tone: record.Tone, Style: record.Style, Audience: record.Audience, Snapshot: record.Snapshot}
	return r.Update(ctx, userID, id, input, expectedRevision, "restore", "Restored an earlier version")
}
