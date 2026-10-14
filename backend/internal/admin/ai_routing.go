package admin

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/julienschmidt/httprouter"

	"sneepcut/backend-go/internal/aiprovider"
	"sneepcut/backend-go/internal/airouting"
	"sneepcut/backend-go/internal/httpx"
	"sneepcut/backend-go/internal/identity"
)

type aiRoutingService interface {
	View(context.Context) (airouting.View, error)
	Update(context.Context, int64, map[aiprovider.Task]airouting.Route, string, string) (airouting.Configuration, error)
}

func (h *Handler) WithAIRouting(service *airouting.Service) *Handler {
	if service != nil {
		h.aiRouting = service
	}
	return h
}

func (h *Handler) registerAIRouting(router *httprouter.Router) {
	if h.aiRouting == nil {
		return
	}
	router.Handler(http.MethodGet, "/api/admin/ai-routing", h.auth.RequireAdmin(h.getAIRouting))
	router.Handler(http.MethodPut, "/api/admin/ai-routing", h.auth.RequireRecentAdmin(h.updateAIRouting))
}

func (h *Handler) getAIRouting(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	view, err := h.aiRouting.View(ctx)
	if err != nil {
		h.aiRoutingError(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, view)
}

func (h *Handler) updateAIRouting(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Version *int64                              `json:"version"`
		Routes  map[aiprovider.Task]airouting.Route `json:"routes"`
		Reason  string                              `json:"reason"`
	}
	if !httpx.Read(w, r, &input, 32*1024) {
		return
	}
	if input.Version == nil {
		httpx.Error(w, http.StatusBadRequest, "The loaded AI routing version is required")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	configuration, err := h.aiRouting.Update(ctx, *input.Version, input.Routes, identity.Current(r).User.ID, input.Reason)
	if err != nil {
		h.aiRoutingError(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, configuration)
}

func (h *Handler) aiRoutingError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, airouting.ErrConflict):
		httpx.Error(w, http.StatusConflict, "AI routing changed since it was loaded. Reload the settings and try again.")
	case errors.Is(err, airouting.ErrInvalidConfiguration):
		httpx.Error(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, airouting.ErrCatalogUnavailable):
		httpx.Error(w, http.StatusServiceUnavailable, "The AI model catalog is unavailable. Try again shortly.")
	default:
		h.fail(w, "AI routing operation", err)
	}
}
