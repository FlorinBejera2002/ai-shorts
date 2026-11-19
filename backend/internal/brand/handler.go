package brand

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"time"

	"github.com/julienschmidt/httprouter"
	"sneepcut/backend-go/internal/identity"
)

type BrandReader interface {
	GetBrand(context.Context, string) (map[string]any, error)
	KitReader
}
type Handler struct {
	db         *sql.DB
	repository *Repository
	auth       *identity.Handler
	media      BrandReader
}

func New(db *sql.DB, auth *identity.Handler, media BrandReader) *Handler {
	return &Handler{db: db, repository: NewRepository(db), auth: auth, media: media}
}
func (h *Handler) Register(router *httprouter.Router) {
	router.Handler(http.MethodGet, "/api/user/brand", h.auth.Require(h.get))
	router.Handler(http.MethodPut, "/api/user/brand", h.auth.RequireMember(h.auth.Limit(h.update, "brand-settings", 60, time.Hour)))
	h.registerKits(router)
}
func write(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	user := identity.Current(r).User
	brand, e := h.media.GetBrand(r.Context(), user.ID)
	if e != nil {
		write(w, 503, map[string]string{"error": "Brand settings are temporarily unavailable"})
		return
	}
	write(w, 200, map[string]any{"brandKit": brand, "plan": user.Plan, "canWhiteLabel": user.Plan == "agency" || user.AccessRole == "admin"})
}
// readJSON decodes one small JSON object body, answering the request itself on failure.
func readJSON(w http.ResponseWriter, r *http.Request, value any) bool {
	contentType, _, e := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if e != nil || contentType != "application/json" {
		write(w, 415, map[string]string{"error": "Content-Type must be application/json"})
		return false
	}
	data, e := io.ReadAll(http.MaxBytesReader(w, r.Body, 8192))
	var oversized *http.MaxBytesError
	if errors.As(e, &oversized) {
		write(w, 413, map[string]string{"error": "Request body is too large"})
		return false
	}
	if e != nil {
		write(w, 400, map[string]string{"error": "Request body must be valid JSON"})
		return false
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	if e = decoder.Decode(value); e != nil {
		write(w, 400, map[string]string{"error": "Request body must be valid JSON"})
		return false
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		write(w, 400, map[string]string{"error": "Request body must contain one object"})
		return false
	}
	return true
}

func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	var input map[string]any
	if !readJSON(w, r, &input) {
		return
	}
	userID := identity.Current(r).User.ID
	var e error
	if e = h.repository.Update(r.Context(), userID, input); e != nil {
		status := 503
		message := "Brand settings are temporarily unavailable"
		switch {
		case errors.Is(e, ErrInvalid):
			status = 400
			message = e.Error()
		case errors.Is(e, ErrPlan):
			status = 403
			message = e.Error()
		case errors.Is(e, ErrInactive):
			status = 409
			message = e.Error()
		}
		write(w, status, map[string]string{"error": message})
		return
	}
	brand, e := h.media.GetBrand(r.Context(), userID)
	if e != nil {
		write(w, 503, map[string]string{"error": "Brand settings could not be read"})
		return
	}
	write(w, 200, map[string]any{"brandKit": brand})
}
