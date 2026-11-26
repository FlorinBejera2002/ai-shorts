package youtubechannel

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/julienschmidt/httprouter"
	"sneepcut/backend-go/internal/identity"
	"sneepcut/backend-go/internal/locale"
)

const (
	callbackPath      = "/v1/youtube/channel/callback"
	authorizationName = "youtube_channel_oauth"
	maxSearchRunes    = 100
	maxConnectBody    = 4096
	maxCallbackCode   = 4096
)

// Authenticator is satisfied by *identity.Handler. Keeping it an interface lets
// tests exercise handlers without a session store.
type Authenticator interface {
	Require(http.HandlerFunc) http.Handler
	RequireMember(http.HandlerFunc) http.Handler
	Limit(http.HandlerFunc, string, int, time.Duration) http.HandlerFunc
}

// Handler exposes the channel connection over HTTP.
type Handler struct {
	service *Service
	auth    Authenticator
	cfg     Config
}

func NewHandler(service *Service, auth Authenticator, cfg Config) *Handler {
	return &Handler{service: service, auth: auth, cfg: cfg}
}

// Service exposes the grant service so other features can look up the user's
// own channel uploads, for example when importing selected videos.
func (h *Handler) Service() *Service {
	return h.service
}

func (h *Handler) Register(router *httprouter.Router) {
	router.Handler("GET", "/api/youtube/channel", h.auth.Require(h.status))
	router.Handler("POST", "/api/youtube/channel/connect", h.auth.RequireMember(h.auth.Limit(h.connect, "youtube:channel:connect", 8, time.Hour)))
	router.HandlerFunc("GET", callbackPath, h.callback)
	router.Handler("DELETE", "/api/youtube/channel", h.auth.RequireMember(h.disconnect))
	router.Handler("GET", "/api/youtube/channel/videos", h.auth.Require(h.auth.Limit(h.videos, "youtube:channel:videos", 300, time.Hour)))
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func (h *Handler) status(w http.ResponseWriter, r *http.Request) {
	status, err := h.service.Status(r.Context(), identity.Current(r).User.ID)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "YouTube channel status is temporarily unavailable.")
		return
	}
	writeJSON(w, http.StatusOK, status)
}

func (h *Handler) connect(w http.ResponseWriter, r *http.Request) {
	if !h.service.Enabled() {
		writeError(w, http.StatusServiceUnavailable, "YouTube channel access is not available yet.")
		return
	}
	var input struct {
		Consent bool   `json:"consent"`
		Locale  string `json:"locale"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxConnectBody))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&input) != nil || decoder.Decode(&struct{}{}) != io.EOF || !input.Consent {
		writeError(w, http.StatusBadRequest, "Accept the YouTube access notice to continue.")
		return
	}
	uiLocale := locale.Normalize(input.Locale)
	user := identity.Current(r).User
	allowed, err := h.service.CanConnect(r.Context(), user.ID, user.SessionVersion)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "YouTube channel access is temporarily unavailable.")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "YouTube channel access is not available for this account.")
		return
	}
	target, cookie, err := h.service.BeginAuthorization(user.ID, user.SessionVersion, uiLocale)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "Could not start YouTube access.")
		return
	}
	h.setAuthorizationCookie(w, cookie, int(authorizationTTL.Seconds()))
	writeJSON(w, http.StatusOK, map[string]string{"url": target})
}

func (h *Handler) setAuthorizationCookie(w http.ResponseWriter, value string, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name: authorizationName, Value: value, Path: callbackPath, HttpOnly: true,
		Secure: h.cfg.SecureCookies, SameSite: http.SameSiteLaxMode, MaxAge: maxAge,
	})
}

// callback always redirects back to the Create page. The browser state cookie
// is cleared on every path so it cannot be replayed.
func (h *Handler) callback(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
	cookie, cookieErr := r.Cookie(authorizationName)
	h.setAuthorizationCookie(w, "", -1)
	uiLocale := locale.English
	finish := func(result string) {
		http.Redirect(w, r, returnURL(h.cfg.AppURL, uiLocale, result), http.StatusSeeOther)
	}
	if cookieErr != nil || !h.service.Enabled() {
		finish("error")
		return
	}
	query := r.URL.Query()
	state, err := h.service.OpenAuthorization(cookie.Value, query.Get("state"))
	if err != nil {
		finish("error")
		return
	}
	uiLocale = state.Locale
	code := query.Get("code")
	if query.Get("error") != "" || code == "" || len(code) > maxCallbackCode {
		finish("error")
		return
	}
	if err = h.service.CompleteAuthorization(r.Context(), state, code); err != nil {
		finish("error")
		return
	}
	finish("success")
}

func (h *Handler) disconnect(w http.ResponseWriter, r *http.Request) {
	if err := h.service.Disconnect(r.Context(), identity.Current(r).User.ID); err != nil {
		writeError(w, http.StatusServiceUnavailable, "Could not disconnect YouTube. Try again.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) videos(w http.ResponseWriter, r *http.Request) {
	query, ok := parseVideoQuery(r.URL.Query())
	if !ok {
		writeError(w, http.StatusBadRequest, "Invalid video filter.")
		return
	}
	page, err := h.service.ListVideos(r.Context(), identity.Current(r).User.ID, query)
	switch {
	case errors.Is(err, ErrNotConnected):
		writeError(w, http.StatusConflict, "not_connected")
	case errors.Is(err, ErrNotConfigured):
		writeError(w, http.StatusServiceUnavailable, "YouTube channel access is not available yet.")
	case err != nil:
		writeError(w, http.StatusBadGateway, "YouTube videos are temporarily unavailable. Try again.")
	default:
		writeJSON(w, http.StatusOK, page)
	}
}

func parseVideoQuery(values url.Values) (VideoQuery, bool) {
	search := strings.TrimSpace(values.Get("q"))
	if utf8.RuneCountInString(search) > maxSearchRunes {
		return VideoQuery{}, false
	}
	visibility := values.Get("visibility")
	if visibility == "" {
		visibility = VisibilityAll
	}
	switch visibility {
	case VisibilityAll, VisibilityPublic, VisibilityUnlisted, VisibilityPrivate:
	default:
		return VideoQuery{}, false
	}
	token := values.Get("page_token")
	if !validPageToken(token) {
		return VideoQuery{}, false
	}
	return VideoQuery{Search: search, Visibility: visibility, PageToken: token}, true
}

// returnURL sends the browser back to the Create page with the outcome. Romanian
// and Spanish keep their locale prefix; English uses the default unprefixed route.
func returnURL(appURL, uiLocale, result string) string {
	prefix := locale.PathPrefix(uiLocale)
	return strings.TrimRight(appURL, "/") + prefix + "/dashboard/create?mode=youtube&youtubeChannel=" + result
}
