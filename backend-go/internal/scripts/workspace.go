package scripts

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/julienschmidt/httprouter"
	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/httpx"
	"sneepcut/backend-go/internal/identity"
)

var ErrWorkspaceInput = errors.New("script workspace input is invalid")

var validStatuses = map[string]bool{"idea": true, "draft": true, "review": true, "ready": true, "in_production": true, "published": true, "archived": true}
var validPlatforms = map[string]bool{"tiktok": true, "instagram": true, "youtube": true, "linkedin": true}
var validLanguages = map[string]bool{"en": true, "ro": true, "es": true, "fr": true, "de": true, "it": true, "pt": true}

type WorkspaceInput struct {
	Title          string         `json:"title"`
	Status         string         `json:"status"`
	Topic          string         `json:"topic"`
	Platform       string         `json:"platform"`
	Language       string         `json:"language"`
	TargetDuration int            `json:"target_duration_seconds"`
	Tone           string         `json:"tone"`
	Style          string         `json:"style"`
	Audience       string         `json:"audience"`
	Snapshot       map[string]any `json:"snapshot"`
}

type updateWorkspaceRequest struct {
	WorkspaceInput
	Revision int    `json:"revision"`
	Summary  string `json:"summary"`
}

type restoreRequest struct {
	Revision int `json:"revision"`
}

func (input *WorkspaceInput) defaults() {
	input.Title = strings.TrimSpace(input.Title)
	if input.Title == "" {
		input.Title = "Untitled script"
	}
	if input.Status == "" {
		input.Status = "draft"
	}
	if input.Platform == "" {
		input.Platform = "tiktok"
	}
	if input.Language == "" {
		input.Language = "en"
	}
	if input.TargetDuration == 0 {
		input.TargetDuration = 30
	}
	if input.Tone == "" {
		input.Tone = "entertaining"
	}
	if input.Style == "" {
		input.Style = "talking_head"
	}
	if input.Snapshot == nil {
		input.Snapshot = map[string]any{}
	}
}

func (input WorkspaceInput) valid() bool {
	return utf8.RuneCountInString(input.Title) <= 160 && utf8.RuneCountInString(input.Topic) <= 1000 && utf8.RuneCountInString(input.Audience) <= 2000 && validStatuses[input.Status] && validPlatforms[input.Platform] && validLanguages[input.Language] && input.TargetDuration >= 15 && input.TargetDuration <= 180 && utf8.RuneCountInString(input.Tone) <= 48 && utf8.RuneCountInString(input.Style) <= 48
}

func itemID(r *http.Request) (string, bool) {
	id := httprouter.ParamsFromContext(r.Context()).ByName("id")
	return id, data.ValidUUID(id)
}

func versionID(r *http.Request) (string, bool) {
	id := httprouter.ParamsFromContext(r.Context()).ByName("versionID")
	return id, data.ValidUUID(id)
}

func workspaceError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, sql.ErrNoRows):
		httpx.Error(w, 404, "Script not found")
	case errors.Is(err, ErrRevisionConflict):
		httpx.Error(w, 409, "Script changed in another session. Reload before saving again.")
	case errors.Is(err, ErrWorkspaceInput):
		httpx.Error(w, 422, err.Error())
	default:
		httpx.Error(w, 503, "Scripts are temporarily unavailable")
	}
}

func (h *Handler) listItems(w http.ResponseWriter, r *http.Request) {
	includeArchived := r.URL.Query().Get("archived") == "true"
	records, err := h.repository.List(r.Context(), identity.Current(r).User.ID, r.URL.Query().Get("query"), includeArchived)
	if err != nil {
		workspaceError(w, err)
		return
	}
	httpx.JSON(w, 200, map[string]any{"scripts": records})
}

func (h *Handler) createItem(w http.ResponseWriter, r *http.Request) {
	var input WorkspaceInput
	if !httpx.Read(w, r, &input, 64*1024) {
		return
	}
	input.defaults()
	if !input.valid() {
		httpx.Error(w, 422, ErrWorkspaceInput.Error())
		return
	}
	record, err := h.repository.Create(r.Context(), identity.Current(r).User.ID, input)
	if err != nil {
		workspaceError(w, err)
		return
	}
	httpx.JSON(w, 201, map[string]any{"script": record})
}

func (h *Handler) getItem(w http.ResponseWriter, r *http.Request) {
	id, ok := itemID(r)
	if !ok {
		httpx.Error(w, 400, "Script ID is invalid")
		return
	}
	record, err := h.repository.Get(r.Context(), identity.Current(r).User.ID, id)
	if err != nil {
		workspaceError(w, err)
		return
	}
	httpx.JSON(w, 200, map[string]any{"script": record})
}

func (h *Handler) updateItem(w http.ResponseWriter, r *http.Request) {
	id, ok := itemID(r)
	if !ok {
		httpx.Error(w, 400, "Script ID is invalid")
		return
	}
	var input updateWorkspaceRequest
	if !httpx.Read(w, r, &input, 128*1024) {
		return
	}
	input.WorkspaceInput.defaults()
	if input.Revision < 1 || !input.WorkspaceInput.valid() {
		httpx.Error(w, 422, ErrWorkspaceInput.Error())
		return
	}
	record, err := h.repository.Update(r.Context(), identity.Current(r).User.ID, id, input.WorkspaceInput, input.Revision, "manual", strings.TrimSpace(input.Summary))
	if err != nil {
		workspaceError(w, err)
		return
	}
	httpx.JSON(w, 200, map[string]any{"script": record})
}

func (h *Handler) archiveItem(w http.ResponseWriter, r *http.Request) {
	id, ok := itemID(r)
	if !ok {
		httpx.Error(w, 400, "Script ID is invalid")
		return
	}
	record, err := h.repository.Get(r.Context(), identity.Current(r).User.ID, id)
	if err != nil {
		workspaceError(w, err)
		return
	}
	input := WorkspaceInput{Title: record.Title, Status: "archived", Topic: record.Topic, Platform: record.Platform, Language: record.Language, TargetDuration: record.TargetDuration, Tone: record.Tone, Style: record.Style, Audience: record.Audience, Snapshot: record.Snapshot}
	record, err = h.repository.Update(r.Context(), identity.Current(r).User.ID, id, input, record.Revision, "manual", "Archived script")
	if err != nil {
		workspaceError(w, err)
		return
	}
	httpx.JSON(w, 200, map[string]any{"script": record})
}

func (h *Handler) listVersions(w http.ResponseWriter, r *http.Request) {
	id, ok := itemID(r)
	if !ok {
		httpx.Error(w, 400, "Script ID is invalid")
		return
	}
	versions, err := h.repository.Versions(r.Context(), identity.Current(r).User.ID, id)
	if err != nil {
		workspaceError(w, err)
		return
	}
	httpx.JSON(w, 200, map[string]any{"versions": versions})
}

func (h *Handler) restoreVersion(w http.ResponseWriter, r *http.Request) {
	id, ok := itemID(r)
	version, versionOK := versionID(r)
	if !ok || !versionOK {
		httpx.Error(w, 400, "Script or version ID is invalid")
		return
	}
	var input restoreRequest
	if !httpx.Read(w, r, &input, 4096) {
		return
	}
	record, err := h.repository.Restore(r.Context(), identity.Current(r).User.ID, id, version, input.Revision)
	if err != nil {
		workspaceError(w, err)
		return
	}
	httpx.JSON(w, 200, map[string]any{"script": record})
}
