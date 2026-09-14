// Package publishing owns social authorization and durable, user-confirmed posts.
package publishing

import (
	"context"
	"crypto/cipher"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/julienschmidt/httprouter"
	"github.com/lib/pq"
	"sneepcut/backend-go/internal/identity"
)

type Media interface {
	SignedURL(context.Context, string) (string, error)
	KeyFromReference(string) (string, error)
}
type Config struct {
	ProviderConfig
	EncryptionKey string
	Enabled       bool
}
type Handler struct {
	db     *sql.DB
	auth   *identity.Handler
	media  Media
	cfg    Config
	vault  cipher.AEAD
	client *ProviderClient
}

func New(db *sql.DB, auth *identity.Handler, media Media, cfg Config) (*Handler, error) {
	h := &Handler{db: db, auth: auth, media: media, cfg: cfg, client: NewProviderClient(cfg.ProviderConfig)}
	if cfg.EncryptionKey != "" {
		var e error
		h.vault, e = newCipher(cfg.EncryptionKey)
		if e != nil {
			return nil, e
		}
	}
	return h, nil
}
func (h *Handler) configured(provider string) bool {
	return h.cfg.Enabled && h.vault != nil && publicHTTPS(h.cfg.AppURL) && h.client.Configured(provider)
}
func (h *Handler) Register(r *httprouter.Router) {
	r.Handler("GET", "/api/publishing", h.auth.Require(h.overview))
	r.Handler("POST", "/api/publishing/connect/:provider", h.auth.RequireMember(h.auth.Limit(h.connect, "social:connect", 20, time.Hour)))
	r.HandlerFunc("GET", "/api/publishing/callback/:provider", h.callback)
	r.Handler("DELETE", "/api/publishing/accounts/:id", h.auth.RequireMember(h.disconnect))
	r.Handler("GET", "/api/publishing/accounts/:id/options", h.auth.RequireMember(h.options))
	r.Handler("POST", "/api/publishing/posts", h.auth.RequireMember(h.auth.Limit(h.createPosts, "social:posts", 50, time.Hour)))
}
func respond(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func fail(w http.ResponseWriter, status int, s string) {
	respond(w, status, map[string]string{"error": s})
}
func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	d := json.NewDecoder(http.MaxBytesReader(w, r.Body, 20000))
	d.DisallowUnknownFields()
	if d.Decode(v) != nil || d.Decode(&struct{}{}) != io.EOF {
		fail(w, 400, "Invalid request.")
		return false
	}
	return true
}
func param(r *http.Request, key string) string {
	return httprouter.ParamsFromContext(r.Context()).ByName(key)
}
func providerValid(p string) bool {
	return p == "instagram" || p == "facebook" || p == "tiktok" || p == "youtube"
}
func providerScopes(p string) []string {
	switch p {
	case "instagram":
		return []string{"profile", "publish_content"}
	case "facebook":
		return []string{"pages_read", "pages_publish"}
	case "tiktok":
		return []string{"profile", "video_publish"}
	case "youtube":
		return []string{"channel_read"}
	default:
		return []string{}
	}
}
func (h *Handler) overview(w http.ResponseWriter, r *http.Request) {
	providers := []map[string]any{}
	for _, p := range []string{"instagram", "facebook", "tiktok", "youtube"} {
		entry := map[string]any{"id": p, "name": map[string]string{"instagram": "Instagram", "facebook": "Facebook", "tiktok": "TikTok", "youtube": "YouTube"}[p], "configured": h.configured(p), "supportsPublishing": p != "youtube"}
		if !h.configured(p) {
			entry["reason"] = "Developer setup and a public HTTPS address are required."
		}
		providers = append(providers, entry)
	}
	accounts, clips, posts, e := h.list(r.Context(), identity.Current(r).User.ID)
	if e != nil {
		fail(w, 503, "Publishing is temporarily unavailable. Apply the latest database migration.")
		return
	}
	respond(w, 200, map[string]any{"providers": providers, "accounts": accounts, "clips": clips, "posts": posts})
}
func (h *Handler) connect(w http.ResponseWriter, r *http.Request) {
	p := param(r, "provider")
	if !providerValid(p) {
		fail(w, 404, "Unknown provider.")
		return
	}
	if !h.configured(p) {
		fail(w, 503, "This provider requires developer setup.")
		return
	}
	var input struct {
		Locale string `json:"locale"`
	}
	if !decode(w, r, &input) {
		return
	}
	if input.Locale != "ro" {
		input.Locale = "en"
	}
	state, browser, verifier := randomToken(), randomToken(), randomToken()
	user := identity.Current(r).User
	target, e := h.client.Authorize(p, state, verifier)
	if e != nil {
		fail(w, 503, "Provider unavailable.")
		return
	}
	_, e = h.db.ExecContext(r.Context(), `INSERT INTO social_oauth_states(state_hash,user_id,provider,browser_hash,verifier,locale,session_version,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '10 minutes')`, digest(state), user.ID, p, digest(browser), verifier, input.Locale, user.SessionVersion)
	if e != nil {
		fail(w, 503, "Could not start connection.")
		return
	}
	http.SetCookie(w, &http.Cookie{Name: "social_oauth_" + p, Value: browser, Path: "/api/publishing/callback/" + p, HttpOnly: true, Secure: true, SameSite: http.SameSiteLaxMode, MaxAge: 600})
	respond(w, 200, map[string]string{"url": target})
}
func (h *Handler) callback(w http.ResponseWriter, r *http.Request) {
	p := param(r, "provider")
	locale := "en"
	redirect := func(key, value string) {
		http.Redirect(w, r, strings.TrimRight(h.cfg.AppURL, "/")+"/"+locale+"/dashboard/publish?"+key+"="+value, http.StatusSeeOther)
	}
	if !providerValid(p) || !h.configured(p) {
		redirect("connectionError", "unavailable")
		return
	}
	cookie, e := r.Cookie("social_oauth_" + p)
	if e != nil || len(r.URL.Query().Get("state")) > 100 {
		redirect("connectionError", "invalid_state")
		return
	}
	http.SetCookie(w, &http.Cookie{Name: "social_oauth_" + p, Value: "", Path: "/api/publishing/callback/" + p, HttpOnly: true, Secure: true, SameSite: http.SameSiteLaxMode, MaxAge: -1})
	var user, verifier string
	var version int
	e = h.db.QueryRowContext(r.Context(), `DELETE FROM social_oauth_states WHERE state_hash=$1 AND provider=$2 AND browser_hash=$3 AND expires_at>now() RETURNING user_id,verifier,locale,session_version`, digest(r.URL.Query().Get("state")), p, digest(cookie.Value)).Scan(&user, &verifier, &locale, &version)
	if e != nil {
		redirect("connectionError", "invalid_state")
		return
	}
	if r.URL.Query().Get("error") != "" || r.URL.Query().Get("code") == "" {
		redirect("connectionError", "denied")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()
	tx, e := h.db.BeginTx(ctx, nil)
	if e != nil {
		redirect("connectionError", "unavailable")
		return
	}
	defer tx.Rollback()
	var active bool
	e = tx.QueryRowContext(ctx, `SELECT session_version=$2 AND NOT EXISTS(SELECT 1 FROM account_deletion_requests d WHERE d.user_id=u.id) FROM users u WHERE id=$1 FOR UPDATE`, user, version).Scan(&active)
	if e != nil || !active {
		redirect("connectionError", "session_expired")
		return
	}
	accounts, e := h.client.Exchange(ctx, p, r.URL.Query().Get("code"), verifier)
	if e != nil || len(accounts) == 0 {
		redirect("connectionError", "authorization_failed")
		return
	}
	for _, a := range accounts {
		encrypted, err := seal(h.vault, a.Credentials, user+":"+p+":"+a.ID)
		if err != nil {
			redirect("connectionError", "unavailable")
			return
		}
		var expiresAt any
		if !a.Credentials.ExpiresAt.IsZero() {
			expiresAt = a.Credentials.ExpiresAt
		}
		_, e = tx.ExecContext(ctx, `INSERT INTO social_accounts(id,user_id,provider,remote_id,name,username,credentials,scopes,token_expires_at) VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(user_id,provider,remote_id) DO UPDATE SET name=excluded.name,username=excluded.username,credentials=excluded.credentials,scopes=excluded.scopes,token_expires_at=excluded.token_expires_at,status='connected',updated_at=now()`, user, p, a.ID, a.Name, a.Username, encrypted, pq.Array(providerScopes(p)), expiresAt)
		if e != nil {
			redirect("connectionError", "unavailable")
			return
		}
	}
	if tx.Commit() != nil {
		redirect("connectionError", "unavailable")
		return
	}
	redirect("connected", p)
}
func (h *Handler) options(w http.ResponseWriter, r *http.Request) {
	a, e := h.account(r.Context(), identity.Current(r).User.ID, param(r, "id"))
	if e != nil {
		fail(w, 404, "Account not found.")
		return
	}
	if a.Provider != "tiktok" {
		fail(w, 400, "Options are only available for TikTok.")
		return
	}
	if !h.configured(a.Provider) {
		fail(w, 503, "Provider unavailable.")
		return
	}
	creds, e := h.liveCredentials(r.Context(), a)
	if e != nil {
		fail(w, 409, "Reconnect this account.")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	options, e := h.client.Options(ctx, creds)
	if e != nil {
		fail(w, 409, "Could not load TikTok settings. Reconnect and try again.")
		return
	}
	respond(w, 200, options)
}
func (h *Handler) disconnect(w http.ResponseWriter, r *http.Request) {
	user, id := identity.Current(r).User.ID, param(r, "id")
	tx, e := h.db.BeginTx(r.Context(), nil)
	if e != nil {
		fail(w, 503, "Could not disconnect.")
		return
	}
	defer tx.Rollback()
	// The account row lock fences the worker while local access is revoked.
	var provider, remote, encrypted string
	e = tx.QueryRowContext(r.Context(), `SELECT provider,remote_id,credentials FROM social_accounts WHERE id=$1 AND user_id=$2 FOR UPDATE`, id, user).Scan(&provider, &remote, &encrypted)
	if e != nil {
		fail(w, 404, "Account not found.")
		return
	}
	_, e = tx.ExecContext(r.Context(), `UPDATE social_accounts SET credentials='',status='disconnected',updated_at=now() WHERE id=$1`, id)
	if e == nil {
		_, e = tx.ExecContext(r.Context(), `UPDATE social_posts SET status='cancelled',error='Account disconnected.',updated_at=now() WHERE account_id=$1 AND status IN ('queued','processing')`, id)
	}
	if e == nil {
		_, e = tx.ExecContext(r.Context(), `DELETE FROM social_oauth_states WHERE user_id=$1 AND provider=$2`, user, provider)
	}
	if e != nil {
		fail(w, 503, "Could not disconnect.")
		return
	}
	// Local permission removal always succeeds independently of a provider outage.
	// Facebook Page tokens cannot revoke an entire user's application grant safely.
	revoked := false
	if provider != "facebook" && h.vault != nil {
		var credentials Credentials
		if unseal(h.vault, encrypted, user+":"+provider+":"+remote, &credentials) == nil {
			ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
			revoked = h.client.Revoke(ctx, provider, credentials) == nil
			cancel()
		}
	}
	if tx.Commit() != nil {
		fail(w, 503, "Could not disconnect.")
		return
	}
	respond(w, 200, map[string]bool{"disconnected": true, "providerRevoked": revoked})
}

var errInvalid = errors.New("invalid publishing request")
