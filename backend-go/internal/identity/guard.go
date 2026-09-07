package identity

import (
	"context"
	"net/http"
	"strings"
	"time"
)

type principalKey struct{}

// Current is populated by Require and its variants. Features never accept a
// browser-supplied user ID as authentication.
func Current(r *http.Request) AuthResponse {
	principal, _ := r.Context().Value(principalKey{}).(AuthResponse)
	return principal
}

func bearer(r *http.Request) string {
	scheme, token, found := strings.Cut(r.Header.Get("Authorization"), " ")
	if !found || !strings.EqualFold(scheme, "Bearer") || strings.ContainsAny(token, " \t\r\n") {
		return ""
	}
	return token
}

func (h *Handler) require(next http.HandlerFunc, member, recent, allowDeletion bool) http.Handler {
	return h.originPolicy(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var principal AuthResponse
		var err error
		if allowDeletion {
			principal, err = h.service.currentUserForDeletion(r.Context(), bearer(r))
		} else {
			principal, err = h.service.CurrentUser(r.Context(), bearer(r))
		}
		if err != nil {
			h.authError(w, err)
			return
		}
		if member && principal.User.AccessRole != "member" {
			h.writeError(w, http.StatusForbidden, "This account has read-only access")
			return
		}
		now := h.service.tokens.now().Unix()
		if recent && (principal.AuthenticatedAt > now || now-principal.AuthenticatedAt > int64((10*time.Minute).Seconds())) {
			h.write(w, http.StatusForbidden, map[string]any{"error": "reauthentication_required", "message": "Sign in again to continue"})
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), principalKey{}, principal)))
	}))
}

func (h *Handler) Require(next http.HandlerFunc) http.Handler {
	return h.require(next, false, false, false)
}
func (h *Handler) RequireMember(next http.HandlerFunc) http.Handler {
	return h.require(next, true, false, false)
}
func (h *Handler) RequireRecent(next http.HandlerFunc) http.Handler {
	return h.require(next, false, true, false)
}

// Account deletion needs a valid recent session even after its durable marker
// blocks ordinary access, so a failed billing/media step can be retried.
func (h *Handler) RequireForDeletion(next http.HandlerFunc) http.Handler {
	return h.require(next, false, true, true)
}

// RequireDeletionAuth permits the account service to select the proof required
// by the existing account: password for credentials or recent OAuth login.
func (h *Handler) RequireDeletionAuth(next http.HandlerFunc) http.Handler {
	return h.require(next, false, false, true)
}
func (h *Handler) Policy(next http.Handler) http.Handler { return h.originPolicy(next) }
