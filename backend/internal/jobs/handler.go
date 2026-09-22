package jobs

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net"
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
	ValidateUploadSource(context.Context, string, string) (string, error)
	WorkerSource(context.Context, string) (string, error)
}
type Config struct {
	LookupIP              LookupIP
	YouTubeImportApproved bool
}
type Handler struct {
	repo  *Repository
	auth  Auth
	media Media
	cfg   Config
}

func New(db *sql.DB, auth Auth, media Media, cfg Config) *Handler {
	if cfg.LookupIP == nil {
		cfg.LookupIP = net.DefaultResolver.LookupIP
	}
	return &Handler{NewRepository(db), auth, media, cfg}
}
func (h *Handler) Register(r *httprouter.Router) {
	r.Handler("GET", "/api/jobs", h.auth.Require(h.list))
	r.Handler("POST", "/api/jobs", h.auth.RequireMember(h.auth.Limit(h.create, "jobs-create", 30, time.Hour)))
	// httprouter v1 does not allow static and parameter siblings. Dispatch the
	// literal batch operation within the same parameter branch as cancellation.
	r.Handler("POST", "/api/jobs/:id", h.auth.RequireMember(h.auth.Limit(func(w http.ResponseWriter, req *http.Request) {
		if httprouter.ParamsFromContext(req.Context()).ByName("id") != "batch" {
			http.NotFound(w, req)
			return
		}
		h.batch(w, req)
	}, "jobs-batch", 5, time.Hour)))
	r.Handler("GET", "/api/jobs/:id", h.auth.Require(h.get))
	r.Handler("POST", "/api/jobs/:id/cancel", h.auth.RequireMember(h.cancel))
	r.Handler("GET", "/api/dashboard/history", h.auth.Require(h.history))
}

var idPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

func requestID(w http.ResponseWriter, r *http.Request) string {
	id := httprouter.ParamsFromContext(r.Context()).ByName("id")
	if !idPattern.MatchString(id) {
		reply(w, 400, map[string]any{"detail": "Invalid job identifier"})
		return ""
	}
	return strings.ToLower(id)
}
func reply(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "private, no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
func failure(w http.ResponseWriter, err error) {
	status, message := 503, "Job service is temporarily unavailable"
	switch {
	case errors.Is(err, sql.ErrNoRows):
		status, message = 404, "Job not found"
	case errors.Is(err, ErrCredits):
		status, message = 402, err.Error()
	case errors.Is(err, ErrInactive):
		status, message = 403, err.Error()
	}
	reply(w, status, map[string]any{"detail": message})
}
func decode(w http.ResponseWriter, r *http.Request, dst any) bool {
	if err := jsonutil.Read(w, r, dst); err != nil {
		reply(w, 422, map[string]any{"detail": err.Error()})
		return false
	}
	return true
}
func (h *Handler) prepare(ctx context.Context, userID string, p CreateInput) (Prepared, error) {
	if !empty(p.SourceURL) {
		if !h.cfg.YouTubeImportApproved && RequiresYouTubeImportApproval(p.SourceType, *p.SourceURL) {
			return Prepared{}, errors.New("Video link imports are unavailable. Upload your original video file instead")
		}
		err := ValidateSourceURL(ctx, h.cfg.LookupIP, p.SourceType, *p.SourceURL)
		return Prepared{Input: p, WorkerSource: *p.SourceURL}, err
	}
	reference := value(p.SourceStorageKey)
	if reference == "" {
		reference = value(p.SourceFilePath)
	}
	key, err := h.media.ValidateUploadSource(ctx, userID, reference)
	if err != nil {
		return Prepared{}, err
	}
	if !empty(p.SourceFilePath) && !empty(p.SourceStorageKey) {
		other, err := h.media.ValidateUploadSource(ctx, userID, *p.SourceFilePath)
		if err != nil || other != key {
			return Prepared{}, errors.New("Uploaded file path and storage key do not match")
		}
	}
	source, err := h.media.WorkerSource(ctx, key)
	if err != nil {
		return Prepared{}, err
	}
	p.SourceStorageKey = &key
	// Preserve the source_file_path response field; workers use the stable key.
	if empty(p.SourceFilePath) {
		p.SourceFilePath = &key
	}
	return Prepared{Input: p, WorkerSource: source}, nil
}
func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	in := CreateInput{Options: DefaultOptions()}
	if !decode(w, r, &in) {
		return
	}
	if err := in.Validate(); err != nil {
		reply(w, 422, map[string]any{"detail": err.Error()})
		return
	}
	userID := identity.Current(r).User.ID
	prepared, err := h.prepare(r.Context(), userID, in)
	if err != nil {
		reply(w, 400, map[string]any{"detail": err.Error()})
		return
	}
	result, err := h.repo.Create(r.Context(), userID, []Prepared{prepared})
	if err != nil {
		failure(w, err)
		return
	}
	reply(w, 201, result[0])
}
func (h *Handler) batch(w http.ResponseWriter, r *http.Request) {
	in := BatchInput{Options: DefaultOptions()}
	if !decode(w, r, &in) {
		return
	}
	if err := in.Validate(); err != nil {
		reply(w, 422, map[string]any{"detail": err.Error()})
		return
	}
	if len(in.SourceURLs) < 1 || len(in.SourceURLs) > 20 {
		reply(w, 422, map[string]any{"detail": "Provide between 1 and 20 source URLs"})
		return
	}
	userID := identity.Current(r).User.ID
	prepared := make([]Prepared, 0, len(in.SourceURLs))
	for _, source := range in.SourceURLs {
		p := CreateInput{Options: in.Options, SourceType: "youtube", SourceURL: &source}
		if err := p.Validate(); err != nil {
			reply(w, 422, map[string]any{"detail": err.Error()})
			return
		}
		item, err := h.prepare(r.Context(), userID, p)
		if err != nil {
			reply(w, 400, map[string]any{"detail": err.Error()})
			return
		}
		item.Batch = true
		prepared = append(prepared, item)
	}
	result, err := h.repo.Create(r.Context(), userID, prepared)
	if err != nil {
		failure(w, err)
		return
	}
	reply(w, 201, map[string]any{"jobs": result, "total_credits": in.NumClips * 10 * len(result)})
}
func (h *Handler) list(w http.ResponseWriter, r *http.Request)    { h.listWith(w, r, false) }
func (h *Handler) history(w http.ResponseWriter, r *http.Request) { h.listWith(w, r, true) }
func (h *Handler) listWith(w http.ResponseWriter, r *http.Request, history bool) {
	result, err := h.repo.List(r.Context(), identity.Current(r).User.ID, history)
	if err != nil {
		failure(w, err)
		return
	}
	reply(w, 200, map[string]any{"jobs": result})
}
func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	id := requestID(w, r)
	if id == "" {
		return
	}
	result, err := h.repo.Get(r.Context(), identity.Current(r).User.ID, id)
	if err != nil {
		failure(w, err)
		return
	}
	reply(w, 200, map[string]any{"job": result, "celery_state": nil, "celery_meta": nil})
}
func (h *Handler) cancel(w http.ResponseWriter, r *http.Request) {
	id := requestID(w, r)
	if id == "" {
		return
	}
	result, err := h.repo.Cancel(r.Context(), identity.Current(r).User.ID, id)
	if err != nil {
		failure(w, err)
		return
	}
	reply(w, 200, result)
}
