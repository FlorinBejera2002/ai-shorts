package audiocleanup

import (
	"errors"
	"github.com/julienschmidt/httprouter"
	"net/http"
	"os"
	"sneepcut/backend-go/internal/httpx"
	"strings"
)

var ErrUnavailable = errors.New("Background noise reduction is unavailable. Turn it off to continue with original audio")

// Available is an administrator attestation about the worker deployment, not a
// filesystem probe in the API container. The worker still validates its assets
// and every derivative. Configuration alone does not establish audio quality.
func Available(get func(string) string) bool {
	return strings.EqualFold(strings.TrimSpace(get("AUDIO_CLEANUP_VERIFIED")), "true") &&
		strings.TrimSpace(get("DEEPFILTER_PATH")) != "" && strings.TrimSpace(get("DEEPFILTER_MODEL")) != ""
}

// Check runs before reserving credits or accepting new cleanup work. Disabling
// cleanup and access to saved versions never depend on this optional capability.
func Check(settings *Settings) error {
	if Enabled(settings) && !Available(os.Getenv) {
		return ErrUnavailable
	}
	return nil
}

type capabilityAuth interface {
	Require(http.HandlerFunc) http.Handler
}

func Registration(auth capabilityAuth) func(*httprouter.Router) {
	return func(router *httprouter.Router) {
		router.Handler("GET", "/api/media-capabilities", auth.Require(capabilities))
	}
}
func capabilities(w http.ResponseWriter, r *http.Request) {
	httpx.JSON(w, http.StatusOK, map[string]any{"audio_cleanup": map[string]bool{"available": Available(os.Getenv)}})
}
