package clips

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"regexp"
	"strings"
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
type Media interface {
	KeyFromReference(string) (string, error)
	SignedURL(context.Context, string) (string, error)
	Delete(context.Context, string) error
	DeletePrefix(context.Context, string) error
}
type Config struct {
	MaxClipDuration    float64
	EditReservationTTL time.Duration
}
type Handler struct {
	db    *sql.DB
	auth  Auth
	media Media
	cfg   Config
}

func New(db *sql.DB, auth Auth, media Media, cfg Config) *Handler {
	if cfg.MaxClipDuration <= 0 {
		cfg.MaxClipDuration = 60
	}
	if cfg.EditReservationTTL <= 0 {
		cfg.EditReservationTTL = time.Hour
	}
	return &Handler{db, auth, media, cfg}
}
func (h *Handler) Register(r *httprouter.Router) {
	r.Handler("GET", "/api/clips", h.auth.Require(h.list))
	r.Handler("GET", "/api/clips/:id", h.auth.Require(func(w http.ResponseWriter, req *http.Request) {
		if httprouter.ParamsFromContext(req.Context()).ByName("id") == "library" {
			h.library(w, req)
			return
		}
		h.get(w, req)
	}))
	r.Handler("DELETE", "/api/clips/:id", h.auth.RequireMember(h.auth.Limit(h.remove, "clips-delete", 30, time.Hour)))
	r.Handler("PATCH", "/api/clips/:id", h.auth.RequireMember(h.auth.Limit(h.patch, "clips-update", 60, time.Hour)))
	r.Handler("POST", "/api/clips/:id/trim", h.auth.RequireMember(h.auth.Limit(h.trim, "clips-trim", 20, time.Hour)))
	r.Handler("POST", "/api/clips/:id/recut", h.auth.RequireMember(h.auth.Limit(h.recut, "clips-recut", 20, time.Hour)))
	r.Handler("GET", "/api/dashboard/review", h.auth.Require(h.review))
}
func reply(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Cache-Control", "private, no-store")
	if status == 204 {
		w.WriteHeader(status)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
func failure(w http.ResponseWriter, err error) {
	status, message := errorStatus(err)
	reply(w, status, map[string]any{"detail": message, "error": message})
}

var idPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

func requestID(w http.ResponseWriter, r *http.Request) string {
	id := httprouter.ParamsFromContext(r.Context()).ByName("id")
	if !idPattern.MatchString(id) {
		reply(w, 400, map[string]any{"detail": "Invalid clip identifier"})
		return ""
	}
	return strings.ToLower(id)
}
func (h *Handler) list(w http.ResponseWriter, r *http.Request)   { h.listWith(w, r, false) }
func (h *Handler) review(w http.ResponseWriter, r *http.Request) { h.listWith(w, r, true) }
func (h *Handler) listWith(w http.ResponseWriter, r *http.Request, review bool) {
	result, err := h.readList(r.Context(), identity.Current(r).User.ID, review)
	if err != nil {
		failure(w, err)
		return
	}
	reply(w, 200, map[string]any{"clips": result})
}
func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	id := requestID(w, r)
	if id == "" {
		return
	}
	result, err := h.readOne(r.Context(), identity.Current(r).User.ID, id)
	if err != nil {
		failure(w, err)
		return
	}
	reply(w, 200, result)
}
func (h *Handler) library(w http.ResponseWriter, r *http.Request) {
	result, err := h.readLibrary(r.Context(), identity.Current(r).User.ID, ParseLibraryQuery(r.URL.Query()))
	if err != nil {
		failure(w, err)
		return
	}
	reply(w, 200, result)
}
func (h *Handler) remove(w http.ResponseWriter, r *http.Request) {
	id := requestID(w, r)
	if id == "" {
		return
	}
	if err := h.deleteClip(r.Context(), identity.Current(r).User.ID, id); err != nil {
		failure(w, err)
		return
	}
	reply(w, 204, nil)
}
func (h *Handler) patch(w http.ResponseWriter, r *http.Request) {
	id := requestID(w, r)
	if id == "" {
		return
	}
	if !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json") {
		reply(w, 415, map[string]any{"error": "Content-Type must be application/json"})
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 8*1024)
	raw, err := io.ReadAll(r.Body)
	if err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			reply(w, 413, map[string]any{"error": "Request body is too large"})
		} else {
			reply(w, 400, map[string]any{"error": "Request body must be valid JSON"})
		}
		return
	}
	r.Body = io.NopCloser(bytes.NewReader(raw))
	var input MetadataInput
	if err := jsonutil.Read(w, r, &input); err != nil {
		reply(w, 400, map[string]any{"error": err.Error()})
		return
	}
	if err := input.Validate(); err != nil {
		reply(w, 400, map[string]any{"error": err.Error()})
		return
	}
	if err := h.updateMetadata(r.Context(), identity.Current(r).User.ID, id, input); err != nil {
		failure(w, err)
		return
	}
	reply(w, 200, map[string]any{"ok": true})
}
func (h *Handler) trim(w http.ResponseWriter, r *http.Request) {
	id := requestID(w, r)
	if id == "" {
		return
	}
	input := TrimInput{BurnSubtitles: true}
	if err := jsonutil.Read(w, r, &input); err != nil {
		reply(w, 422, map[string]any{"detail": err.Error()})
		return
	}
	if err := input.Validate(h.cfg.MaxClipDuration); err != nil {
		reply(w, 400, map[string]any{"detail": err.Error()})
		return
	}
	taskID, err := h.beginEdit(r.Context(), identity.Current(r).User.ID, id, "trim", map[string]any{"start_time": *input.Start, "end_time": *input.End, "burn_subtitles": input.BurnSubtitles})
	if err != nil {
		failure(w, err)
		return
	}
	reply(w, 202, map[string]any{"task_id": taskID, "status": "trimming"})
}
func (h *Handler) recut(w http.ResponseWriter, r *http.Request) {
	id := requestID(w, r)
	if id == "" {
		return
	}
	var input RecutInput
	if err := jsonutil.Read(w, r, &input); err != nil {
		reply(w, 422, map[string]any{"detail": err.Error()})
		return
	}
	if err := input.Validate(); err != nil {
		reply(w, 422, map[string]any{"detail": err.Error()})
		return
	}
	taskID, err := h.beginEdit(r.Context(), identity.Current(r).User.ID, id, "recut", map[string]any{"segments": input.Segments})
	if err != nil {
		failure(w, err)
		return
	}
	reply(w, 202, map[string]any{"task_id": taskID, "status": "processing"})
}
