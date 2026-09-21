package identity

import (
	"net"
	"net/http"
	"slices"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

func (h *Handler) originPolicy(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Add("Vary", "Origin")
		w.Header().Add("Vary", "Access-Control-Request-Method")
		w.Header().Add("Vary", "Access-Control-Request-Headers")
		origin := r.Header.Get("Origin")
		if (origin != "" && !slices.Contains(h.config.AllowedOrigins, origin)) ||
			(origin == "" && r.Header.Get("Sec-Fetch-Site") == "cross-site" && r.Method != http.MethodGet && r.Method != http.MethodHead) {
			h.writeError(w, http.StatusForbidden, "origin is not allowed")
			return
		}
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
		}
		if r.Method == http.MethodOptions {
			method := r.Header.Get("Access-Control-Request-Method")
			if method != "" && !slices.Contains([]string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodHead}, method) {
				h.writeError(w, http.StatusForbidden, "method is not allowed")
				return
			}
			for _, header := range strings.Split(r.Header.Get("Access-Control-Request-Headers"), ",") {
				switch strings.ToLower(strings.TrimSpace(header)) {
				case "", "content-type", "authorization":
				default:
					h.writeError(w, http.StatusForbidden, "header is not allowed")
					return
				}
			}
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		}
		next.ServeHTTP(w, r)
	})
}

type loginClient struct {
	limiter *rate.Limiter
	seen    time.Time
}

type loginLimiter struct {
	mu        sync.Mutex
	clients   map[string]loginClient
	lastSweep time.Time
}

func newLoginLimiter() *loginLimiter {
	return &loginLimiter{clients: make(map[string]loginClient), lastSweep: time.Now()}
}

// This legacy helper remains covered for compatibility. Active application
// handlers use the shared request limiter and trusted-proxy policy in limits.go.
func (l *loginLimiter) allow(remoteAddr string) bool {
	ip, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		return false
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	if now.Sub(l.lastSweep) >= time.Minute {
		for key, client := range l.clients {
			if now.Sub(client.seen) > 15*time.Minute {
				delete(l.clients, key)
			}
		}
		l.lastSweep = now
	}
	client, exists := l.clients[ip]
	if !exists {
		if len(l.clients) >= 10000 {
			return false
		}
		client.limiter = rate.NewLimiter(rate.Every(time.Minute), 5)
	}
	client.seen = now
	l.clients[ip] = client
	return client.limiter.AllowN(now, 1)
}
