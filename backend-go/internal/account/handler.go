package account

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"strconv"
	"time"

	"github.com/julienschmidt/httprouter"
	"sneepcut/backend-go/internal/billing"
	"sneepcut/backend-go/internal/identity"
	"sneepcut/backend-go/internal/jsonutil"
	"sneepcut/backend-go/internal/media"
)

type Auth interface {
	Require(http.HandlerFunc) http.Handler
	RequireDeletionAuth(http.HandlerFunc) http.Handler
	Limit(http.HandlerFunc, string, int, time.Duration) http.HandlerFunc
}
type Media interface {
	CleanupAccount(context.Context, string) (media.CleanupResult, error)
}
type Billing interface {
	CancelForDeletion(context.Context, string) error
}
type Config struct{ Now func() time.Time }
type Handler struct {
	db      *sql.DB
	auth    Auth
	media   Media
	billing Billing
	now     func() time.Time
}

func New(db *sql.DB, auth Auth, media Media, billing Billing, cfg Config) *Handler {
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	return &Handler{db, auth, media, billing, cfg.Now}
}
func (h *Handler) Register(r *httprouter.Router) {
	// Settings must remain reachable after a partial deletion so the signed-in
	// owner can see the pending marker and retry the remaining cleanup steps.
	r.Handler("GET", "/api/user/profile", h.auth.RequireDeletionAuth(h.profile))
	r.Handler("PATCH", "/api/user/profile", h.auth.Require(h.auth.Limit(h.updateProfile, "account-profile", 20, time.Hour)))
	r.Handler("GET", "/api/user/credits", h.auth.Require(h.credits))
	r.Handler("GET", "/api/user/data", h.auth.RequireDeletionAuth(h.export))
	r.Handler("DELETE", "/api/user/data", h.auth.RequireDeletionAuth(h.auth.Limit(h.delete, "account-delete", 5, time.Hour)))
}
func write(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "private, no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

type apiError struct {
	Status        int
	Message, Code string
	RetryAfter    int
	Issues        []Issue
}

func (e *apiError) Error() string { return e.Message }
func fail(w http.ResponseWriter, err error) {
	var e *apiError
	if !errors.As(err, &e) {
		if errors.Is(err, sql.ErrNoRows) {
			e = &apiError{Status: 404, Message: "Account not found"}
		} else {
			e = &apiError{Status: 503, Message: "Account service is temporarily unavailable"}
		}
	}
	body := map[string]any{"error": e.Message}
	if e.Code != "" {
		body["code"] = e.Code
	}
	if len(e.Issues) > 0 {
		body["issues"] = e.Issues
	}
	if e.RetryAfter > 0 {
		body["retryAfterSeconds"] = e.RetryAfter
		w.Header().Set("Retry-After", strconv.Itoa(e.RetryAfter))
	}
	write(w, e.Status, body)
}
func read(w http.ResponseWriter, r *http.Request, dst any) bool {
	contentType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || contentType != "application/json" {
		fail(w, &apiError{Status: 415, Message: "Content-Type must be application/json"})
		return false
	}
	if r.ContentLength > 4096 {
		fail(w, &apiError{Status: 413, Message: "Request body is too large"})
		return false
	}
	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 4096))
	if err != nil {
		var large *http.MaxBytesError
		if errors.As(err, &large) {
			fail(w, &apiError{Status: 413, Message: "Request body is too large"})
		} else {
			fail(w, &apiError{Status: 400, Message: "Request body must be valid JSON"})
		}
		return false
	}
	r.Body = io.NopCloser(bytes.NewReader(raw))
	if err = jsonutil.Read(w, r, dst); err != nil {
		fail(w, &apiError{Status: 400, Message: err.Error()})
		return false
	}
	return true
}
func (h *Handler) profile(w http.ResponseWriter, r *http.Request) {
	principal := identity.Current(r)
	profile, err := h.readProfile(r.Context(), principal.User.ID, principal.AuthenticatedAt)
	if err != nil {
		fail(w, err)
		return
	}
	write(w, 200, map[string]any{"profile": profile})
}
func (h *Handler) updateProfile(w http.ResponseWriter, r *http.Request) {
	var input ProfileInput
	if !read(w, r, &input) {
		return
	}
	if err := input.Validate(); err != nil {
		fail(w, err)
		return
	}
	principal := identity.Current(r)
	if err := h.saveProfile(r.Context(), principal.User.ID, input.Name); err != nil {
		fail(w, err)
		return
	}
	h.profile(w, r)
}
func (h *Handler) credits(w http.ResponseWriter, r *http.Request) {
	user := identity.Current(r).User
	write(w, 200, map[string]any{"credits": user.Credits, "plan": user.Plan})
}
func (h *Handler) export(w http.ResponseWriter, r *http.Request) {
	data, err := h.exportData(r.Context(), identity.Current(r).User.ID)
	if err != nil {
		fail(w, err)
		return
	}
	w.Header().Set("Content-Disposition", `attachment; filename="sneepcut-data-export.json"`)
	write(w, 200, map[string]any{"exportedAt": h.now().UTC(), "format": "Sneepcut GDPR data export", "data": data})
}
func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	var input DeletionInput
	if !read(w, r, &input) {
		return
	}
	principal := identity.Current(r)
	if err := h.deleteAccount(r.Context(), principal.User.ID, principal.AuthenticatedAt, input); err != nil {
		var provider *billing.Error
		if errors.As(err, &provider) {
			fail(w, &apiError{Status: provider.Status, Message: "Billing cleanup is incomplete. Retry account deletion after the indicated waiting period.", Code: provider.Code, RetryAfter: provider.RetryAfterSeconds})
		} else {
			fail(w, err)
		}
		return
	}
	write(w, 200, map[string]any{"deleted": true})
}
