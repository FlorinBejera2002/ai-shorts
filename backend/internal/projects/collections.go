package projects

import (
	"context"
	"database/sql"
	"net/http"
	"time"

	"sneepcut/backend-go/internal/identity"

	"github.com/julienschmidt/httprouter"
)

// Collections are the projects on the Clips page: account-level folders (job_id IS NULL) that
// can hold clips from any source video. Root folders created inside a source job are listed
// too, so older libraries stay visible and every clip can move into any of them.

type CollectionInput struct {
	Name string `json:"name"`
}

func (c *CollectionInput) Validate() error {
	folder := FolderInput{Name: c.Name}
	if err := folder.Validate(); err != nil {
		return err
	}
	c.Name = folder.Name
	return nil
}

type MoveToCollectionInput struct {
	CollectionID *string `json:"collectionId"`
}

func (m MoveToCollectionInput) Validate() error {
	return MoveClipInput{FolderID: m.CollectionID}.Validate()
}

func (h *Handler) registerCollections(r *httprouter.Router) {
	r.Handler(http.MethodPost, "/api/collections", h.auth.RequireMember(h.auth.Limit(h.createCollection, "projects-folders", 120, time.Hour)))
	r.Handler(http.MethodPatch, "/api/collections/:id", h.auth.RequireMember(h.auth.Limit(h.renameCollection, "projects-folders", 120, time.Hour)))
	r.Handler(http.MethodDelete, "/api/collections/:id", h.auth.RequireMember(h.auth.Limit(h.deleteCollection, "projects-folders", 120, time.Hour)))
	r.Handler(http.MethodPut, "/api/clips/:id/collection", h.auth.RequireMember(h.auth.Limit(h.moveToCollection, "projects-clips", 240, time.Hour)))
}

// listCollections returns every root folder of the account, oldest first.
func (r *Repository) listCollections(ctx context.Context, userID string) ([]map[string]any, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id,name,created_at FROM project_folders WHERE user_id=$1 AND parent_id IS NULL ORDER BY created_at,id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	collections := []map[string]any{}
	for rows.Next() {
		var id, name string
		var created any
		if err = rows.Scan(&id, &name, &created); err != nil {
			return nil, err
		}
		collections = append(collections, map[string]any{"id": id, "name": name, "createdAt": created})
	}
	return collections, rows.Err()
}

func (r *Repository) CreateCollection(ctx context.Context, userID string, in CollectionInput) (map[string]any, error) {
	if err := in.Validate(); err != nil {
		return nil, err
	}
	id := randomID()
	var created any
	err := r.db.QueryRowContext(ctx, `INSERT INTO project_folders(id,user_id,job_id,parent_id,name) VALUES($1,$2,NULL,NULL,$3) RETURNING created_at`, id, userID, in.Name).Scan(&created)
	if unique(err) {
		return nil, ErrConflict
	}
	if err != nil {
		return nil, err
	}
	return map[string]any{"id": id, "name": in.Name, "createdAt": created}, nil
}

func (r *Repository) RenameCollection(ctx context.Context, userID, id string, in CollectionInput) error {
	if err := in.Validate(); err != nil {
		return err
	}
	result, err := r.db.ExecContext(ctx, `UPDATE project_folders SET name=$3,updated_at=clock_timestamp() WHERE id=$1 AND user_id=$2 AND parent_id IS NULL`, id, userID, in.Name)
	if unique(err) {
		return ErrConflict
	}
	if err != nil {
		return err
	}
	return affected(result)
}

// DeleteCollection removes the project and its subfolders; their clips return to "No project".
func (r *Repository) DeleteCollection(ctx context.Context, userID, id string) error {
	result, err := r.db.ExecContext(ctx, `DELETE FROM project_folders WHERE id=$1 AND user_id=$2 AND parent_id IS NULL`, id, userID)
	if err != nil {
		return err
	}
	return affected(result)
}

// MoveToCollection files any of the user's clips into one of their projects, or out of all (nil).
func (r *Repository) MoveToCollection(ctx context.Context, userID, clipID string, collectionID *string) error {
	if err := (MoveToCollectionInput{CollectionID: collectionID}).Validate(); err != nil {
		return err
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if collectionID != nil {
		var exists bool
		if err = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM project_folders WHERE id=$1 AND user_id=$2 AND parent_id IS NULL)`, *collectionID, userID).Scan(&exists); err != nil {
			return err
		}
		if !exists {
			return sql.ErrNoRows
		}
	}
	result, err := tx.ExecContext(ctx, `UPDATE clips SET folder_id=$3 WHERE id=$1 AND user_id=$2`, clipID, userID, collectionID)
	if err != nil {
		return err
	}
	if err = affected(result); err != nil {
		return err
	}
	return tx.Commit()
}

func (h *Handler) createCollection(w http.ResponseWriter, r *http.Request) {
	var input CollectionInput
	if !decode(w, r, &input) {
		return
	}
	if err := input.Validate(); err != nil {
		respond(w, http.StatusUnprocessableEntity, map[string]string{"detail": err.Error()})
		return
	}
	collection, err := h.repo.CreateCollection(r.Context(), identity.Current(r).User.ID, input)
	if err != nil {
		fail(w, err)
		return
	}
	respond(w, http.StatusCreated, collection)
}

func (h *Handler) renameCollection(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r, "id")
	if !ok {
		respond(w, 400, map[string]string{"detail": "Invalid project identifier"})
		return
	}
	var input CollectionInput
	if !decode(w, r, &input) {
		return
	}
	if err := input.Validate(); err != nil {
		respond(w, http.StatusUnprocessableEntity, map[string]string{"detail": err.Error()})
		return
	}
	if err := h.repo.RenameCollection(r.Context(), identity.Current(r).User.ID, id, input); err != nil {
		fail(w, err)
		return
	}
	respond(w, http.StatusOK, map[string]bool{"updated": true})
}

func (h *Handler) deleteCollection(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r, "id")
	if !ok {
		respond(w, 400, map[string]string{"detail": "Invalid project identifier"})
		return
	}
	if err := h.repo.DeleteCollection(r.Context(), identity.Current(r).User.ID, id); err != nil {
		fail(w, err)
		return
	}
	respond(w, http.StatusNoContent, nil)
}

func (h *Handler) moveToCollection(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r, "id")
	if !ok {
		respond(w, 400, map[string]string{"detail": "Invalid clip identifier"})
		return
	}
	var input MoveToCollectionInput
	if !decode(w, r, &input) {
		return
	}
	if err := input.Validate(); err != nil {
		respond(w, http.StatusUnprocessableEntity, map[string]string{"detail": err.Error()})
		return
	}
	if err := h.repo.MoveToCollection(r.Context(), identity.Current(r).User.ID, id, input.CollectionID); err != nil {
		fail(w, err)
		return
	}
	respond(w, http.StatusOK, map[string]bool{"updated": true})
}
