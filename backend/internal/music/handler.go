package music

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/julienschmidt/httprouter"
	"sneepcut/backend-go/internal/httpx"
)

type Authorizer interface {
	Require(http.HandlerFunc) http.Handler
	Limit(http.HandlerFunc, string, int, time.Duration) http.HandlerFunc
}

type CatalogReader interface {
	Search(context.Context, string, int, int) (SearchResult, error)
	Get(context.Context, string) (Track, error)
}

type Handler struct {
	catalog CatalogReader
	auth    Authorizer
}

func NewHandler(catalog CatalogReader, auth Authorizer) *Handler {
	return &Handler{catalog: catalog, auth: auth}
}

func (h *Handler) Register(router *httprouter.Router) {
	router.Handler(http.MethodGet, "/api/music", h.auth.Require(h.auth.Limit(h.search, "music:read", 120, time.Minute)))
	router.Handler(http.MethodGet, "/api/music/:id", h.auth.Require(h.auth.Limit(h.get, "music:read", 120, time.Minute)))
}

func (h *Handler) search(w http.ResponseWriter, r *http.Request) {
	page, pageErr := queryInt(r, "page", 1)
	limit, limitErr := queryInt(r, "limit", 24)
	if pageErr != nil || limitErr != nil || page < 1 || limit < 1 {
		httpx.Error(w, http.StatusBadRequest, "Page and limit must be positive integers")
		return
	}
	result, err := h.catalog.Search(r.Context(), r.URL.Query().Get("query"), page, limit)
	if err != nil {
		writeError(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, result)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	id := httprouter.ParamsFromContext(r.Context()).ByName("id")
	track, err := h.catalog.Get(r.Context(), id)
	if err != nil {
		writeError(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, track)
}

func queryInt(r *http.Request, key string, fallback int) (int, error) {
	value := r.URL.Query().Get(key)
	if value == "" {
		return fallback, nil
	}
	return strconv.Atoi(value)
}

func writeError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrInvalid):
		httpx.Error(w, http.StatusBadRequest, "Invalid music selection or search; maximum page size is 50")
	case errors.Is(err, ErrNotFound):
		httpx.Error(w, http.StatusNotFound, "Music track is no longer available")
	default:
		httpx.Error(w, http.StatusServiceUnavailable, "Music catalogue is temporarily unavailable. Please retry shortly.")
	}
}
