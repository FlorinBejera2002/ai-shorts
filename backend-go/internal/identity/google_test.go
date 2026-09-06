package identity

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

type googleTransport func(*http.Request) (*http.Response, error)

func (f googleTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func googleResponse(r *http.Request, status int, body string) *http.Response {
	return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header), Request: r}
}
func testGoogle() *Google {
	return NewGoogle(GoogleConfig{ClientID: "synthetic-client-id", ClientSecret: "synthetic-client-secret", RedirectURL: "https://api.example.invalid/v1/auth/google/callback", AppURL: "https://app.example.invalid"})
}

const goodGoogleToken = `{"access_token":"synthetic-access-token","token_type":"Bearer"}`
const goodGoogleProfile = `{"sub":"synthetic-google-id","email":"  PERSON@Example.invalid  ","email_verified":true,"name":"Synthetic Person","picture":"https://example.invalid/avatar.png"}`

func TestGoogleExchangeProviderContract(t *testing.T) {
	g := testGoogle()
	calls := 0
	g.client.Transport = googleTransport(func(r *http.Request) (*http.Response, error) {
		calls++
		if calls == 1 {
			if r.URL.String() != g.tokenURL || r.Method != http.MethodPost || r.Header.Get("Content-Type") != "application/x-www-form-urlencoded" {
				t.Errorf("incorrect token request")
			}
			if err := r.ParseForm(); err != nil {
				t.Error(err)
			}
			expected := map[string]string{"client_id": g.config.ClientID, "client_secret": g.config.ClientSecret, "redirect_uri": g.config.RedirectURL, "code": "synthetic-code", "code_verifier": "synthetic-verifier", "grant_type": "authorization_code"}
			if len(r.Form) != len(expected) {
				t.Errorf("unexpected token parameters")
			}
			for key, value := range expected {
				if r.Form.Get(key) != value {
					t.Errorf("incorrect %s parameter", key)
				}
			}
			return googleResponse(r, 200, goodGoogleToken), nil
		}
		if r.URL.String() != g.userInfoURL || r.Method != http.MethodGet || r.Header.Get("Authorization") != "Bearer synthetic-access-token" {
			t.Errorf("incorrect profile request")
		}
		return googleResponse(r, 200, goodGoogleProfile), nil
	})
	info, err := g.exchange(context.Background(), "synthetic-code", "synthetic-verifier")
	if err != nil || calls != 2 || info.Sub != "synthetic-google-id" || info.Email != "person@example.invalid" || !info.EmailVerified {
		t.Fatalf("exchange contract failed: %+v %v calls=%d", info, err, calls)
	}
}

func TestGoogleExchangeRejectsProviderFailures(t *testing.T) {
	for _, tc := range []struct {
		name, token, profile       string
		tokenStatus, profileStatus int
		transportError             bool
	}{
		{name: "token status", tokenStatus: 400},
		{name: "token malformed", token: `{"access_token":`},
		{name: "token missing", token: `{"token_type":"Bearer"}`},
		{name: "token type", token: `{"access_token":"synthetic-access-token","token_type":"MAC"}`},
		{name: "token oversized", token: goodGoogleToken + strings.Repeat(" ", 128*1024)},
		{name: "token trailing JSON", token: goodGoogleToken + ` {}`},
		{name: "profile status", profileStatus: 500},
		{name: "profile malformed", profile: `{"sub":`},
		{name: "profile oversized", profile: goodGoogleProfile + strings.Repeat(" ", 128*1024)},
		{name: "profile missing identity", profile: `{"email":"person@example.invalid","email_verified":true}`},
		{name: "profile long identity", profile: `{"sub":"` + strings.Repeat("x", 256) + `","email":"person@example.invalid","email_verified":true}`},
		{name: "profile unverified", profile: `{"sub":"synthetic-google-id","email":"person@example.invalid","email_verified":false}`},
		{name: "profile invalid email", profile: `{"sub":"synthetic-google-id","email":"invalid","email_verified":true}`},
		{name: "transport failure", transportError: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			g := testGoogle()
			g.client.Transport = googleTransport(func(r *http.Request) (*http.Response, error) {
				if tc.transportError {
					return nil, errors.New("private synthetic-access-token synthetic-client-secret")
				}
				body, status := tc.token, tc.tokenStatus
				if r.URL.String() == g.userInfoURL {
					body, status = tc.profile, tc.profileStatus
					if body == "" {
						body = goodGoogleProfile
					}
				} else if body == "" {
					body = goodGoogleToken
				}
				if status == 0 {
					status = 200
				}
				return googleResponse(r, status, body), nil
			})
			_, err := g.exchange(context.Background(), "synthetic-code", "synthetic-verifier")
			if err == nil {
				t.Fatal("invalid provider response accepted")
			}
			for _, secret := range []string{"synthetic-access-token", "synthetic-client-secret", "synthetic-code", "synthetic-verifier"} {
				if strings.Contains(err.Error(), secret) {
					t.Fatal("provider error exposed a secret")
				}
			}
		})
	}
}
func TestGoogleExchangeDoesNotFollowProviderRedirects(t *testing.T) {
	for _, endpoint := range []string{"token", "profile"} {
		t.Run(endpoint, func(t *testing.T) {
			g := testGoogle()
			calls := 0
			g.client.Transport = googleTransport(func(r *http.Request) (*http.Response, error) {
				calls++
				if endpoint == "profile" && r.URL.String() == g.tokenURL {
					return googleResponse(r, 200, goodGoogleToken), nil
				}
				response := googleResponse(r, 307, "")
				response.Header.Set("Location", "https://attacker.invalid/capture")
				return response, nil
			})
			if _, err := g.exchange(context.Background(), "synthetic-code", "synthetic-verifier"); err == nil {
				t.Fatal("redirect accepted")
			}
			expected := 1
			if endpoint == "profile" {
				expected = 2
			}
			if calls != expected {
				t.Fatalf("followed provider redirect: %d", calls)
			}
		})
	}
}
func TestGoogleSafeReturnPaths(t *testing.T) {
	for _, tc := range []struct{ input, want string }{
		{"/dashboard", "/dashboard"}, {"/dashboard/clips/id?tab=edit", "/dashboard/clips/id?tab=edit"}, {"/ro/dashboard/jobs/id", "/ro/dashboard/jobs/id"},
		{"https://attacker.invalid/dashboard", "/dashboard"}, {"//attacker.invalid/dashboard", "/dashboard"}, {"/dashboard\\attacker.invalid", "/dashboard"},
		{"/dashboard/%5cattacker.invalid", "/dashboard"}, {"/dashboard/%0d%0aLocation:evil", "/dashboard"}, {"/dashboard/../../login", "/dashboard"}, {"/dashboard/%2e%2e/login", "/dashboard"},
		{"/dashboardish", "/dashboard"}, {"/login", "/dashboard"}, {strings.Repeat("x", 2049), "/dashboard"},
	} {
		t.Run(tc.input[:min(len(tc.input), 40)], func(t *testing.T) {
			if got := safeReturnPath(tc.input); got != tc.want {
				t.Fatalf("return=%q want=%q", got, tc.want)
			}
		})
	}
}

func TestGoogleCallbackPostgres(t *testing.T) {
	db := migratedPostgres(t)
	service := NewService(NewPostgres(db), testTokens(t))
	var logs bytes.Buffer
	h := NewHandler(service, HTTPConfig{SecureCookies: true}, slog.New(slog.NewTextHandler(&logs, nil)))
	h.SetAccounts(NewAccounts(db, AccountsConfig{InitialCredits: 100}, nil))
	g := testGoogle()
	h.SetGoogle(g)
	calls := 0
	expectedVerifier := ""
	profileBody := goodGoogleProfile
	tokenStatus := 200
	g.client.Transport = googleTransport(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.URL.String() == g.tokenURL {
			if err := r.ParseForm(); err != nil {
				t.Error(err)
			}
			if r.Form.Get("code") != "synthetic-code" || r.Form.Get("code_verifier") != expectedVerifier {
				t.Error("callback lost code or PKCE verifier")
			}
			return googleResponse(r, tokenStatus, goodGoogleToken), nil
		}
		return googleResponse(r, 200, profileBody), nil
	})
	start := func(returnTo string) (*http.Cookie, oauthState) {
		t.Helper()
		req := httptest.NewRequest(http.MethodGet, "/v1/auth/google?locale=ro&returnTo="+url.QueryEscape(returnTo), nil)
		w := httptest.NewRecorder()
		h.googleStart(w, req)
		if w.Code != 303 {
			t.Fatalf("start: %d %s", w.Code, w.Body.String())
		}
		cookies := w.Result().Cookies()
		if len(cookies) != 1 {
			t.Fatal("missing state cookie")
		}
		cookie := cookies[0]
		if cookie.Name != googleCookieName || cookie.Path != "/v1/auth/google" || !cookie.HttpOnly || !cookie.Secure || cookie.SameSite != http.SameSiteLaxMode || cookie.MaxAge != 600 {
			t.Fatal("unsafe state cookie")
		}
		state, err := h.readState(cookie.Value)
		if err != nil {
			t.Fatal(err)
		}
		redirect, err := url.Parse(w.Header().Get("Location"))
		if err != nil {
			t.Fatal(err)
		}
		q := redirect.Query()
		challenge := sha256.Sum256([]byte(state.Verifier))
		if q.Get("state") != state.State || q.Get("code_challenge") != base64.RawURLEncoding.EncodeToString(challenge[:]) || q.Get("code_challenge_method") != "S256" || q.Get("hl") != "ro" || q.Get("redirect_uri") != g.config.RedirectURL || q.Get("response_type") != "code" {
			t.Fatal("incorrect authorization parameters")
		}
		var stored string
		if err = db.QueryRow(`SELECT token FROM verification_tokens WHERE token=$1`, tokenDigest(state.State)).Scan(&stored); err != nil || stored == state.State {
			t.Fatal("state not hashed in database", err)
		}
		expectedVerifier = state.Verifier
		return cookie, state
	}
	callback := func(cookie *http.Cookie, state, extra string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, "/v1/auth/google/callback?state="+url.QueryEscape(state)+"&"+extra, nil)
		if cookie != nil {
			req.AddCookie(cookie)
		}
		w := httptest.NewRecorder()
		h.googleCallback(w, req)
		return w
	}
	assertFailure := func(w *httptest.ResponseRecorder, reason string) {
		t.Helper()
		if w.Code != 303 || w.Header().Get("Location") != "https://app.example.invalid/login?error="+reason {
			t.Fatalf("incorrect failure redirect: %d %s", w.Code, w.Header().Get("Location"))
		}
		for _, c := range w.Result().Cookies() {
			if c.Name == refreshCookieName && c.Value != "" {
				t.Fatal("failure created session cookie")
			}
		}
	}
	cookie, state := start("/ro/dashboard/clips?view=recent")
	before := calls
	assertFailure(callback(cookie, "wrong-state", "code=synthetic-code"), "oauth_state")
	if calls != before {
		t.Fatal("bad state reached provider")
	}
	w := callback(cookie, state.State, "code=synthetic-code")
	if w.Code != 303 || w.Header().Get("Location") != "https://app.example.invalid/ro/dashboard/clips?view=recent" {
		t.Fatalf("callback redirect: %d %s", w.Code, w.Header().Get("Location"))
	}
	var refresh *http.Cookie
	cleared := false
	for _, c := range w.Result().Cookies() {
		if c.Name == refreshCookieName {
			refresh = c
		}
		if c.Name == googleCookieName && c.MaxAge == -1 {
			cleared = true
		}
	}
	if !cleared || refresh == nil || !refresh.HttpOnly || !refresh.Secure || refresh.SameSite != http.SameSiteStrictMode || refresh.Path != "/v1/auth" || !refresh.Expires.After(time.Now()) {
		t.Fatal("incorrect callback cookies")
	}
	auth, err := service.Refresh(context.Background(), refresh.Value)
	if err != nil || auth.User.Email != "person@example.invalid" {
		t.Fatal("callback session cannot authenticate", err)
	}
	before = calls
	assertFailure(callback(cookie, state.State, "code=synthetic-code"), "oauth_state")
	if calls != before {
		t.Fatal("replay reached provider")
	}
	assertFailure(callback(nil, state.State, "code=synthetic-code"), "oauth_state")
	cookie, state = start("https://attacker.invalid/dashboard")
	w = callback(cookie, state.State, "code=synthetic-code")
	if w.Header().Get("Location") != "https://app.example.invalid/dashboard" {
		t.Fatal("external return escaped app")
	}
	if _, err := service.Refresh(context.Background(), refresh.Value); err != nil {
		t.Fatal("repeat identity invalidated prior login", err)
	}
	var users, accounts int
	if err = db.QueryRow(`SELECT count(*) FROM users`).Scan(&users); err != nil {
		t.Fatal(err)
	}
	if err = db.QueryRow(`SELECT count(*) FROM accounts`).Scan(&accounts); err != nil || users != 1 || accounts != 1 {
		t.Fatal("repeat sign-in duplicated identity", users, accounts, err)
	}
	cookie, state = start("/dashboard")
	before = calls
	assertFailure(callback(cookie, state.State, "error=access_denied"), "oauth_cancelled")
	if calls != before {
		t.Fatal("canceled callback reached provider")
	}
	cookie, state = start("/dashboard")
	tokenStatus = 500
	assertFailure(callback(cookie, state.State, "code=synthetic-code"), "oauth_failed")
	tokenStatus = 200
	existing, err := h.accounts.Register(context.Background(), Registration{Email: "existing@example.invalid", Password: "SyntheticPassword42!"})
	if err != nil {
		t.Fatal(err)
	}
	profileJSON, _ := json.Marshal(GoogleUserInfo{Sub: "another-google-id", Email: existing.Email, EmailVerified: true})
	profileBody = string(profileJSON)
	cookie, state = start("/dashboard")
	assertFailure(callback(cookie, state.State, "code=synthetic-code"), "account_exists")
	for _, secret := range []string{"synthetic-access-token", "synthetic-client-secret", "synthetic-code", state.State, state.Verifier, refresh.Value} {
		if strings.Contains(logs.String(), secret) {
			t.Fatal("logs contain auth secrets")
		}
	}
}
