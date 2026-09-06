package identity

import (
	"errors"
	"log/slog"
	"mime"
	"net/http"
	"strings"
	"time"

	"github.com/julienschmidt/httprouter"

	"sneepcut/backend-go/internal/jsonutil"
)

const refreshCookieName = "refreshToken"

type HTTPConfig struct {
	SecureCookies  bool
	AllowedOrigins []string
	TrustedProxies []string
}

type Handler struct {
	service  *Service
	config   HTTPConfig
	logger   *slog.Logger
	limiter  *loginLimiter
	limits   RequestLimiter
	accounts *Accounts
	google   *Google
}

func NewHandler(service *Service, cfg HTTPConfig, logger *slog.Logger) *Handler {
	return &Handler{service: service, config: cfg, logger: logger, limiter: newLoginLimiter(), limits: NewRequestLimiter(nil, false)}
}

func (h *Handler) Register(router *httprouter.Router) {
	h.registerAccounts(router)
	h.registerGoogle(router)
	for path, method := range map[string]string{
		"/v1/auth/login": http.MethodPost, "/v1/auth/refresh": http.MethodPost,
		"/v1/auth/logout": http.MethodPost, "/v1/auth/me": http.MethodGet,
	} {
		var handler http.HandlerFunc
		switch path {
		case "/v1/auth/login":
			handler = h.login
		case "/v1/auth/refresh":
			handler = h.refresh
		case "/v1/auth/logout":
			handler = h.logout
		case "/v1/auth/me":
			handler = h.me
		}
		router.Handler(method, path, h.originPolicy(handler))
		router.Handler(http.MethodOptions, path, h.originPolicy(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusNoContent)
		})))
	}
}

func (h *Handler) login(w http.ResponseWriter, r *http.Request) {
	if !h.allowed(w, r, "login:peer:"+h.clientIP(r), 30, 15*time.Minute) {
		return
	}
	contentType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || contentType != "application/json" {
		h.writeError(w, http.StatusUnsupportedMediaType, "Content-Type must be application/json")
		return
	}
	var input struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16*1024)
	if err := jsonutil.Read(w, r, &input); err != nil {
		h.writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if !h.allowed(w, r, "login:email:"+strings.ToLower(strings.TrimSpace(input.Email)), 10, 15*time.Minute) {
		return
	}
	response, refresh, expires, err := h.service.Login(r.Context(), input.Email, input.Password)
	if err != nil {
		h.authError(w, err)
		return
	}
	h.setRefreshCookie(w, refresh, expires, 0)
	h.write(w, http.StatusCreated, jsonutil.Envelope{
		"access_token": response.AccessToken, "user": response.User,
		"authenticated_at": response.AuthenticatedAt,
	})
}

func cookieToken(r *http.Request) string {
	cookie, err := r.Cookie(refreshCookieName)
	if err != nil {
		return ""
	}
	return cookie.Value
}

func (h *Handler) refresh(w http.ResponseWriter, r *http.Request) {
	response, err := h.service.Refresh(r.Context(), cookieToken(r))
	if err != nil {
		if errors.Is(err, ErrUnauthenticated) {
			h.clearRefreshCookie(w)
		}
		h.authError(w, err)
		return
	}
	h.write(w, http.StatusOK, jsonutil.Envelope{
		"access_token": response.AccessToken, "user": response.User,
		"authenticated_at": response.AuthenticatedAt,
	})
}

func (h *Handler) logout(w http.ResponseWriter, r *http.Request) {
	if err := h.service.Logout(r.Context(), cookieToken(r)); err != nil {
		// Keep the cookie on an outage so logout can be retried and revoked.
		h.authError(w, err)
		return
	}
	h.clearRefreshCookie(w)
	h.write(w, http.StatusOK, nil)
}

func (h *Handler) me(w http.ResponseWriter, r *http.Request) {
	scheme, token, found := strings.Cut(r.Header.Get("Authorization"), " ")
	if !found || !strings.EqualFold(scheme, "Bearer") || strings.ContainsAny(token, " \t\r\n") {
		h.authError(w, ErrUnauthenticated)
		return
	}
	response, err := h.service.currentUserForDeletion(r.Context(), token)
	if err != nil {
		h.authError(w, err)
		return
	}
	h.write(w, http.StatusOK, jsonutil.Envelope{"user": response.User, "authenticated_at": response.AuthenticatedAt})
}

func (h *Handler) setRefreshCookie(w http.ResponseWriter, token string, expires time.Time, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name: refreshCookieName, Value: token, Path: "/v1/auth",
		HttpOnly: true, Secure: h.config.SecureCookies, SameSite: http.SameSiteStrictMode,
		Expires: expires, MaxAge: maxAge,
	})
}

func (h *Handler) clearRefreshCookie(w http.ResponseWriter) {
	h.setRefreshCookie(w, "", time.Unix(1, 0), -1)
}

func (h *Handler) authError(w http.ResponseWriter, err error) {
	if errors.Is(err, ErrUnauthenticated) {
		w.Header().Set("WWW-Authenticate", "Bearer")
		h.writeError(w, http.StatusUnauthorized, "invalid authentication credentials")
		return
	}
	// Driver/provider error strings can include connection data. Log only the
	// operation until structured redaction is introduced for external failures.
	h.logger.Error("authentication storage operation failed")
	h.writeError(w, http.StatusServiceUnavailable, "authentication is temporarily unavailable")
}

func (h *Handler) writeError(w http.ResponseWriter, status int, message string) {
	h.write(w, status, jsonutil.Envelope{"error": message})
}

func (h *Handler) write(w http.ResponseWriter, status int, body jsonutil.Envelope) {
	if err := jsonutil.Write(w, status, body, nil); err != nil {
		h.logger.Error("writing authentication response failed")
	}
}
