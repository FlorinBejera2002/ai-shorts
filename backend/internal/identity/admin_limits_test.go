package identity

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestAdminUsageLimitUsesCurrentAuthenticatedRole(t *testing.T) {
	repo := &memoryRepository{user: testUser(), sessions: make(map[string]time.Time)}
	repo.user.AccessRole = "admin"
	service := NewService(repo, testTokens(t))
	session, _, _, err := service.Login(context.Background(), repo.user.Email, testPassword)
	if err != nil {
		t.Fatal(err)
	}
	h := NewHandler(service, HTTPConfig{}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	h.SetRequestLimiter(NewRequestLimiter(nil, false))
	endpoint := h.RequireMember(h.Limit(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}, "create", 1, time.Hour))
	request := func(token string) int {
		r := httptest.NewRequest(http.MethodPost, "/feature", nil)
		r.Header.Set("Authorization", "Bearer "+token)
		r.Header.Set("X-Access-Role", "admin")
		w := httptest.NewRecorder()
		endpoint.ServeHTTP(w, r)
		return w.Code
	}
	for range 5 {
		if got := request(session.AccessToken); got != http.StatusNoContent {
			t.Fatalf("admin was limited: %d", got)
		}
	}
	// The same token immediately observes demotion and the normal allowance.
	repo.user.AccessRole = "member"
	if got := request(session.AccessToken); got != http.StatusNoContent {
		t.Fatalf("first member request: %d", got)
	}
	if got := request(session.AccessToken); got != http.StatusTooManyRequests {
		t.Fatalf("member allowance bypassed: %d", got)
	}
	repo.user.AccessRole = "viewer"
	if got := request(session.AccessToken); got != http.StatusForbidden {
		t.Fatalf("viewer gained write access: %d", got)
	}
	repo.user.AccessRole = "admin"
	repo.user.AccountStatus = "suspended"
	if got := request(session.AccessToken); got != http.StatusUnauthorized {
		t.Fatalf("suspended admin accepted: %d", got)
	}
	if got := request(""); got != http.StatusUnauthorized {
		t.Fatalf("anonymous role header accepted: %d", got)
	}
}

type unavailableUsageLimiter struct{}

func TestAdminCredentialProofAttemptsRemainLimited(t *testing.T) {
	h := NewHandler(nil, HTTPConfig{}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	h.SetRequestLimiter(NewRequestLimiter(nil, false))
	endpoint := h.SecurityLimit(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}, "password", 1, time.Hour)
	user := testUser()
	user.AccessRole = "admin"
	for _, want := range []int{http.StatusUnauthorized, http.StatusTooManyRequests} {
		r := httptest.NewRequest(http.MethodPost, "/api/user/password", nil)
		r = r.WithContext(context.WithValue(r.Context(), principalKey{}, AuthResponse{User: user}))
		w := httptest.NewRecorder()
		endpoint.ServeHTTP(w, r)
		if w.Code != want {
			t.Fatalf("credential proof: got %d want %d", w.Code, want)
		}
	}
}

func (unavailableUsageLimiter) Allow(context.Context, string, int, time.Duration) (bool, time.Duration, error) {
	return false, 0, errors.New("limiter unavailable")
}

func TestAdminUsageDoesNotDependOnQuotaStorage(t *testing.T) {
	h := NewHandler(nil, HTTPConfig{}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	h.SetRequestLimiter(unavailableUsageLimiter{})
	endpoint := h.Limit(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) }, "usage", 1, time.Hour)
	for _, role := range []string{"admin", "member", ""} {
		r := httptest.NewRequest(http.MethodGet, "/feature", nil)
		if role != "" {
			user := testUser()
			user.AccessRole = role
			r = r.WithContext(context.WithValue(r.Context(), principalKey{}, AuthResponse{User: user}))
		}
		w := httptest.NewRecorder()
		endpoint.ServeHTTP(w, r)
		want := http.StatusServiceUnavailable
		if role == "admin" {
			want = http.StatusNoContent
		}
		if w.Code != want {
			t.Fatalf("%s: got %d, want %d", role, w.Code, want)
		}
	}
}
