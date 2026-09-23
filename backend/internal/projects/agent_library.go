package projects

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"sneepcut/backend-go/internal/agentaction"
)

var ErrLibraryChanged = errors.New("Project library changed; inspect it again before editing")

type LibraryFolder struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	ParentID *string `json:"parent_id"`
	Revision string  `json:"revision"`
}
type LibraryClip struct {
	ID       string  `json:"id"`
	Title    string  `json:"title"`
	FolderID *string `json:"folder_id"`
}
type LibrarySnapshot struct {
	ProjectID     string          `json:"project_id"`
	Name          string          `json:"name"`
	Revision      string          `json:"revision"`
	Folders       []LibraryFolder `json:"folders"`
	Clips         []LibraryClip   `json:"clips"`
	ExpectedState string          `json:"expected_state"`
}
type LibraryInput struct {
	ProjectID     string  `json:"project_id"`
	ID            string  `json:"id,omitempty"`
	ExpectedState string  `json:"expected_state"`
	Name          string  `json:"name,omitempty"`
	ParentID      *string `json:"parent_id"`
	FolderID      *string `json:"folder_id"`
}
type LibraryResult struct {
	LibrarySnapshot
	ChangedID  string        `json:"changed_id"`
	UndoAction string        `json:"undo_action,omitempty"`
	UndoInput  *LibraryInput `json:"undo_input,omitempty"`
}

func lockLibrary(ctx context.Context, tx *sql.Tx, user, project string) error {
	var id string
	if err := tx.QueryRowContext(ctx, `SELECT id FROM jobs WHERE id=$1 AND user_id=$2 FOR UPDATE`, project, user).Scan(&id); err != nil {
		return err
	}
	var active bool
	if err := tx.QueryRowContext(ctx, `SELECT access_role='member' AND NOT email_activation_required AND NOT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=$1) FROM users WHERE id=$1 FOR UPDATE`, user).Scan(&active); err != nil {
		return err
	}
	if !active {
		return ErrInvalid
	}
	return nil
}
func librarySnapshot(ctx context.Context, tx *sql.Tx, user, project string) (LibrarySnapshot, error) {
	out := LibrarySnapshot{ProjectID: project, Folders: []LibraryFolder{}, Clips: []LibraryClip{}}
	if err := tx.QueryRowContext(ctx, `SELECT COALESCE(project_name,''),updated_at::text FROM jobs WHERE id=$1 AND user_id=$2`, project, user).Scan(&out.Name, &out.Revision); err != nil {
		return out, err
	}
	rows, err := tx.QueryContext(ctx, `SELECT id,name,parent_id,updated_at::text FROM project_folders WHERE job_id=$1 AND user_id=$2 ORDER BY id`, project, user)
	if err != nil {
		return out, err
	}
	for rows.Next() {
		var f LibraryFolder
		if err = rows.Scan(&f.ID, &f.Name, &f.ParentID, &f.Revision); err != nil {
			rows.Close()
			return out, err
		}
		out.Folders = append(out.Folders, f)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return out, err
	}
	rows, err = tx.QueryContext(ctx, `SELECT id,title,folder_id FROM clips WHERE job_id=$1 AND user_id=$2 ORDER BY id`, project, user)
	if err != nil {
		return out, err
	}
	for rows.Next() {
		var c LibraryClip
		if err = rows.Scan(&c.ID, &c.Title, &c.FolderID); err != nil {
			rows.Close()
			return out, err
		}
		out.Clips = append(out.Clips, c)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return out, err
	}
	raw, err := json.Marshal(out)
	if err != nil {
		return out, err
	}
	digest := sha256.Sum256(raw)
	out.ExpectedState = hex.EncodeToString(digest[:])
	return out, nil
}
func (r *Repository) InspectLibrary(ctx context.Context, user, project string) (LibrarySnapshot, error) {
	if !uuidPattern.MatchString(project) {
		return LibrarySnapshot{}, ErrInvalid
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return LibrarySnapshot{}, err
	}
	defer tx.Rollback()
	if err = lockLibrary(ctx, tx, user, project); err != nil {
		return LibrarySnapshot{}, err
	}
	out, err := librarySnapshot(ctx, tx, user, project)
	if err != nil {
		return out, err
	}
	return out, tx.Commit()
}
func ensureLibraryParent(ctx context.Context, tx *sql.Tx, user, project string, parent *string, folder string) error {
	if parent == nil {
		return nil
	}
	var exists, cycle bool
	err := tx.QueryRowContext(ctx, `WITH RECURSIVE tree AS (SELECT id,parent_id FROM project_folders WHERE id=$1 AND user_id=$2 AND job_id=$3 UNION SELECT f.id,f.parent_id FROM project_folders f JOIN tree t ON f.id=t.parent_id WHERE f.user_id=$2 AND f.job_id=$3) SELECT EXISTS(SELECT 1 FROM tree),EXISTS(SELECT 1 FROM tree WHERE id::text=$4)`, *parent, user, project, folder).Scan(&exists, &cycle)
	if err != nil {
		return err
	}
	if !exists {
		return sql.ErrNoRows
	}
	if cycle {
		return ErrInvalid
	}
	return nil
}
func mutateLibrary(ctx context.Context, tx *sql.Tx, user, project, kind, id string, in FolderInput, destination *string) error {
	var result sql.Result
	var err error
	switch kind {
	case "folders.create", "folders.update":
		if err = in.Validate(); err != nil {
			return err
		}
		if err = ensureLibraryParent(ctx, tx, user, project, in.ParentID, id); err != nil {
			return err
		}
		if kind == "folders.create" {
			result, err = tx.ExecContext(ctx, `INSERT INTO project_folders(id,user_id,job_id,parent_id,name) VALUES($1,$2,$3,$4,$5)`, id, user, project, in.ParentID, in.Name)
		} else {
			result, err = tx.ExecContext(ctx, `UPDATE project_folders SET name=$5,parent_id=$4,updated_at=clock_timestamp() WHERE id=$1 AND user_id=$2 AND job_id=$3`, id, user, project, in.ParentID, in.Name)
		}
	case "folders.delete":
		var parent *string
		if err = tx.QueryRowContext(ctx, `SELECT parent_id FROM project_folders WHERE id=$1 AND user_id=$2 AND job_id=$3 FOR UPDATE`, id, user, project).Scan(&parent); err != nil {
			return err
		}
		if _, err = tx.ExecContext(ctx, `UPDATE clips SET folder_id=$4 WHERE folder_id=$1 AND user_id=$2 AND job_id=$3`, id, user, project, parent); err != nil {
			return err
		}
		if _, err = tx.ExecContext(ctx, `UPDATE project_folders SET parent_id=$4,updated_at=clock_timestamp() WHERE parent_id=$1 AND user_id=$2 AND job_id=$3`, id, user, project, parent); err != nil {
			return err
		}
		result, err = tx.ExecContext(ctx, `DELETE FROM project_folders WHERE id=$1 AND user_id=$2 AND job_id=$3`, id, user, project)
	case "clips.move":
		if err = (MoveClipInput{FolderID: destination}).Validate(); err != nil {
			return err
		}
		if err = ensureLibraryParent(ctx, tx, user, project, destination, ""); err != nil {
			return err
		}
		// A folder move must never rebind the clip's source job.
		result, err = tx.ExecContext(ctx, `UPDATE clips SET folder_id=$4 WHERE id=$1 AND user_id=$2 AND job_id=$3`, id, user, project, destination)
	default:
		return ErrInvalid
	}
	if unique(err) {
		return ErrConflict
	}
	if err != nil {
		return err
	}
	if err = affected(result); err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `UPDATE jobs SET updated_at=clock_timestamp() WHERE id=$1 AND user_id=$2`, project, user)
	return err
}
func (r *Repository) manualLibrary(ctx context.Context, user, project, kind, id string, in FolderInput, folder *string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = lockLibrary(ctx, tx, user, project); err != nil {
		return err
	}
	if err = mutateLibrary(ctx, tx, user, project, kind, id, in, folder); err != nil {
		return err
	}
	return tx.Commit()
}
func (r *Repository) ChangeLibrary(ctx context.Context, user, request, kind string, in LibraryInput) (LibraryResult, error) {
	var result LibraryResult
	if !uuidPattern.MatchString(request) || !uuidPattern.MatchString(in.ProjectID) || len(in.ExpectedState) != 64 {
		return result, ErrInvalid
	}
	if kind != "folders.create" && !uuidPattern.MatchString(in.ID) {
		return result, ErrInvalid
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return result, err
	}
	defer tx.Rollback()
	replay, err := agentaction.Replay(ctx, tx, user, request, kind, in, &result)
	if err != nil {
		return result, err
	}
	if replay {
		return result, tx.Commit()
	}
	if err = lockLibrary(ctx, tx, user, in.ProjectID); err != nil {
		return result, err
	}
	before, err := librarySnapshot(ctx, tx, user, in.ProjectID)
	if err != nil {
		return result, err
	}
	if before.ExpectedState != in.ExpectedState {
		return result, ErrLibraryChanged
	}
	id := in.ID
	if kind == "folders.create" {
		if id != "" {
			return result, ErrInvalid
		}
		id = request
	}
	if err = mutateLibrary(ctx, tx, user, in.ProjectID, kind, id, FolderInput{Name: in.Name, ParentID: in.ParentID}, in.FolderID); err != nil {
		return result, err
	}
	result.LibrarySnapshot, err = librarySnapshot(ctx, tx, user, in.ProjectID)
	if err != nil {
		return result, err
	}
	result.ChangedID = id
	undo := LibraryInput{ProjectID: in.ProjectID, ID: id, ExpectedState: result.ExpectedState}
	switch kind {
	case "folders.create":
		result.UndoAction = "folders.delete"
		result.UndoInput = &undo
	case "folders.update":
		for _, f := range before.Folders {
			if f.ID == id {
				undo.Name = f.Name
				undo.ParentID = f.ParentID
				result.UndoAction = kind
				result.UndoInput = &undo
			}
		}
	case "clips.move":
		for _, c := range before.Clips {
			if c.ID == id {
				undo.FolderID = c.FolderID
				result.UndoAction = kind
				result.UndoInput = &undo
			}
		}
	}
	if err = agentaction.Put(ctx, tx, user, request, kind, in, result); err != nil {
		return result, err
	}
	return result, tx.Commit()
}
