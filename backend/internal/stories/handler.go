package stories

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/julienschmidt/httprouter"
	"sneepcut/backend-go/internal/identity"
	"sneepcut/backend-go/internal/jsonutil"
	"sneepcut/backend-go/internal/story"
)

type Auth interface {
	Require(http.HandlerFunc) http.Handler
	RequireMember(http.HandlerFunc) http.Handler
	Limit(http.HandlerFunc, string, int, time.Duration) http.HandlerFunc
}
type Media interface {
	ValidateUploadSource(context.Context, string, string) (string, error)
	SignedURL(context.Context, string) (string, error)
	DeletePrefix(context.Context, string) error
}
type Handler struct {
	repo         *Repository
	auth         Auth
	media        Media
	engine       story.Media
	inspectSlots chan struct{}
}

func New(db *sql.DB, auth Auth, media Media, engine story.Media, limits story.Limits) *Handler {
	return &Handler{NewRepository(db, limits), auth, media, engine, make(chan struct{}, 2)}
}
func (h *Handler) Register(r *httprouter.Router) {
	r.Handler("GET", "/api/stories", h.auth.Require(h.list))
	r.Handler("POST", "/api/stories", h.auth.RequireMember(h.auth.Limit(h.create, "story-create", 30, time.Hour)))
	r.Handler("GET", "/api/stories/:id", h.auth.Require(h.get))
	r.Handler("PATCH", "/api/stories/:id", h.auth.RequireMember(h.auth.Limit(h.patch, "story-edit", 120, time.Hour)))
	r.Handler("DELETE", "/api/stories/:id", h.auth.RequireMember(h.remove))
	r.Handler("POST", "/api/stories/:id/assets", h.auth.RequireMember(h.auth.Limit(h.asset, "story-asset", 60, time.Hour)))
	r.Handler("DELETE", "/api/stories/:id/assets/:assetId", h.auth.RequireMember(h.removeAsset))
	r.Handler("POST", "/api/stories/:id/generate", h.auth.RequireMember(h.auth.Limit(h.generate, "story-generate", 20, time.Hour)))
	r.Handler("POST", "/api/stories/:id/retry", h.auth.RequireMember(h.auth.Limit(h.generate, "story-generate", 20, time.Hour)))
	r.Handler("POST", "/api/stories/:id/cancel", h.auth.RequireMember(h.cancel))
	r.Handler("POST", "/api/stories/:id/rollback", h.auth.RequireMember(h.auth.Limit(h.rollback, "story-edit", 120, time.Hour)))
}
func reply(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "private, no-store")
	w.WriteHeader(status)
	if v != nil {
		_ = json.NewEncoder(w).Encode(v)
	}
}
func failure(w http.ResponseWriter, err error) {
	status, msg := 503, "Story service is temporarily unavailable"
	switch {
	case errors.Is(err, sql.ErrNoRows):
		status, msg = 404, "Story not found"
	case errors.Is(err, ErrConflict):
		status, msg = 409, err.Error()
	case errors.Is(err, ErrInvalid):
		status, msg = 422, err.Error()
	case errors.Is(err, ErrCredits):
		status, msg = 402, err.Error()
	}
	reply(w, status, map[string]string{"detail": msg})
}
func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	if err := jsonutil.Read(w, r, v); err != nil {
		reply(w, 422, map[string]string{"detail": "Invalid request body"})
		return false
	}
	return true
}
func requestID(w http.ResponseWriter, r *http.Request) string {
	id := strings.ToLower(httprouter.ParamsFromContext(r.Context()).ByName("id"))
	if !idPattern.MatchString(id) {
		failure(w, ErrInvalid)
		return ""
	}
	return id
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	var in struct {
		ID      string        `json:"id"`
		Options story.Options `json:"options"`
	}
	in.Options = story.DefaultOptions()
	if !decode(w, r, &in) {
		return
	}
	options, err := story.NormalizeOptions(in.Options)
	if err != nil {
		failure(w, ErrInvalid)
		return
	}
	user := identity.Current(r).User.ID
	if err = h.repo.Create(r.Context(), user, in.ID, options); err != nil {
		failure(w, err)
		return
	}
	h.respondProject(w, r, user, in.ID, 201)
}
func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	items, err := h.repo.List(r.Context(), identity.Current(r).User.ID)
	if err != nil {
		failure(w, err)
		return
	}
	reply(w, 200, map[string]any{"stories": items, "limits": h.repo.limits})
}
func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	id := requestID(w, r)
	if id != "" {
		h.respondProject(w, r, identity.Current(r).User.ID, id, 200)
	}
}

func (h *Handler) respondProject(w http.ResponseWriter, r *http.Request, user, id string, status int) {
	p, err := h.repo.Get(r.Context(), user, id)
	if err != nil {
		failure(w, err)
		return
	}
	var locksRaw []byte
	if err = h.repo.db.QueryRowContext(r.Context(), `SELECT locks FROM story_projects WHERE id=$1 AND user_id=$2`, id, user).Scan(&locksRaw); err != nil {
		failure(w, err)
		return
	}
	var locks []Lock
	if err = json.Unmarshal(locksRaw, &locks); err != nil {
		failure(w, err)
		return
	}
	for i := range p.Versions {
		if p.Versions[i].Number == p.CurrentVersion {
			applyLocks(&p.Versions[i], locks)
		} else if p.CurrentVersion > 0 {
			// History controls need summaries; the selected version is fetched in
			// full after rollback. Avoid resending every old word every poll.
			p.Versions[i].Plan.Blocks = []story.Block{}
			p.Versions[i].Timeline = []story.Entry{}
		}
	}
	for i := range p.Assets {
		for j := range p.Assets[i].Candidates {
			p.Assets[i].Candidates[j].Words = nil
		}
	}
	var out map[string]any
	if err = json.Unmarshal([]byte(encoded(p)), &out); err != nil {
		failure(w, err)
		return
	}
	assets := out["assets"].([]any)
	for i, a := range p.Assets {
		m := assets[i].(map[string]any)
		url, e := h.media.SignedURL(r.Context(), a.Key)
		if e == nil {
			m["source_url"] = url
		}
		if a.ThumbnailKey != "" {
			url, e = h.media.SignedURL(r.Context(), a.ThumbnailKey)
			if e == nil {
				m["thumbnail_url"] = url
			}
		}
		delete(m, "key")
		delete(m, "proxy_key")
		delete(m, "thumbnail_key")
	}
	versions := out["versions"].([]any)
	for i, v := range p.Versions {
		m := versions[i].(map[string]any)
		if v.Output.Key != "" && v.Accepted && v.Number == p.CurrentVersion {
			url, e := h.media.SignedURL(r.Context(), v.Output.Key)
			if e == nil {
				m["preview_url"] = url
			}
		}
		if v.Output.ThumbnailKey != "" && v.Accepted && v.Number == p.CurrentVersion {
			url, e := h.media.SignedURL(r.Context(), v.Output.ThumbnailKey)
			if e == nil {
				m["thumbnail_url"] = url
			}
		}
		if output, ok := m["output"].(map[string]any); ok {
			delete(output, "key")
			delete(output, "thumbnail_key")
		}
	}
	reply(w, status, out)
}

func (h *Handler) patch(w http.ResponseWriter, r *http.Request) {
	id := requestID(w, r)
	if id == "" {
		return
	}
	var in Patch
	if !decode(w, r, &in) {
		return
	}
	user := identity.Current(r).User.ID
	if err := h.repo.Patch(r.Context(), user, id, in); err != nil {
		failure(w, err)
		return
	}
	h.respondProject(w, r, user, id, 200)
}

func (h *Handler) asset(w http.ResponseWriter, r *http.Request) {
	id := requestID(w, r)
	if id == "" {
		return
	}
	var in struct {
		ID             string `json:"id"`
		Reference      string `json:"reference"`
		Name           string `json:"name"`
		Order          *int   `json:"order"`
		Kind           string `json:"kind"`
		ReplaceAssetID string `json:"replace_asset_id"`
	}
	if !decode(w, r, &in) {
		return
	}
	if !idPattern.MatchString(in.ID) || strings.TrimSpace(in.Name) == "" || utf8.RuneCountInString(in.Name) > 255 {
		failure(w, ErrInvalid)
		return
	}
	if in.Kind != "" && in.Kind != "video" && in.Kind != "narration" || in.ReplaceAssetID != "" && (in.Kind != "narration" || !idPattern.MatchString(in.ReplaceAssetID) || in.ReplaceAssetID == in.ID) {
		failure(w, ErrInvalid)
		return
	}
	user := identity.Current(r).User.ID
	p, err := h.repo.Get(r.Context(), user, id)
	if err != nil {
		failure(w, err)
		return
	}
	if p.Status != "draft" {
		failure(w, ErrConflict)
		return
	}
	var key string
	if in.Kind == "narration" {
		validator, ok := h.media.(interface {
			ValidateNarrationUploadSource(context.Context, string, string) (string, error)
		})
		if !ok || !p.Options.Narration {
			failure(w, ErrInvalid)
			return
		}
		key, err = validator.ValidateNarrationUploadSource(r.Context(), user, in.Reference)
	} else {
		key, err = h.media.ValidateUploadSource(r.Context(), user, in.Reference)
	}
	if err != nil {
		reply(w, 422, map[string]string{"detail": "Uploaded source is unavailable or does not belong to this account"})
		return
	}
	for _, a := range p.Assets {
		if a.ID == in.ID {
			if a.Key != key || (a.Kind == "narration") != (in.Kind == "narration") {
				failure(w, ErrConflict)
				return
			}
			h.respondProject(w, r, user, id, 200)
			return
		}
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Minute)
	defer cancel()
	select {
	case h.inspectSlots <- struct{}{}:
		defer func() { <-h.inspectSlots }()
	case <-ctx.Done():
		failure(w, ctx.Err())
		return
	}
	var a story.Asset
	if in.Kind == "narration" {
		inspector, ok := h.engine.(story.NarrationInspector)
		if !ok {
			failure(w, errors.New("narration inspection unavailable"))
			return
		}
		a, err = inspector.InspectNarration(ctx, key)
	} else {
		a, err = h.engine.Inspect(ctx, key)
	}
	if err != nil {
		message := "The video could not be validated. Use a complete SDR MP4 or MOV file with supported video/audio codecs."
		if in.Kind == "narration" {
			message = "The narration could not be validated. Use an audio-only WebM, M4A, MP3, WAV or Ogg recording, up to 3 minutes and 32 MiB."
		}
		reply(w, 422, map[string]string{"detail": message})
		return
	}
	a.ID = in.ID
	a.Key = key
	a.Name = strings.TrimSpace(in.Name)
	a.Kind = in.Kind
	a.Order = -1
	if in.Order != nil {
		if *in.Order < 0 || *in.Order > 1000000 {
			failure(w, ErrInvalid)
			return
		}
		a.Order = *in.Order
	}
	if _, err = h.repo.AddOrReplaceAsset(ctx, user, id, a, in.ReplaceAssetID); err != nil {
		failure(w, err)
		return
	}
	h.respondProject(w, r, user, id, 201)
}

func (h *Handler) removeAsset(w http.ResponseWriter, r *http.Request) {
	id := requestID(w, r)
	asset := strings.ToLower(httprouter.ParamsFromContext(r.Context()).ByName("assetId"))
	if id == "" {
		return
	}
	if !idPattern.MatchString(asset) {
		failure(w, ErrInvalid)
		return
	}
	user := identity.Current(r).User.ID
	if err := h.repo.RemoveAsset(r.Context(), user, id, asset); err != nil {
		failure(w, err)
		return
	}
	h.respondProject(w, r, user, id, 200)
}
func (h *Handler) generate(w http.ResponseWriter, r *http.Request) {
	id := requestID(w, r)
	if id == "" {
		return
	}
	var in Generate
	if !decode(w, r, &in) {
		return
	}
	user := identity.Current(r).User.ID
	if err := h.repo.Queue(r.Context(), user, id, in); err != nil {
		failure(w, err)
		return
	}
	h.respondProject(w, r, user, id, 202)
}
func (h *Handler) cancel(w http.ResponseWriter, r *http.Request) {
	id := requestID(w, r)
	if id == "" {
		return
	}
	user := identity.Current(r).User.ID
	if err := h.repo.Cancel(r.Context(), user, id); err != nil {
		failure(w, err)
		return
	}
	h.respondProject(w, r, user, id, 200)
}
func (h *Handler) rollback(w http.ResponseWriter, r *http.Request) {
	id := requestID(w, r)
	if id == "" {
		return
	}
	var in struct {
		Version   int    `json:"version"`
		RequestID string `json:"request_id"`
	}
	if !decode(w, r, &in) {
		return
	}
	user := identity.Current(r).User.ID
	if err := h.repo.Rollback(r.Context(), user, id, in.Version, in.RequestID); err != nil {
		failure(w, err)
		return
	}
	h.respondProject(w, r, user, id, 200)
}
func (h *Handler) remove(w http.ResponseWriter, r *http.Request) {
	id := requestID(w, r)
	if id == "" {
		return
	}
	user := identity.Current(r).User.ID
	if err := h.repo.Delete(r.Context(), user, id, h.media); err != nil {
		failure(w, err)
		return
	}
	reply(w, 204, nil)
}
