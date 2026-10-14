package airouting

import (
	"crypto/sha256"
	"crypto/subtle"
	"net/http"
	"strings"

	"github.com/julienschmidt/httprouter"
	"sneepcut/backend-go/internal/aiprovider"
	"sneepcut/backend-go/internal/httpx"
)

// StudioRegistration exposes only Studio's selected provider/model. It uses the
// existing server-to-server secret, never a browser token or AI credential.
func (s *Service) StudioRegistration(secret string) func(*httprouter.Router) {
	return func(router *httprouter.Router) {
		for path, task := range map[string]aiprovider.Task{
			"/api/internal/ai-routing/studio":            aiprovider.TaskStudioEditing,
			"/api/internal/ai-routing/studio-background": aiprovider.TaskStudioBackground,
		} {
			router.HandlerFunc(http.MethodGet, path, func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Cache-Control", "no-store")
				given := sha256.Sum256([]byte(r.Header.Get("X-Studio-Agent-Secret")))
				expected := sha256.Sum256([]byte(secret))
				if len(strings.TrimSpace(secret)) < 32 || subtle.ConstantTimeCompare(given[:], expected[:]) != 1 {
					httpx.Error(w, http.StatusUnauthorized, "Studio authentication required")
					return
				}
				route, err := s.RouteForTask(r.Context(), task)
				if err != nil {
					httpx.Error(w, http.StatusServiceUnavailable, "Studio AI routing is unavailable")
					return
				}
				httpx.JSON(w, http.StatusOK, route)
			})
		}
	}
}
