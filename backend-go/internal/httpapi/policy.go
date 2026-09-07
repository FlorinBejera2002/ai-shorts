package httpapi

import (
	"context"
	"net"
	"net/http"
	"sneepcut/backend-go/internal/httpx"
	"strings"
	"time"
)

type PolicyConfig struct{ AllowedHosts []string }

func Policy(next http.Handler, cfg PolicyConfig) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host := r.Host
		if parsed, _, err := net.SplitHostPort(host); err == nil {
			host = parsed
		}
		host = strings.TrimSuffix(strings.ToLower(host), ".")
		valid := false
		for _, allowed := range cfg.AllowedHosts {
			if strings.ToLower(allowed) == host {
				valid = true
				break
			}
		}
		if !valid {
			httpx.Error(w, 400, "Host is not allowed")
			return
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		duration := 20 * time.Second
		readDuration := 15 * time.Second
		if r.URL.Path == "/api/scripts/generate" || r.URL.Path == "/api/assistant/chat" {
			duration = 100 * time.Second
		}
		if r.URL.Path == "/api/upload" || r.URL.Path == "/api/upload/direct" || r.URL.Path == "/api/user/brand/logo" || r.URL.Path == "/api/brand/logo" {
			duration = 10 * time.Minute
			readDuration = 10 * time.Minute
		}
		if r.URL.Path == "/api/user/data" && r.Method == http.MethodDelete {
			duration = 2 * time.Minute
		}
		controller := http.NewResponseController(w)
		_ = controller.SetReadDeadline(time.Now().Add(readDuration))
		_ = controller.SetWriteDeadline(time.Now().Add(duration))
		ctx, cancel := context.WithTimeout(r.Context(), duration)
		defer cancel()
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
