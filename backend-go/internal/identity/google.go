package identity

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"github.com/julienschmidt/httprouter"
	"sneepcut/backend-go/internal/data"
)

type GoogleConfig struct{ ClientID, ClientSecret, RedirectURL, AppURL string }
type Google struct {
	config                                  GoogleConfig
	client                                  *http.Client
	authorizationURL, tokenURL, userInfoURL string
}

func NewGoogle(cfg GoogleConfig) *Google {
	return &Google{config: cfg, client: &http.Client{Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}, authorizationURL: "https://accounts.google.com/o/oauth2/v2/auth", tokenURL: "https://oauth2.googleapis.com/token", userInfoURL: "https://openidconnect.googleapis.com/v1/userinfo"}
}
func (h *Handler) SetGoogle(google *Google) { h.google = google }

type oauthState struct {
	State, Verifier, ReturnTo string
	Expires                   int64
}

const googleCookieName = "goGoogleState"

func (h *Handler) registerGoogle(router *httprouter.Router) {
	if h.google == nil || h.accounts == nil {
		return
	}
	router.Handler(http.MethodGet, "/v1/auth/google", h.Limit(h.googleStart, "google-start", 30, time.Hour))
	router.Handler(http.MethodGet, "/v1/auth/google/callback", h.Limit(h.googleCallback, "google-callback", 30, time.Hour))
}
func safeReturnPath(raw string) string {
	if len(raw) > 2048 || strings.ContainsAny(raw, "\\\r\n") || strings.HasPrefix(raw, "//") {
		return "/dashboard"
	}
	u, err := url.Parse(raw)
	if err != nil || u.IsAbs() || u.Host != "" || u.User != nil || strings.ContainsAny(u.Path, "\\\r\n") {
		return "/dashboard"
	}
	u.Path = path.Clean(u.Path)
	u.RawPath = ""
	if u.Path != "/dashboard" && !strings.HasPrefix(u.Path, "/dashboard/") && u.Path != "/ro/dashboard" && !strings.HasPrefix(u.Path, "/ro/dashboard/") {
		return "/dashboard"
	}
	return u.RequestURI()
}
func (h *Handler) signState(state oauthState) (string, error) {
	raw, err := json.Marshal(state)
	if err != nil {
		return "", err
	}
	encoded := base64.RawURLEncoding.EncodeToString(raw)
	mac := hmac.New(sha256.New, []byte(h.service.tokens.config.Secret))
	mac.Write([]byte("google-state:" + encoded))
	return encoded + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}
func (h *Handler) readState(raw string) (oauthState, error) {
	var state oauthState
	if len(raw) > 8192 {
		return state, ErrUnauthenticated
	}
	payload, signature, ok := strings.Cut(raw, ".")
	if !ok {
		return state, ErrUnauthenticated
	}
	sig, err := base64.RawURLEncoding.DecodeString(signature)
	if err != nil {
		return state, ErrUnauthenticated
	}
	mac := hmac.New(sha256.New, []byte(h.service.tokens.config.Secret))
	mac.Write([]byte("google-state:" + payload))
	if !hmac.Equal(sig, mac.Sum(nil)) {
		return state, ErrUnauthenticated
	}
	decoded, err := base64.RawURLEncoding.DecodeString(payload)
	if err != nil {
		return state, ErrUnauthenticated
	}
	if json.Unmarshal(decoded, &state) != nil || state.Expires <= time.Now().Unix() || !sessionPattern.MatchString(state.State) || !sessionPattern.MatchString(state.Verifier) {
		return state, ErrUnauthenticated
	}
	return state, nil
}
func (h *Handler) stateCookie(w http.ResponseWriter, value string, age int) {
	http.SetCookie(w, &http.Cookie{Name: googleCookieName, Value: value, Path: "/v1/auth/google", HttpOnly: true, Secure: h.config.SecureCookies, SameSite: http.SameSiteLaxMode, MaxAge: age})
}
func (h *Handler) googleStart(w http.ResponseWriter, r *http.Request) {
	g := h.google
	if g.config.ClientID == "" || g.config.ClientSecret == "" || g.config.RedirectURL == "" {
		h.writeError(w, 503, "Google sign-in is not configured")
		return
	}
	state, err := randomToken()
	if err != nil {
		h.authError(w, err)
		return
	}
	verifier, err := randomToken()
	if err != nil {
		h.authError(w, err)
		return
	}
	expires := time.Now().Add(10 * time.Minute)
	_, err = h.accounts.db.ExecContext(r.Context(), `INSERT INTO verification_tokens(identifier,token,expires) VALUES ('google-oauth-state',$1,$2)`, tokenDigest(state), expires)
	if err != nil {
		h.authError(w, err)
		return
	}
	cookie, err := h.signState(oauthState{State: state, Verifier: verifier, ReturnTo: safeReturnPath(r.URL.Query().Get("returnTo")), Expires: expires.Unix()})
	if err != nil {
		h.authError(w, err)
		return
	}
	h.stateCookie(w, cookie, 600)
	challenge := sha256.Sum256([]byte(verifier))
	values := url.Values{"client_id": {g.config.ClientID}, "redirect_uri": {g.config.RedirectURL}, "response_type": {"code"}, "scope": {"openid email profile"}, "state": {state}, "code_challenge": {base64.RawURLEncoding.EncodeToString(challenge[:])}, "code_challenge_method": {"S256"}, "prompt": {"select_account"}}
	if r.URL.Query().Get("locale") == "ro" {
		values.Set("hl", "ro")
	}
	http.Redirect(w, r, g.authorizationURL+"?"+values.Encode(), http.StatusSeeOther)
}
func (h *Handler) googleFailure(w http.ResponseWriter, r *http.Request, reason string) {
	u, _ := url.Parse(h.google.config.AppURL)
	u.Path = "/login"
	u.RawQuery = url.Values{"error": {reason}}.Encode()
	http.Redirect(w, r, u.String(), http.StatusSeeOther)
}
func (h *Handler) googleCallback(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(googleCookieName)
	h.stateCookie(w, "", -1)
	if err != nil {
		h.googleFailure(w, r, "oauth_state")
		return
	}
	state, err := h.readState(cookie.Value)
	if err != nil || !hmac.Equal([]byte(state.State), []byte(r.URL.Query().Get("state"))) {
		h.googleFailure(w, r, "oauth_state")
		return
	}
	result, err := h.accounts.db.ExecContext(r.Context(), `DELETE FROM verification_tokens WHERE identifier='google-oauth-state' AND token=$1 AND expires>now()`, tokenDigest(state.State))
	if err != nil {
		h.googleFailure(w, r, "oauth_unavailable")
		return
	}
	count, err := result.RowsAffected()
	if err != nil || count != 1 {
		h.googleFailure(w, r, "oauth_state")
		return
	}
	code := r.URL.Query().Get("code")
	if code == "" || len(code) > 4096 || r.URL.Query().Get("error") != "" {
		h.googleFailure(w, r, "oauth_cancelled")
		return
	}
	info, err := h.google.exchange(r.Context(), code, state.Verifier)
	if err != nil {
		h.googleFailure(w, r, "oauth_failed")
		return
	}
	user, err := h.accounts.GoogleUser(r.Context(), info)
	if err != nil {
		var accountError *AccountError
		if errors.As(err, &accountError) && accountError.Status == 409 {
			h.googleFailure(w, r, "account_exists")
		} else {
			h.googleFailure(w, r, "oauth_failed")
		}
		return
	}
	_, refresh, expires, err := h.service.loginUser(r.Context(), user)
	if err != nil {
		h.googleFailure(w, r, "oauth_failed")
		return
	}
	h.setRefreshCookie(w, refresh, expires, 0)
	u, _ := url.Parse(h.google.config.AppURL)
	destination, _ := url.Parse(safeReturnPath(state.ReturnTo))
	u = u.ResolveReference(destination)
	http.Redirect(w, r, u.String(), http.StatusSeeOther)
}

type GoogleUserInfo struct {
	Sub           string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	Picture       string `json:"picture"`
}

func (g *Google) exchange(ctx context.Context, code, verifier string) (GoogleUserInfo, error) {
	var info GoogleUserInfo
	body := url.Values{"client_id": {g.config.ClientID}, "client_secret": {g.config.ClientSecret}, "redirect_uri": {g.config.RedirectURL}, "code": {code}, "code_verifier": {verifier}, "grant_type": {"authorization_code"}}
	r, err := http.NewRequestWithContext(ctx, http.MethodPost, g.tokenURL, strings.NewReader(body.Encode()))
	if err != nil {
		return info, err
	}
	r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response, err := g.client.Do(r)
	if err != nil {
		return info, errors.New("Google token exchange unavailable")
	}
	defer response.Body.Close()
	var token struct {
		AccessToken string `json:"access_token"`
		TokenType   string `json:"token_type"`
	}
	if response.StatusCode != 200 || decodeGoogleResponse(response.Body, &token) != nil || token.AccessToken == "" || !strings.EqualFold(token.TokenType, "Bearer") {
		return info, errors.New("Google token exchange failed")
	}
	r, err = http.NewRequestWithContext(ctx, http.MethodGet, g.userInfoURL, nil)
	if err != nil {
		return info, err
	}
	r.Header.Set("Authorization", "Bearer "+token.AccessToken)
	profile, err := g.client.Do(r)
	if err != nil {
		return info, errors.New("Google profile unavailable")
	}
	defer profile.Body.Close()
	if profile.StatusCode != 200 || decodeGoogleResponse(profile.Body, &info) != nil || info.Sub == "" || len(info.Sub) > 255 || !info.EmailVerified {
		return info, ErrUnauthenticated
	}
	info.Email = strings.ToLower(strings.TrimSpace(info.Email))
	if !ValidEmail(info.Email) {
		return info, ErrUnauthenticated
	}
	return info, nil
}

func decodeGoogleResponse(body io.Reader, destination any) error {
	const limit = 128 * 1024
	raw, err := io.ReadAll(io.LimitReader(body, limit+1))
	if err != nil || len(raw) > limit {
		return errors.New("Google response unavailable")
	}
	return json.Unmarshal(raw, destination)
}

func (a *Accounts) GoogleUser(ctx context.Context, info GoogleUserInfo) (User, error) {
	if info.Sub == "" || !info.EmailVerified || !ValidEmail(info.Email) {
		return User{}, ErrUnauthenticated
	}
	var user User
	err := a.db.QueryRowContext(ctx, `SELECT `+userColumns+` FROM users u JOIN accounts a ON a.user_id=u.id WHERE a.provider='google' AND a.provider_account_id=$1`, info.Sub).Scan(userDest(&user)...)
	if err == nil {
		return user, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return User{}, err
	}
	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		return User{}, err
	}
	defer tx.Rollback()
	var id, provider string
	var providerID sql.NullString
	err = tx.QueryRowContext(ctx, `SELECT id,provider,provider_id FROM users WHERE email=$1 FOR UPDATE`, info.Email).Scan(&id, &provider, &providerID)
	if err == nil {
		if provider != "google" || !providerID.Valid || providerID.String != info.Sub {
			return User{}, &AccountError{409, "Sign in using the existing account's method"}
		}
	} else if errors.Is(err, sql.ErrNoRows) {
		id, err = data.NewUUID()
		if err != nil {
			return User{}, err
		}
		var avatar any
		if parsed, e := url.Parse(info.Picture); e == nil && parsed.Scheme == "https" && parsed.Host != "" && len(info.Picture) <= 1024 {
			avatar = info.Picture
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO users(id,email,name,avatar_url,provider,provider_id,email_verified,credits,plan) VALUES($1,$2,$3,$4,'google',$5,now(),$6,'free')`, id, info.Email, info.Name, avatar, info.Sub, a.config.InitialCredits)
		if err != nil {
			return User{}, err
		}
	} else {
		return User{}, err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO accounts(user_id,type,provider,provider_account_id) VALUES($1,'oauth','google',$2)`, id, info.Sub)
	if err != nil {
		return User{}, err
	}
	if err = tx.Commit(); err != nil {
		return User{}, err
	}
	return NewPostgres(a.db).FindByEmail(ctx, info.Email)
}
