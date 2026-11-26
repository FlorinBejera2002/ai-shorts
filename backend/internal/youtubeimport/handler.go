package youtubeimport

import (
	"crypto/cipher"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/julienschmidt/httprouter"
	"github.com/lib/pq"
	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/identity"
	"sneepcut/backend-go/internal/locale"
)

const callbackPath = "/v1/youtube/import/callback"
const browserCookie = "youtube_import_oauth"

type Handler struct {
	db       *sql.DB
	auth     *identity.Handler
	media    Media
	previews Previews
	client   *Client
	channel  ChannelVideos
	queue    SelectionJobs
	cfg      Config
	vault    cipher.AEAD
}

func New(db *sql.DB, auth *identity.Handler, media Media, client *Client, cfg Config) (*Handler, error) {
	h := &Handler{db: db, auth: auth, media: media, client: client, cfg: cfg}
	if previews, ok := media.(Previews); ok {
		h.previews = previews
	}
	if cfg.EncryptionKey != "" {
		var err error
		h.vault, err = newVault(cfg.EncryptionKey)
		if err != nil {
			return nil, err
		}
	}
	if cfg.Enabled {
		app, err := url.Parse(cfg.AppURL)
		if err != nil || app.Host == "" || app.User != nil || app.RawQuery != "" || app.Fragment != "" || (app.Scheme != "https" && (cfg.SecureCookies || app.Scheme != "http")) {
			return nil, errors.New("YouTube import requires a valid application origin")
		}
		if client == nil || media == nil || h.vault == nil {
			return nil, errors.New("YouTube import requires Google credentials, media storage and token encryption")
		}
	}
	if h.cfg.MaxImportAge <= 0 {
		h.cfg.MaxImportAge = 48 * time.Hour
	}
	if h.cfg.PollInterval <= 0 {
		h.cfg.PollInterval = time.Minute
	}
	return h, nil
}

func (h *Handler) Register(router *httprouter.Router) {
	router.Handler("GET", "/api/youtube/imports", h.auth.Require(h.overview))
	router.Handler("POST", "/api/youtube/imports/connect", h.auth.RequireMember(h.auth.Limit(h.connect, "youtube:import", 8, time.Hour)))
	router.Handler("POST", "/api/youtube/imports/selection", h.auth.RequireMember(h.auth.Limit(h.selectionImport, "youtube:import:selection", 8, time.Hour)))
	router.HandlerFunc("GET", callbackPath, h.callback)
	router.Handler("DELETE", "/api/youtube/import-videos/:id", h.auth.RequireMember(h.deleteVideo))
	router.Handler("DELETE", "/api/youtube/imports/:id", h.auth.RequireMember(h.disconnect))
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

func (h *Handler) canConnect(r *http.Request) bool {
	return !h.cfg.TestMode || identity.Current(r).User.AccessRole == "admin"
}

func (h *Handler) overview(w http.ResponseWriter, r *http.Request) {
	overview, err := h.loadOverview(r.Context(), identity.Current(r).User.ID)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "YouTube imports are temporarily unavailable.")
		return
	}
	overview.Enabled = h.cfg.Enabled && h.client != nil && h.vault != nil && h.canConnect(r)
	writeJSON(w, http.StatusOK, overview)
}

func (h *Handler) connect(w http.ResponseWriter, r *http.Request) {
	if !h.cfg.Enabled {
		writeError(w, http.StatusServiceUnavailable, "YouTube account import is not available yet.")
		return
	}
	if !h.canConnect(r) {
		writeError(w, http.StatusForbidden, "YouTube account import is currently available only to administrators during testing.")
		return
	}
	var input struct {
		Visibilities []string `json:"visibilities"`
		Consent      bool     `json:"consent"`
		Locale       string   `json:"locale"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16000))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&input) != nil || decoder.Decode(&struct{}{}) != io.EOF {
		writeError(w, http.StatusBadRequest, "Invalid import request.")
		return
	}
	resources, err := requestedResources(input.Visibilities)
	if err != nil || !input.Consent {
		writeError(w, http.StatusBadRequest, "Choose the videos to import and accept the import disclosure.")
		return
	}
	input.Locale = locale.Normalize(input.Locale)
	state, err := randomSecret()
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "Could not start YouTube import.")
		return
	}
	browser, err := randomSecret()
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "Could not start YouTube import.")
		return
	}
	verifier, err := randomSecret()
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "Could not start YouTube import.")
		return
	}
	target, err := h.client.AuthorizationURL(state, verifier, resources)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "Could not start YouTube import.")
		return
	}
	user := identity.Current(r).User
	err = h.createAuthorization(r.Context(), user.ID, user.SessionVersion, resources, state, browser, verifier, input.Locale)
	if errors.Is(err, errActiveImport) {
		writeError(w, http.StatusConflict, "A YouTube import is already in progress.")
		return
	}
	if errors.Is(err, errImportBudget) {
		writeError(w, http.StatusTooManyRequests, "The YouTube import limit was reached. Try later or remove videos from your library.")
		return
	}
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "Could not start YouTube import.")
		return
	}
	http.SetCookie(w, &http.Cookie{Name: browserCookie, Value: browser, Path: callbackPath, HttpOnly: true, Secure: h.cfg.SecureCookies, SameSite: http.SameSiteLaxMode, MaxAge: 600})
	writeJSON(w, http.StatusOK, map[string]string{"url": target})
}

func (h *Handler) callback(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
	uiLocale := locale.English
	redirect := func(result string) {
		http.Redirect(w, r, returnURL(h.cfg.AppURL, uiLocale, result), http.StatusSeeOther)
	}
	if !h.cfg.Enabled || h.client == nil || h.vault == nil {
		redirect("unavailable")
		return
	}
	state, code := r.URL.Query().Get("state"), r.URL.Query().Get("code")
	cookie, err := r.Cookie(browserCookie)
	if err != nil || len(state) != 43 || len(cookie.Value) != 43 || len(code) > 4096 {
		redirect("invalid_state")
		return
	}
	http.SetCookie(w, &http.Cookie{Name: browserCookie, Value: "", Path: callbackPath, HttpOnly: true, Secure: h.cfg.SecureCookies, SameSite: http.SameSiteLaxMode, MaxAge: -1})
	authorization, err := h.consumeAuthorization(r.Context(), state, cookie.Value)
	if err != nil {
		redirect("invalid_state")
		return
	}
	uiLocale = authorization.Locale
	if r.URL.Query().Get("error") != "" || code == "" {
		h.authorizationFailed(r.Context(), authorization.ID, "Authorization was declined. Connect again when you are ready.")
		redirect("denied")
		return
	}
	if !h.authorizationActive(r.Context(), authorization) {
		h.authorizationFailed(r.Context(), authorization.ID, "Sign in again before importing your YouTube videos.")
		redirect("session_expired")
		return
	}
	token, err := h.client.Exchange(r.Context(), code, authorization.Verifier)
	if err != nil {
		h.authorizationFailed(r.Context(), authorization.ID, "Google authorization failed. Check account eligibility and connect again.")
		redirect("authorization_failed")
		return
	}
	granted := GrantedResources(token.Scope, authorization.Resources)
	if len(granted) == 0 {
		_ = h.queueRejectedAuthorization(r.Context(), authorization, token, "No YouTube video access was granted. Connect again and choose at least one video category.")
		redirect("no_video_access")
		return
	}
	if token.RefreshToken == "" {
		_ = h.queueRejectedAuthorization(r.Context(), authorization, token, "Google authorization cannot be kept for the export. Connect again.")
		redirect("authorization_failed")
		return
	}
	encrypted, err := encryptToken(h.vault, token, authorization.UserID+":"+authorization.ID)
	if err == nil {
		err = h.saveAuthorization(r.Context(), authorization, encrypted, granted)
	}
	if err != nil {
		_ = h.queueRejectedAuthorization(r.Context(), authorization, token, "Could not save Google authorization. Connect again.")
		redirect("authorization_failed")
		return
	}
	redirect("success")
}

func routeID(r *http.Request) string {
	return httprouter.ParamsFromContext(r.Context()).ByName("id")
}

func (h *Handler) disconnect(w http.ResponseWriter, r *http.Request) {
	id := routeID(r)
	if !data.ValidUUID(id) {
		writeError(w, http.StatusNotFound, "Import not found.")
		return
	}
	user := identity.Current(r).User.ID
	_, err := h.cancelImport(r.Context(), user, id)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Import not found.")
		return
	}
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "Could not disconnect the import.")
		return
	}
	// The durable cleanup job revokes this grant before another consent can
	// start. A slow revocation must never invalidate a newly connected account.
	writeJSON(w, http.StatusOK, map[string]bool{"disconnected": true, "imported_videos_retained": true})
}

func (h *Handler) deleteVideo(w http.ResponseWriter, r *http.Request) {
	id, user := routeID(r), identity.Current(r).User.ID
	if !data.ValidUUID(id) {
		writeError(w, http.StatusNotFound, "Video not found.")
		return
	}
	sourceKey, previewKey, err := h.tombstoneVideo(r.Context(), user, id)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Video not found.")
		return
	}
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "Could not remove the imported video.")
		return
	}
	if h.media != nil {
		for _, key := range storedKeys(sourceKey, previewKey) {
			if err = h.media.RemoveImportSource(r.Context(), user, key); err != nil {
				if err = h.queueSourceCleanup(r.Context(), user, key); err != nil {
					writeError(w, http.StatusServiceUnavailable, "The video is hidden. Retry removal to finish clearing its files.")
					return
				}
			}
		}
	}
	writeJSON(w, http.StatusOK, map[string]bool{"deleted": true})
}

// storedKeys lists the non-empty object keys of one imported video.
func storedKeys(sourceKey, previewKey string) []string {
	if previewKey == "" {
		return []string{sourceKey}
	}
	return []string{sourceKey, previewKey}
}

func uniqueViolation(err error) bool {
	var pg *pq.Error
	return errors.As(err, &pg) && pg.Code == "23505"
}

func safeTitle(value, fallback string) string {
	value = strings.TrimSpace(strings.Map(func(r rune) rune {
		if r < 32 || r == 127 {
			return -1
		}
		return r
	}, value))
	if value == "" {
		value = fallback
	}
	runes := []rune(value)
	if len(runes) > 300 {
		value = string(runes[:300])
	}
	return value
}
