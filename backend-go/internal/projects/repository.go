package projects

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"path"
)

type URLSigner interface {
	KeyFromReference(string) (string, error)
	SignedURL(context.Context, string) (string, error)
}

type Repository struct {
	db    *sql.DB
	media URLSigner
}

func NewRepository(db *sql.DB, media URLSigner) *Repository { return &Repository{db: db, media: media} }

func randomID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(err)
	}
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

func (r *Repository) List(ctx context.Context, userID string) (map[string]any, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id,COALESCE(NULLIF(project_name,''),NULLIF(source_url,''),NULLIF(regexp_replace(source_file_path,'^.*/','','g'),''),'Untitled project'),status,COALESCE(source_url,source_file_path,''),project_brand,created_at,updated_at FROM jobs WHERE user_id=$1 ORDER BY updated_at DESC,id DESC LIMIT 100`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	projects := []map[string]any{}
	byID := map[string]map[string]any{}
	for rows.Next() {
		var id, name, status, source string
		var brand []byte
		var created, updated any
		if err = rows.Scan(&id, &name, &status, &source, &brand, &created, &updated); err != nil {
			return nil, err
		}
		var kit map[string]any
		_ = json.Unmarshal(brand, &kit)
		if reference, ok := kit["logoPath"].(string); ok && reference != "" && r.media != nil {
			if key, keyErr := r.media.KeyFromReference(reference); keyErr == nil {
				if signed, signErr := r.media.SignedURL(ctx, key); signErr == nil {
					kit["logoUrl"] = signed
				}
			}
		}
		p := map[string]any{"id": id, "name": name, "status": status, "source": source, "brandKit": kit, "createdAt": created, "updatedAt": updated, "folders": []map[string]any{}, "clips": []map[string]any{}}
		projects = append(projects, p)
		byID[id] = p
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}
	folders, err := r.db.QueryContext(ctx, `SELECT id,job_id,parent_id,name,created_at FROM project_folders WHERE user_id=$1 ORDER BY lower(name),id`, userID)
	if err != nil {
		return nil, err
	}
	for folders.Next() {
		var id, job, name string
		var parent sql.NullString
		var created any
		if err = folders.Scan(&id, &job, &parent, &name, &created); err != nil {
			folders.Close()
			return nil, err
		}
		if p := byID[job]; p != nil {
			p["folders"] = append(p["folders"].([]map[string]any), map[string]any{"id": id, "parentId": nullable(parent), "name": name, "createdAt": created})
		}
	}
	folders.Close()
	if err = folders.Err(); err != nil {
		return nil, err
	}
	clips, err := r.db.QueryContext(ctx, `SELECT id,job_id,folder_id,title,duration,viral_score,aspect_ratio,COALESCE(NULLIF(thumbnail_storage_key,''),NULLIF(thumbnail_path,''),thumbnail_url,''),hook_text,COALESCE(resolution,''),has_subtitles,created_at FROM clips WHERE user_id=$1 ORDER BY created_at DESC,id DESC`, userID)
	if err != nil {
		return nil, err
	}
	for clips.Next() {
		var id, job, title, aspect, reference, resolution string
		var folder, hook sql.NullString
		var duration float64
		var score sql.NullInt64
		var hasSubtitles bool
		var created any
		if err = clips.Scan(&id, &job, &folder, &title, &duration, &score, &aspect, &reference, &hook, &resolution, &hasSubtitles, &created); err != nil {
			clips.Close()
			return nil, err
		}
		thumbnail := ""
		if reference != "" && r.media != nil {
			if key, e := r.media.KeyFromReference(reference); e == nil {
				thumbnail, _ = r.media.SignedURL(ctx, key)
			}
		}
		if p := byID[job]; p != nil {
			p["clips"] = append(p["clips"].([]map[string]any), map[string]any{"id": id, "folderId": nullable(folder), "title": title, "duration": duration, "viralScore": nullableInt(score), "aspectRatio": aspect, "thumbnailUrl": thumbnail, "hookText": nullable(hook), "resolution": resolution, "hasSubtitles": hasSubtitles, "createdAt": created})
		}
	}
	clips.Close()
	if err = clips.Err(); err != nil {
		return nil, err
	}
	return map[string]any{"projects": projects}, nil
}

func nullable(v sql.NullString) any {
	if v.Valid {
		return v.String
	}
	return nil
}
func nullableInt(v sql.NullInt64) any {
	if v.Valid {
		return v.Int64
	}
	return nil
}

func (r *Repository) UpdateProject(ctx context.Context, userID, projectID string, in ProjectUpdate) error {
	if in.BrandKit != nil {
		var brand struct {
			LogoPath string `json:"logoPath"`
		}
		if json.Unmarshal(in.BrandKit, &brand) != nil {
			return ErrInvalid
		}
		if brand.LogoPath != "" {
			if r.media == nil {
				return ErrInvalid
			}
			key, err := r.media.KeyFromReference(brand.LogoPath)
			if err != nil || path.Dir(key) != "brand/"+userID {
				return ErrInvalid
			}
		}
	}
	result, err := r.db.ExecContext(ctx, `UPDATE jobs SET project_name=COALESCE($3,project_name),project_brand=COALESCE($4,project_brand),updated_at=now() WHERE id=$1 AND user_id=$2`, projectID, userID, in.Name, nullableJSON(in.BrandKit))
	if err != nil {
		return err
	}
	return affected(result)
}
func nullableJSON(v json.RawMessage) any {
	if v == nil {
		return nil
	}
	return string(v)
}

func (r *Repository) CreateFolder(ctx context.Context, userID, projectID string, in FolderInput) (map[string]any, error) {
	if err := r.ensureParent(ctx, userID, projectID, in.ParentID, ""); err != nil {
		return nil, err
	}
	id := randomID()
	result, err := r.db.ExecContext(ctx, `INSERT INTO project_folders(id,user_id,job_id,parent_id,name) SELECT $1,$2,$3,$4,$5 WHERE EXISTS(SELECT 1 FROM jobs WHERE id=$3 AND user_id=$2)`, id, userID, projectID, in.ParentID, in.Name)
	if unique(err) {
		return nil, ErrConflict
	}
	if err != nil {
		return nil, err
	}
	if err = affected(result); err != nil {
		return nil, err
	}
	return map[string]any{"id": id, "parentId": in.ParentID, "name": in.Name}, nil
}
func (r *Repository) UpdateFolder(ctx context.Context, userID, projectID, folderID string, in FolderInput) error {
	if in.ParentID != nil && *in.ParentID == folderID {
		return errors.New("A folder cannot contain itself")
	}
	if err := r.ensureParent(ctx, userID, projectID, in.ParentID, folderID); err != nil {
		return err
	}
	result, err := r.db.ExecContext(ctx, `UPDATE project_folders SET name=$5,parent_id=$4,updated_at=now() WHERE id=$1 AND user_id=$2 AND job_id=$3`, folderID, userID, projectID, in.ParentID, in.Name)
	if unique(err) {
		return ErrConflict
	}
	if err != nil {
		return err
	}
	return affected(result)
}
func (r *Repository) ensureParent(ctx context.Context, userID, projectID string, parent *string, folderID string) error {
	if parent == nil {
		return nil
	}
	var exists, cycle bool
	err := r.db.QueryRowContext(ctx, `WITH RECURSIVE tree AS (SELECT id,parent_id FROM project_folders WHERE id=$1 AND user_id=$2 AND job_id=$3 UNION SELECT f.id,f.parent_id FROM project_folders f JOIN tree t ON f.id=t.parent_id WHERE f.user_id=$2 AND f.job_id=$3) SELECT EXISTS(SELECT 1 FROM tree),EXISTS(SELECT 1 FROM tree WHERE id::text=$4)`, *parent, userID, projectID, folderID).Scan(&exists, &cycle)
	if err != nil {
		return err
	}
	if !exists {
		return sql.ErrNoRows
	}
	if cycle {
		return errors.New("A folder cannot be moved inside itself")
	}
	return nil
}
func (r *Repository) DeleteFolder(ctx context.Context, userID, projectID, folderID string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var parent sql.NullString
	if err = tx.QueryRowContext(ctx, `SELECT parent_id FROM project_folders WHERE id=$1 AND user_id=$2 AND job_id=$3 FOR UPDATE`, folderID, userID, projectID).Scan(&parent); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE clips SET folder_id=$4 WHERE folder_id=$1 AND user_id=$2 AND job_id=$3`, folderID, userID, projectID, nullable(parent)); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE project_folders SET parent_id=$4 WHERE parent_id=$1 AND user_id=$2 AND job_id=$3`, folderID, userID, projectID, nullable(parent)); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM project_folders WHERE id=$1 AND user_id=$2 AND job_id=$3`, folderID, userID, projectID); err != nil {
		return err
	}
	return tx.Commit()
}
func (r *Repository) MoveClip(ctx context.Context, userID, projectID, clipID string, folderID *string) error {
	if folderID != nil {
		var ok bool
		if err := r.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM project_folders WHERE id=$1 AND user_id=$2 AND job_id=$3)`, *folderID, userID, projectID).Scan(&ok); err != nil {
			return err
		}
		if !ok {
			return sql.ErrNoRows
		}
	}
	result, err := r.db.ExecContext(ctx, `UPDATE clips SET job_id=$3,folder_id=$4 WHERE id=$1 AND user_id=$2 AND EXISTS(SELECT 1 FROM jobs WHERE id=$3 AND user_id=$2)`, clipID, userID, projectID, folderID)
	if err != nil {
		return err
	}
	return affected(result)
}
func affected(result sql.Result) error {
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return sql.ErrNoRows
	}
	return nil
}
func unique(err error) bool {
	return err != nil && (contains(err.Error(), "unique") || contains(err.Error(), "duplicate"))
}
func contains(value, needle string) bool {
	for i := 0; i+len(needle) <= len(value); i++ {
		if value[i:i+len(needle)] == needle {
			return true
		}
	}
	return false
}
