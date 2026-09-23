// Package stories persists multi-source projects and fenced, resumable executions.
package stories

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sneepcut/backend-go/internal/story"
)

var (
	ErrConflict  = errors.New("The story changed or is still processing; refresh and try again")
	ErrOwnership = errors.New("Story execution ownership lost")
	ErrCredits   = errors.New("Insufficient credits; one story costs 10 credits including automatic repairs")
	ErrInvalid   = errors.New("Invalid story request")
	idPattern    = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
)

type Repository struct {
	db     *sql.DB
	limits story.Limits
}

func NewRepository(db *sql.DB, limits story.Limits) *Repository { return &Repository{db, limits} }
func newID() string {
	var b [16]byte
	if _, e := rand.Read(b[:]); e != nil {
		panic(e)
	}
	b[6] = b[6]&15 | 64
	b[8] = b[8]&63 | 128
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[:4], b[4:6], b[6:8], b[8:10], b[10:])
}
func encoded(v any) string { b, _ := json.Marshal(v); return string(b) }

type Project struct {
	ID             string          `json:"id"`
	Options        story.Options   `json:"options"`
	Status         string          `json:"status"`
	Message        string          `json:"message"`
	CurrentVersion int             `json:"current_version"`
	Assets         []story.Asset   `json:"assets"`
	Versions       []story.Version `json:"versions"`
	Attempts       []story.Attempt `json:"attempts"`
	Limits         story.Limits    `json:"limits"`
	AICalls        int             `json:"ai_calls"`
	Metrics        json.RawMessage `json:"metrics"`
}

func (r *Repository) Create(ctx context.Context, user, id string, options story.Options) error {
	if !idPattern.MatchString(id) {
		return ErrInvalid
	}
	result, err := r.db.ExecContext(ctx, `INSERT INTO story_projects(id,user_id,options) SELECT $1,$2,$3 WHERE EXISTS(SELECT 1 FROM users WHERE id=$2 AND access_role='member' AND NOT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=$2)) ON CONFLICT(id) DO NOTHING`, id, user, encoded(options))
	if err != nil {
		return err
	}
	n, _ := result.RowsAffected()
	if n > 0 {
		return nil
	}
	var exists bool
	if err = r.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM story_projects WHERE id=$1 AND user_id=$2 AND options=$3::jsonb)`, id, user, encoded(options)).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return ErrConflict
	}
	return nil
}

func (r *Repository) Get(ctx context.Context, user, id string) (Project, error) {
	p := Project{Assets: []story.Asset{}, Versions: []story.Version{}, Attempts: []story.Attempt{}, Limits: r.limits}
	var options []byte
	err := r.db.QueryRowContext(ctx, `SELECT id,options,status,message,current_version,ai_calls,stage_metrics FROM story_projects WHERE id=$1 AND user_id=$2`, id, user).Scan(&p.ID, &options, &p.Status, &p.Message, &p.CurrentVersion, &p.AICalls, &p.Metrics)
	if err != nil {
		return p, err
	}
	if err = json.Unmarshal(options, &p.Options); err != nil {
		return p, err
	}
	rows, err := r.db.QueryContext(ctx, `SELECT asset FROM story_assets WHERE project_id=$1 ORDER BY (asset->>'order')::int,id`, id)
	if err != nil {
		return p, err
	}
	for rows.Next() {
		var raw []byte
		var a story.Asset
		if err = rows.Scan(&raw); err == nil {
			err = json.Unmarshal(raw, &a)
		}
		if err != nil {
			rows.Close()
			return p, err
		}
		p.Assets = append(p.Assets, a)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return p, err
	}
	rows, err = r.db.QueryContext(ctx, `SELECT version FROM story_versions WHERE project_id=$1 ORDER BY number`, id)
	if err != nil {
		return p, err
	}
	for rows.Next() {
		var raw []byte
		var v story.Version
		if err = rows.Scan(&raw); err == nil {
			err = json.Unmarshal(raw, &v)
		}
		if err != nil {
			rows.Close()
			return p, err
		}
		p.Versions = append(p.Versions, v)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return p, err
	}
	rows, err = r.db.QueryContext(ctx, `SELECT attempt FROM story_attempts WHERE project_id=$1 ORDER BY created_at`, id)
	if err != nil {
		return p, err
	}
	for rows.Next() {
		var raw []byte
		var a story.Attempt
		if err = rows.Scan(&raw); err == nil {
			err = json.Unmarshal(raw, &a)
		}
		if err != nil {
			rows.Close()
			return p, err
		}
		p.Attempts = append(p.Attempts, a)
	}
	err = rows.Err()
	rows.Close()
	return p, err
}

func (r *Repository) List(ctx context.Context, user string) ([]map[string]any, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id,status,message,current_version,options,updated_at FROM story_projects WHERE user_id=$1 AND status<>'deleting' ORDER BY updated_at DESC LIMIT 100`, user)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []map[string]any{}
	for rows.Next() {
		var id, status, message string
		var version int
		var options json.RawMessage
		var updated any
		if err = rows.Scan(&id, &status, &message, &version, &options, &updated); err != nil {
			return nil, err
		}
		result = append(result, map[string]any{"id": id, "status": status, "message": message, "current_version": version, "options": options, "updated_at": updated})
	}
	return result, rows.Err()
}

// All mutations lock the project first. The worker never takes a job lock
// before this one, avoiding inversions with edits and cancellation.
func lockProject(ctx context.Context, tx *sql.Tx, user, id string) (string, error) {
	var status string
	err := tx.QueryRowContext(ctx, `SELECT status FROM story_projects p WHERE id=$1 AND user_id=$2 AND NOT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=p.user_id) FOR UPDATE`, id, user).Scan(&status)
	return status, err
}
func idle(status string) bool {
	return status == "draft" || status == "ready" || status == "needs_review" || status == "failed" || status == "cancelled"
}

func (r *Repository) AddAsset(ctx context.Context, user, id string, a story.Asset) (story.Asset, error) {
	return r.AddOrReplaceAsset(ctx, user, id, a, "")
}

// The project lock makes voice replacement atomic with uploads, mode changes
// and generation. Failed validation never removes the previous recording.
func (r *Repository) AddOrReplaceAsset(ctx context.Context, user, id string, a story.Asset, replaceID string) (story.Asset, error) {
	if !idPattern.MatchString(a.ID) || a.Hash == "" || replaceID != "" && (a.Kind != "narration" || !idPattern.MatchString(replaceID) || replaceID == a.ID) {
		return a, ErrInvalid
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return a, err
	}
	defer tx.Rollback()
	status, err := lockProject(ctx, tx, user, id)
	if err != nil {
		return a, err
	}
	if status != "draft" {
		return a, ErrConflict
	}
	var options story.Options
	var raw []byte
	if err = tx.QueryRowContext(ctx, `SELECT options FROM story_projects WHERE id=$1`, id).Scan(&raw); err != nil {
		return a, err
	}
	if err = json.Unmarshal(raw, &options); err != nil {
		return a, err
	}
	if a.Kind == "narration" && !options.Narration {
		return a, fmt.Errorf("%w: enable narration before adding a recording", ErrInvalid)
	}
	assets, err := readDraftAssets(ctx, tx, id)
	if err != nil {
		return a, err
	}
	// Prefer the stable asset ID when checking retries; a hash match on a
	// different row must not conceal an attempt to mutate an existing ID.
	for _, old := range assets {
		if old.ID == a.ID {
			if old.Hash != a.Hash || old.Key != a.Key || (old.Kind == "narration") != (a.Kind == "narration") {
				return a, ErrConflict
			}
			return old, tx.Commit()
		}
	}
	kept := make([]story.Asset, 0, len(assets)+1)
	var replaced bool
	var duplicate *story.Asset
	videoCount := 0
	for _, old := range assets {
		if old.ID == replaceID {
			if old.Kind != "narration" {
				return a, ErrInvalid
			}
			replaced = true
		} else {
			kept = append(kept, old)
			if old.Kind == "narration" && a.Kind == "narration" && old.Hash != a.Hash {
				return a, ErrConflict
			}
		}
		if old.Kind != "narration" {
			videoCount++
		}
		if old.Hash == a.Hash {
			if (old.Kind == "narration") != (a.Kind == "narration") {
				return a, ErrConflict
			}
			copy := old
			duplicate = &copy
		}
	}
	if replaceID != "" && !replaced {
		return a, ErrConflict
	}
	if duplicate != nil {
		return *duplicate, tx.Commit()
	}
	if a.Order < 0 {
		a.Order = videoCount
	}
	if a.Order > 1000000 {
		return a, ErrInvalid
	}
	a.Include = "auto"
	a.Role = "auto"
	if err = story.ValidateAssets(append(kept, a), r.limits); err != nil {
		return a, fmt.Errorf("%w: %s", ErrInvalid, err)
	}
	if replaced {
		if _, err = tx.ExecContext(ctx, `DELETE FROM story_assets WHERE project_id=$1 AND id=$2`, id, replaceID); err != nil {
			return a, err
		}
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO story_assets(project_id,id,hash,asset) VALUES($1,$2,$3,$4)`, id, a.ID, a.Hash, encoded(a))
	if err != nil {
		return a, err
	}
	return a, tx.Commit()
}

func readDraftAssets(ctx context.Context, tx *sql.Tx, id string) ([]story.Asset, error) {
	rows, err := tx.QueryContext(ctx, `SELECT asset FROM story_assets WHERE project_id=$1 ORDER BY (asset->>'order')::int,id`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	assets := []story.Asset{}
	for rows.Next() {
		var raw []byte
		var a story.Asset
		if err = rows.Scan(&raw); err != nil {
			return nil, err
		}
		if err = json.Unmarshal(raw, &a); err != nil {
			return nil, err
		}
		assets = append(assets, a)
	}
	return assets, rows.Err()
}

func (r *Repository) RemoveAsset(ctx context.Context, user, id, asset string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = r.removeAssetTx(ctx, tx, user, id, asset); err != nil {
		return err
	}
	return tx.Commit()
}

func (r *Repository) removeAssetTx(ctx context.Context, tx *sql.Tx, user, id, asset string) error {
	status, err := lockProject(ctx, tx, user, id)
	if err != nil {
		return err
	}
	if status != "draft" {
		return ErrConflict
	}
	_, err = tx.ExecContext(ctx, `DELETE FROM story_assets WHERE project_id=$1 AND id=$2`, id, asset)
	if err != nil {
		return err
	}
	return nil
}
