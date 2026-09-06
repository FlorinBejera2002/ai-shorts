package identity

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net"
	"net/http"
	"net/netip"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

type RequestLimiter interface {
	Allow(context.Context, string, int, time.Duration) (bool, time.Duration, error)
}

type windowCount struct {
	count   int
	expires time.Time
}
type requestLimits struct {
	redis    redis.UniversalClient
	required bool
	mu       sync.Mutex
	entries  map[string]windowCount
}

func NewRequestLimiter(client redis.UniversalClient, required bool) RequestLimiter {
	return &requestLimits{redis: client, required: required, entries: make(map[string]windowCount)}
}

const incrementWindow = `local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]); end; return {n,redis.call('PTTL',KEYS[1])}`

func (l *requestLimits) Allow(ctx context.Context, key string, limit int, window time.Duration) (bool, time.Duration, error) {
	digest := sha256.Sum256([]byte(key))
	key = "sneepcut:go:limit:" + hex.EncodeToString(digest[:])
	if l.redis != nil {
		ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
		defer cancel()
		values, err := l.redis.Eval(ctx, incrementWindow, []string{key}, window.Milliseconds()).Int64Slice()
		if err != nil {
			return false, 0, errors.New("rate limit storage unavailable")
		}
		if len(values) != 2 {
			return false, 0, errors.New("invalid rate limit result")
		}
		return values[0] <= int64(limit), time.Duration(max(values[1], 1)) * time.Millisecond, nil
	}
	if l.required {
		return false, 0, errors.New("shared rate limiting is required")
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	for k, v := range l.entries {
		if !now.Before(v.expires) {
			delete(l.entries, k)
		}
	}
	v, exists := l.entries[key]
	if !exists {
		if len(l.entries) >= 10000 {
			return false, time.Minute, nil
		}
		v.expires = now.Add(window)
	}
	v.count++
	l.entries[key] = v
	return v.count <= limit, v.expires.Sub(now), nil
}

func (h *Handler) SetRequestLimiter(limiter RequestLimiter) { h.limits = limiter }

func (h *Handler) clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return "unknown"
	}
	ip, err := netip.ParseAddr(host)
	if err != nil {
		return "unknown"
	}
	trusted := false
	for _, network := range h.config.TrustedProxies {
		if prefix, err := netip.ParsePrefix(network); err == nil && prefix.Contains(ip) {
			trusted = true
			break
		}
	}
	if !trusted {
		return ip.String()
	}
	// Nginx sets X-Real-IP from its verified socket peer. Never trust a client
	// chain merely because a header exists.
	forwarded, err := netip.ParseAddr(strings.TrimSpace(r.Header.Get("X-Real-IP")))
	if err != nil {
		return ip.String()
	}
	return forwarded.String()
}

func (h *Handler) allowed(w http.ResponseWriter, r *http.Request, key string, limit int, window time.Duration) bool {
	allow, retry, err := h.limits.Allow(r.Context(), key, limit, window)
	if err != nil {
		h.writeError(w, http.StatusServiceUnavailable, "Request limits are temporarily unavailable")
		return false
	}
	if !allow {
		w.Header().Set("Retry-After", strconv.Itoa(max(1, int(retry.Seconds()+1))))
		h.writeError(w, http.StatusTooManyRequests, "Too many requests. Please try again later.")
		return false
	}
	return true
}

func (h *Handler) Limit(next http.HandlerFunc, key string, limit int, window time.Duration) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		principal := Current(r)
		owner := "peer:" + h.clientIP(r)
		if principal.User.ID != "" {
			owner = "user:" + principal.User.ID
		}
		if h.allowed(w, r, key+":"+owner, limit, window) {
			next.ServeHTTP(w, r)
		}
	}
}
