package account

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/julienschmidt/httprouter"
	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/identity"
)

type Preferences struct {
	Locale             string `json:"locale"`
	Theme              string `json:"theme"`
	Timezone           string `json:"timezone"`
	DefaultAspectRatio string `json:"defaultAspectRatio"`
	DefaultClipCount   int    `json:"defaultClipCount"`
	EmailSecurity      bool   `json:"emailSecurity"`
	EmailProduct       bool   `json:"emailProduct"`
	EmailMarketing     bool   `json:"emailMarketing"`
	InAppProcessing    bool   `json:"inAppProcessing"`
	InAppPublishing    bool   `json:"inAppPublishing"`
}

func defaultPreferences() Preferences {
	return Preferences{Locale: "en", Theme: "system", Timezone: "UTC", DefaultAspectRatio: "9:16", DefaultClipCount: 3, EmailSecurity: true, EmailProduct: true, InAppProcessing: true, InAppPublishing: true}
}

func (p Preferences) valid() bool {
	if p.Locale != "en" && p.Locale != "ro" || p.Theme != "light" && p.Theme != "dark" && p.Theme != "system" || p.DefaultAspectRatio != "9:16" && p.DefaultAspectRatio != "1:1" && p.DefaultAspectRatio != "16:9" || p.DefaultClipCount < 1 || p.DefaultClipCount > 10 || len(p.Timezone) == 0 || len(p.Timezone) > 64 {
		return false
	}
	_, err := time.LoadLocation(p.Timezone)
	return err == nil
}

func (h *Handler) registerSettings(r *httprouter.Router) {
	r.Handler(http.MethodGet, "/api/user/settings", h.auth.Require(h.settings))
	r.Handler(http.MethodPut, "/api/user/preferences", h.auth.Require(h.auth.Limit(h.updatePreferences, "account-preferences", 30, time.Hour)))
	r.Handler(http.MethodDelete, "/api/user/sessions/:id", h.auth.RequireRecent(h.revokeSession))
	r.Handler(http.MethodPost, "/api/user/sessions/revoke-others", h.auth.RequireRecent(h.revokeOtherSessions))
	if h.mfa != nil {
		r.Handler(http.MethodPost, "/api/user/mfa/setup", h.auth.RequireRecent(h.beginMFA))
		r.Handler(http.MethodPost, "/api/user/mfa/enable", h.auth.RequireRecent(h.enableMFA))
		r.Handler(http.MethodPost, "/api/user/mfa/disable", h.auth.RequireRecent(h.disableMFA))
		r.Handler(http.MethodPost, "/api/user/mfa/recovery-codes", h.auth.RequireRecent(h.recoveryCodes))
	}
}

func (h *Handler) readPreferences(r *http.Request, userID string) (Preferences, error) {
	p := defaultPreferences()
	err := h.db.QueryRowContext(r.Context(), `SELECT locale,theme,timezone,default_aspect_ratio,default_clip_count,email_security,email_product,email_marketing,in_app_processing,in_app_publishing FROM account_preferences WHERE user_id=$1`, userID).Scan(&p.Locale, &p.Theme, &p.Timezone, &p.DefaultAspectRatio, &p.DefaultClipCount, &p.EmailSecurity, &p.EmailProduct, &p.EmailMarketing, &p.InAppProcessing, &p.InAppPublishing)
	if errors.Is(err, sql.ErrNoRows) {
		return p, nil
	}
	return p, err
}

func deviceLabel(userAgent string) string {
	lower := strings.ToLower(userAgent)
	browser := "Browser"
	switch {
	case strings.Contains(lower, "edg/"):
		browser = "Edge"
	case strings.Contains(lower, "chrome/"):
		browser = "Chrome"
	case strings.Contains(lower, "firefox/"):
		browser = "Firefox"
	case strings.Contains(lower, "safari/"):
		browser = "Safari"
	}
	platform := "Unknown device"
	switch {
	case strings.Contains(lower, "windows"):
		platform = "Windows"
	case strings.Contains(lower, "iphone") || strings.Contains(lower, "ipad"):
		platform = "iOS"
	case strings.Contains(lower, "android"):
		platform = "Android"
	case strings.Contains(lower, "mac os") || strings.Contains(lower, "macintosh"):
		platform = "macOS"
	case strings.Contains(lower, "linux"):
		platform = "Linux"
	}
	return browser + " on " + platform
}

func (h *Handler) settings(w http.ResponseWriter, r *http.Request) {
	principal := identity.Current(r)
	prefs, err := h.readPreferences(r, principal.User.ID)
	if err != nil {
		fail(w, err)
		return
	}
	sessions := []map[string]any{}
	rows, err := h.db.QueryContext(r.Context(), `SELECT id,session_token,created_at,last_seen_at,expires,user_agent FROM sessions WHERE user_id=$1 AND expires>now() ORDER BY last_seen_at DESC LIMIT 25`, principal.User.ID)
	if err != nil {
		fail(w, err)
		return
	}
	for rows.Next() {
		var id, token, userAgent string
		var created, seen, expires time.Time
		if err = rows.Scan(&id, &token, &created, &seen, &expires, &userAgent); err != nil {
			break
		}
		sessions = append(sessions, map[string]any{"id": id, "device": deviceLabel(userAgent), "createdAt": created, "lastSeenAt": seen, "expiresAt": expires, "current": token == "go-jwt:"+principal.SessionID})
	}
	if closeErr := rows.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		fail(w, err)
		return
	}
	events := []map[string]any{}
	rows, err = h.db.QueryContext(r.Context(), `SELECT id,event_type,detail,created_at FROM account_security_events WHERE user_id=$1 ORDER BY created_at DESC LIMIT 25`, principal.User.ID)
	if err != nil {
		fail(w, err)
		return
	}
	for rows.Next() {
		var id, kind, detail string
		var created time.Time
		if err = rows.Scan(&id, &kind, &detail, &created); err != nil {
			break
		}
		events = append(events, map[string]any{"id": id, "type": kind, "detail": detail, "createdAt": created})
	}
	_ = rows.Close()
	if err != nil {
		fail(w, err)
		return
	}
	exports := []map[string]any{}
	rows, err = h.db.QueryContext(r.Context(), `SELECT id,status,requested_at,completed_at FROM account_data_exports WHERE user_id=$1 ORDER BY requested_at DESC LIMIT 10`, principal.User.ID)
	if err != nil {
		fail(w, err)
		return
	}
	for rows.Next() {
		var id, status string
		var requested time.Time
		var completed sql.NullTime
		if err = rows.Scan(&id, &status, &requested, &completed); err != nil {
			break
		}
		entry := map[string]any{"id": id, "status": status, "requestedAt": requested}
		if completed.Valid {
			entry["completedAt"] = completed.Time
		}
		exports = append(exports, entry)
	}
	_ = rows.Close()
	if err != nil {
		fail(w, err)
		return
	}
	write(w, http.StatusOK, map[string]any{"preferences": prefs, "sessions": sessions, "mfa": map[string]any{"enabled": principal.User.MFAEnabled}, "securityEvents": events, "exports": exports})
}

func (h *Handler) updatePreferences(w http.ResponseWriter, r *http.Request) {
	var input Preferences
	if !read(w, r, &input) {
		return
	}
	if !input.valid() {
		fail(w, &apiError{Status: 400, Message: "Preferences are invalid"})
		return
	}
	userID := identity.Current(r).User.ID
	_, err := h.db.ExecContext(r.Context(), `INSERT INTO account_preferences(user_id,locale,theme,timezone,default_aspect_ratio,default_clip_count,email_security,email_product,email_marketing,in_app_processing,in_app_publishing,updated_at)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now()) ON CONFLICT(user_id) DO UPDATE SET locale=excluded.locale,theme=excluded.theme,timezone=excluded.timezone,default_aspect_ratio=excluded.default_aspect_ratio,default_clip_count=excluded.default_clip_count,email_security=excluded.email_security,email_product=excluded.email_product,email_marketing=excluded.email_marketing,in_app_processing=excluded.in_app_processing,in_app_publishing=excluded.in_app_publishing,updated_at=now()`, userID, input.Locale, input.Theme, input.Timezone, input.DefaultAspectRatio, input.DefaultClipCount, input.EmailSecurity, input.EmailProduct, input.EmailMarketing, input.InAppProcessing, input.InAppPublishing)
	if err != nil {
		fail(w, err)
		return
	}
	write(w, http.StatusOK, map[string]any{"preferences": input})
}

func (h *Handler) revokeSession(w http.ResponseWriter, r *http.Request) {
	principal := identity.Current(r)
	id := httprouter.ParamsFromContext(r.Context()).ByName("id")
	if !data.ValidUUID(id) {
		fail(w, &apiError{Status: 404, Message: "Session not found"})
		return
	}
	result, err := h.db.ExecContext(r.Context(), `DELETE FROM sessions WHERE id=$1 AND user_id=$2`, id, principal.User.ID)
	if err != nil {
		fail(w, err)
		return
	}
	count, _ := result.RowsAffected()
	if count != 1 {
		fail(w, &apiError{Status: 404, Message: "Session not found"})
		return
	}
	_, _ = h.db.ExecContext(r.Context(), `INSERT INTO account_security_events(user_id,event_type,detail) VALUES($1,'session_revoked','A signed-in device was revoked')`, principal.User.ID)
	write(w, http.StatusOK, map[string]any{"revoked": true})
}

func (h *Handler) revokeOtherSessions(w http.ResponseWriter, r *http.Request) {
	principal := identity.Current(r)
	result, err := h.db.ExecContext(r.Context(), `DELETE FROM sessions WHERE user_id=$1 AND session_token<>$2`, principal.User.ID, "go-jwt:"+principal.SessionID)
	if err != nil {
		fail(w, err)
		return
	}
	count, _ := result.RowsAffected()
	_, _ = h.db.ExecContext(r.Context(), `INSERT INTO account_security_events(user_id,event_type,detail) VALUES($1,'sessions_revoked','Other signed-in devices were revoked')`, principal.User.ID)
	write(w, http.StatusOK, map[string]any{"revoked": count})
}

func (h *Handler) beginMFA(w http.ResponseWriter, r *http.Request) {
	setup, err := h.mfa.BeginMFA(r.Context(), identity.Current(r).User)
	if err != nil {
		fail(w, err)
		return
	}
	write(w, http.StatusOK, map[string]any{"setup": setup})
}

func secondFactorInput(w http.ResponseWriter, r *http.Request) (string, bool) {
	var input struct {
		Code string `json:"code"`
	}
	if !read(w, r, &input) || len(input.Code) > 64 {
		return "", false
	}
	return input.Code, true
}

func (h *Handler) enableMFA(w http.ResponseWriter, r *http.Request) {
	code, ok := secondFactorInput(w, r)
	if !ok {
		return
	}
	p := identity.Current(r)
	codes, err := h.mfa.EnableMFA(r.Context(), p.User.ID, p.SessionID, code)
	if err != nil {
		fail(w, err)
		return
	}
	write(w, http.StatusOK, map[string]any{"enabled": true, "recoveryCodes": codes})
}

func (h *Handler) disableMFA(w http.ResponseWriter, r *http.Request) {
	code, ok := secondFactorInput(w, r)
	if !ok {
		return
	}
	if err := h.mfa.DisableMFA(r.Context(), identity.Current(r).User.ID, code); err != nil {
		fail(w, err)
		return
	}
	write(w, http.StatusOK, map[string]any{"enabled": false})
}

func (h *Handler) recoveryCodes(w http.ResponseWriter, r *http.Request) {
	code, ok := secondFactorInput(w, r)
	if !ok {
		return
	}
	codes, err := h.mfa.RegenerateRecoveryCodes(r.Context(), identity.Current(r).User.ID, code)
	if err != nil {
		fail(w, err)
		return
	}
	write(w, http.StatusOK, map[string]any{"recoveryCodes": codes})
}
