package projects

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/julienschmidt/httprouter"
	"sneepcut/backend-go/internal/identity"
	"sneepcut/backend-go/internal/jsonutil"
)

type Auth interface {
	Require(http.HandlerFunc) http.Handler
	RequireMember(http.HandlerFunc) http.Handler
	Limit(http.HandlerFunc, string, int, time.Duration) http.HandlerFunc
}

type Handler struct {
	repo *Repository
	auth Auth
}

func New(db *sql.DB, auth Auth, media URLSigner) *Handler {
	return &Handler{repo: NewRepository(db, media), auth: auth}
}

func (h *Handler) Register(r *httprouter.Router) {
	r.Handler(http.MethodGet, "/api/projects", h.auth.Require(h.list))
	r.Handler(http.MethodPatch, "/api/projects/:id", h.auth.RequireMember(h.auth.Limit(h.updateProject, "projects-update", 120, time.Hour)))
	r.Handler(http.MethodPost, "/api/projects/:id/folders", h.auth.RequireMember(h.auth.Limit(h.createFolder, "projects-folders", 120, time.Hour)))
	r.Handler(http.MethodPatch, "/api/projects/:id/folders/:folderId", h.auth.RequireMember(h.auth.Limit(h.updateFolder, "projects-folders", 120, time.Hour)))
	r.Handler(http.MethodDelete, "/api/projects/:id/folders/:folderId", h.auth.RequireMember(h.auth.Limit(h.deleteFolder, "projects-folders", 120, time.Hour)))
	r.Handler(http.MethodPatch, "/api/projects/:id/clips/:clipId", h.auth.RequireMember(h.auth.Limit(h.moveClip, "projects-clips", 240, time.Hour)))
}

func respond(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "private, no-store")
	w.WriteHeader(status)
	if body != nil {
		_ = json.NewEncoder(w).Encode(body)
	}
}

func decode(w http.ResponseWriter, r *http.Request, value any) bool {
	if err := jsonutil.Read(w, r, value); err != nil {
		respond(w, http.StatusUnprocessableEntity, map[string]string{"detail": err.Error()})
		return false
	}
	return true
}

func pathID(r *http.Request, name string) (string, bool) {
	id := httprouter.ParamsFromContext(r.Context()).ByName(name)
	return id, uuidPattern.MatchString(id)
}

func fail(w http.ResponseWriter, err error) {
	status, message := http.StatusServiceUnavailable, "Projects are temporarily unavailable"
	switch {
	case errors.Is(err, sql.ErrNoRows):
		status, message = http.StatusNotFound, "Project item not found"
	case errors.Is(err, ErrInvalid):
		status, message = http.StatusBadRequest, err.Error()
	case errors.Is(err, ErrConflict):
		status, message = http.StatusConflict, err.Error()
	}
	respond(w, status, map[string]string{"detail": message})
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	result, err := h.repo.List(r.Context(), identity.Current(r).User.ID)
	if err != nil {
		fail(w, err)
		return
	}
	respond(w, http.StatusOK, result)
}

func (h *Handler) updateProject(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r, "id")
	if !ok {
		respond(w, 400, map[string]string{"detail": "Invalid project identifier"})
		return
	}
	var input ProjectUpdate
	if !decode(w, r, &input) {
		return
	}
	if err := input.Validate(); err != nil {
		fail(w, err)
		return
	}
	if err := h.repo.UpdateProject(r.Context(), identity.Current(r).User.ID, id, input); err != nil {
		fail(w, err)
		return
	}
	respond(w, http.StatusOK, map[string]bool{"updated": true})
}

func (h *Handler) createFolder(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r, "id")
	if !ok {
		respond(w, 400, map[string]string{"detail": "Invalid project identifier"})
		return
	}
	var input FolderInput
	if !decode(w, r, &input) {
		return
	}
	if err := input.Validate(); err != nil {
		fail(w, err)
		return
	}
	folder, err := h.repo.CreateFolder(r.Context(), identity.Current(r).User.ID, id, input)
	if err != nil {
		fail(w, err)
		return
	}
	respond(w, http.StatusCreated, folder)
}

func (h *Handler) updateFolder(w http.ResponseWriter, r *http.Request) {
	projectID, projectOK := pathID(r, "id")
	folderID, folderOK := pathID(r, "folderId")
	if !projectOK || !folderOK {
		respond(w, 400, map[string]string{"detail": "Invalid folder identifier"})
		return
	}
	var input FolderInput
	if !decode(w, r, &input) {
		return
	}
	if err := input.Validate(); err != nil {
		fail(w, err)
		return
	}
	if err := h.repo.UpdateFolder(r.Context(), identity.Current(r).User.ID, projectID, folderID, input); err != nil {
		fail(w, err)
		return
	}
	respond(w, http.StatusOK, map[string]bool{"updated": true})
}

func (h *Handler) deleteFolder(w http.ResponseWriter, r *http.Request) {
	projectID, projectOK := pathID(r, "id")
	folderID, folderOK := pathID(r, "folderId")
	if !projectOK || !folderOK {
		respond(w, 400, map[string]string{"detail": "Invalid folder identifier"})
		return
	}
	if err := h.repo.DeleteFolder(r.Context(), identity.Current(r).User.ID, projectID, folderID); err != nil {
		fail(w, err)
		return
	}
	respond(w, http.StatusNoContent, nil)
}

func (h *Handler) moveClip(w http.ResponseWriter, r *http.Request) {
	projectID, projectOK := pathID(r, "id")
	clipID, clipOK := pathID(r, "clipId")
	if !projectOK || !clipOK {
		respond(w, 400, map[string]string{"detail": "Invalid clip identifier"})
		return
	}
	var input MoveClipInput
	if !decode(w, r, &input) {
		return
	}
	if err := input.Validate(); err != nil {
		fail(w, err)
		return
	}
	if err := h.repo.MoveClip(r.Context(), identity.Current(r).User.ID, projectID, clipID, input.FolderID); err != nil {
		fail(w, err)
		return
	}
	respond(w, http.StatusOK, map[string]bool{"updated": true})
}
