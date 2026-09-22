package calendar

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"

	"github.com/julienschmidt/httprouter"
	"sneepcut/backend-go/internal/identity"
)

type Handler struct {
	repository *Repository
	auth       *identity.Handler
	remote     RemotePostDeleter
}

type RemotePostDeleter interface {
	DeletePublishedPosts(context.Context, string, string, []string) error
}

func New(db *sql.DB, auth *identity.Handler, media Media, remote ...RemotePostDeleter) *Handler {
	var tiktokValidator TikTokScheduleValidator
	h := &Handler{auth: auth}
	if len(remote) > 0 {
		h.remote = remote[0]
		tiktokValidator, _ = remote[0].(TikTokScheduleValidator)
	}
	h.repository = NewRepository(db, media, tiktokValidator)
	if len(remote) > 0 {
		h.repository.youtubeValidator, _ = remote[0].(YouTubeScheduleValidator)
	}
	return h
}
func (h *Handler) Register(router *httprouter.Router) {
	router.Handler(http.MethodGet, "/api/calendar", h.auth.Require(h.list))
	router.Handler(http.MethodPost, "/api/calendar", h.auth.RequireMember(h.auth.Limit(h.create, "calendar:mutations", 120, time.Hour)))
	router.Handler(http.MethodPatch, "/api/calendar/:id", h.auth.RequireMember(h.auth.Limit(h.update, "calendar:mutations", 120, time.Hour)))
	router.Handler(http.MethodDelete, "/api/calendar/:id", h.auth.RequireMember(h.auth.Limit(h.delete, "calendar:mutations", 120, time.Hour)))
}
func write(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
func handleError(w http.ResponseWriter, e error) {
	var validation *ValidationError
	switch {
	case errors.As(e, &validation):
		write(w, 400, map[string]any{"error": validation.Error(), "issues": validation.Issues})
	case errors.Is(e, ErrClip):
		write(w, 400, map[string]any{"error": "Please correct the highlighted fields.", "issues": []Issue{{"clipId", e.Error()}}})
	case errors.Is(e, ErrInactive):
		write(w, 409, map[string]string{"error": e.Error()})
	case errors.Is(e, ErrLocked):
		write(w, 409, map[string]string{"error": e.Error()})
	case errors.Is(e, sql.ErrNoRows):
		write(w, 404, map[string]string{"error": "Calendar post not found."})
	default:
		write(w, 503, map[string]string{"error": "Calendar is temporarily unavailable."})
	}
}
func readBody(w http.ResponseWriter, r *http.Request) (map[string]any, bool) {
	data, e := io.ReadAll(http.MaxBytesReader(w, r.Body, 128<<10))
	var large *http.MaxBytesError
	if errors.As(e, &large) {
		write(w, 413, map[string]string{"error": "Request body is too large."})
		return nil, false
	}
	if e != nil {
		write(w, 400, map[string]string{"error": "Request body could not be read."})
		return nil, false
	}
	if !json.Valid(data) {
		write(w, 400, map[string]string{"error": "Request body must be valid JSON."})
		return nil, false
	}
	var input map[string]any
	decoder := json.NewDecoder(bytes.NewReader(data))
	if e = decoder.Decode(&input); e != nil {
		handleError(w, &ValidationError{[]Issue{{"body", "Request body must be an object"}}})
		return nil, false
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		write(w, 400, map[string]string{"error": "Request body must be valid JSON."})
		return nil, false
	}
	return input, true
}
func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	start, end, e := ParseRange(q.Get("start"), q.Get("end"))
	if e != nil || len(q["start"]) != 1 || len(q["end"]) != 1 {
		message := "Calendar range is invalid"
		if e != nil {
			message = e.Error()
		}
		write(w, 400, map[string]string{"error": message})
		return
	}
	result, e := h.repository.List(r.Context(), identity.Current(r).User.ID, start, end)
	if e != nil {
		handleError(w, e)
		return
	}
	write(w, 200, result)
}
func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	input, ok := readBody(w, r)
	if !ok {
		return
	}
	post, e := h.repository.Mutate(r.Context(), identity.Current(r).User.ID, "", input, true)
	if e != nil {
		handleError(w, e)
		return
	}
	write(w, 201, map[string]any{"post": post})
}
func postID(w http.ResponseWriter, r *http.Request) (string, bool) {
	id := httprouter.ParamsFromContext(r.Context()).ByName("id")
	if !idPattern.MatchString(id) {
		write(w, 400, map[string]string{"error": "Calendar post ID is invalid."})
		return "", false
	}
	return id, true
}
func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	id, ok := postID(w, r)
	if !ok {
		return
	}
	input, ok := readBody(w, r)
	if !ok {
		return
	}
	post, e := h.repository.Mutate(r.Context(), identity.Current(r).User.ID, id, input, false)
	if e != nil {
		handleError(w, e)
		return
	}
	write(w, 200, map[string]any{"post": post})
}
func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	id, ok := postID(w, r)
	if !ok {
		return
	}
	platforms := []string{}
	if r.ContentLength != 0 {
		input, valid := readBody(w, r)
		if !valid {
			return
		}
		raw, present := input["platforms"]
		if !present || len(input) != 1 {
			write(w, 400, map[string]string{"error": "Choose valid platforms to delete."})
			return
		}
		values, valid := raw.([]any)
		seen := map[string]bool{}
		for _, value := range values {
			platform, stringValue := value.(string)
			if !stringValue || (platform != "facebook" && platform != "linkedin") || seen[platform] || len(values) != 1 {
				write(w, 400, map[string]string{"error": "Choose one published Facebook or LinkedIn post to delete from the platform."})
				return
			}
			seen[platform] = true
			platforms = append(platforms, platform)
		}
	}
	userID := identity.Current(r).User.ID
	if len(platforms) > 0 {
		if h.remote == nil {
			write(w, 503, map[string]string{"error": "Platform deletion is temporarily unavailable."})
			return
		}
		if e := h.remote.DeletePublishedPosts(r.Context(), userID, id, platforms); e != nil {
			write(w, 409, map[string]string{"error": "The platform post could not be deleted. Reconnect the account or try again."})
			return
		}
	}
	if e := h.repository.Delete(r.Context(), userID, id); e != nil {
		handleError(w, e)
		return
	}
	write(w, 200, map[string]any{"deleted": true, "deletedPlatforms": platforms})
}
