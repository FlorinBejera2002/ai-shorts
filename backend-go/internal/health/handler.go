package health

import (
	"net/http"

	"sneepcut/backend-go/internal/jsonutil"
)

// Handler reports process liveness, not database/worker readiness.
func Handler(environment, version string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = jsonutil.Write(w, http.StatusOK, jsonutil.Envelope{
			"status":  "available",
			"service": "sneepcut-backend-go",
			"system_info": map[string]string{
				"environment": environment,
				"version":     version,
			},
		}, nil)
	})
}
