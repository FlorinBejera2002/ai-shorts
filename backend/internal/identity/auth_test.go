package identity

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/julienschmidt/httprouter"
)

const testPassword = "dummy-password-not-a-user"

func testUser() User {
	return User{
		ID: "f53114bc-48c7-4b51-af21-99f0efcb5e30", Email: "auth-test@example.invalid",
		PasswordHash: dummyPasswordHash, AccessRole: "member", Plan: "free", Credits: 100,
		CreatedAt: time.Now().UTC(),
	}
}

type memoryRepository struct {
	mu       sync.Mutex
	user     User
	sessions map[string]time.Time
	reads    int
}

func (m *memoryRepository) FindByEmail(_ context.Context, email string) (User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.reads++
	if email != m.user.Email {
		return User{}, ErrUnauthenticated
	}
	return m.user, nil
}
func (m *memoryRepository) CreateSession(_ context.Context, id string, user User, expires time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.user.SessionVersion != user.SessionVersion || m.user.DeletionPending != user.DeletionPending || m.user.ActivationRequired {
		return ErrUnauthenticated
	}
	m.sessions[id] = expires
	return nil
}
func (m *memoryRepository) FindSession(_ context.Context, id string) (Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.reads++
	expires, ok := m.sessions[id]
	if !ok {
		return Session{}, ErrUnauthenticated
	}
	return Session{User: m.user, Expires: expires}, nil
}
func (m *memoryRepository) DeleteSession(_ context.Context, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.sessions, id)
	return nil
}

func testTokens(t *testing.T) *Tokens {
	t.Helper()
	tokens, err := NewTokens(TokenConfig{Secret: strings.Repeat("test-only-secret", 3), Issuer: "sneepcut-test", Audience: "test-web", AccessLifetime: 15 * time.Minute, RefreshLifetime: 30 * 24 * time.Hour})
	if err != nil {
		t.Fatal(err)
	}
	return tokens
}

func testHTTP(t *testing.T) (http.Handler, *memoryRepository, *Service) {
	t.Helper()
	repository := &memoryRepository{user: testUser(), sessions: make(map[string]time.Time)}
	service := NewService(repository, testTokens(t))
	router := httprouter.New()
	NewHandler(service, HTTPConfig{SecureCookies: true, AllowedOrigins: []string{"https://app.example.invalid"}}, slog.New(slog.NewTextHandler(io.Discard, nil))).Register(router)
	return router, repository, service
}

func call(handler http.Handler, method, path, body string, cookie *http.Cookie, bearer string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.RemoteAddr = "127.0.0.1:12345"
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Origin", "https://app.example.invalid")
	if cookie != nil {
		r.AddCookie(cookie)
	}
	if bearer != "" {
		r.Header.Set("Authorization", "Bearer "+bearer)
	}
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	return w
}

func loginHTTP(t *testing.T, handler http.Handler) (AuthResponse, *http.Cookie) {
	t.Helper()
	body := `{"email":"AUTH-TEST@example.invalid","password":"` + testPassword + `"}`
	w := call(handler, http.MethodPost, "/v1/auth/login", body, nil, "")
	if w.Code != http.StatusCreated {
		t.Fatalf("login: %d %s", w.Code, w.Body.String())
	}
	for _, private := range []string{"password_hash", "session_version", "email_activation_required", dummyPasswordHash} {
		if strings.Contains(w.Body.String(), private) {
			t.Fatalf("login exposed %s", private)
		}
	}
	var result AuthResponse
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	cookies := w.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("cookies: %v", cookies)
	}
	return result, cookies[0]
}

func TestHTTPLoginRefreshLogout(t *testing.T) {
	handler, _, service := testHTTP(t)
	response, cookie := loginHTTP(t, handler)
	if !cookie.HttpOnly || !cookie.Secure || cookie.SameSite != http.SameSiteStrictMode || cookie.Path != "/v1/auth" || cookie.Name != "refreshToken" {
		t.Fatalf("incorrect refresh cookie: %+v", cookie)
	}
	if cookie.Value == response.AccessToken || response.User.ID != testUser().ID {
		t.Fatal("two-token/user contract lost")
	}
	if response.User.PasswordHash != "" || response.User.SessionVersion != 0 {
		t.Fatal("private fields were serialized")
	}
	me := call(handler, http.MethodGet, "/v1/auth/me", "", nil, response.AccessToken)
	if me.Code != http.StatusOK {
		t.Fatalf("me: %d", me.Code)
	}
	refresh := call(handler, http.MethodPost, "/v1/auth/refresh", "{}", cookie, "")
	if refresh.Code != http.StatusOK {
		t.Fatalf("refresh: %d", refresh.Code)
	}
	var renewed AuthResponse
	if err := json.Unmarshal(refresh.Body.Bytes(), &renewed); err != nil {
		t.Fatal(err)
	}
	if renewed.AuthenticatedAt != response.AuthenticatedAt || refresh.Header().Get("Set-Cookie") != "" {
		t.Fatal("refresh must preserve login time and refresh lifetime")
	}
	logout := call(handler, http.MethodPost, "/v1/auth/logout", "{}", cookie, "")
	if logout.Code != http.StatusOK || logout.Result().Cookies()[0].MaxAge != -1 {
		t.Fatal("logout did not clear cookie")
	}
	if _, err := service.CurrentUser(context.Background(), renewed.AccessToken); err != ErrUnauthenticated {
		t.Fatalf("logged-out access accepted: %v", err)
	}
	if _, err := service.Refresh(context.Background(), cookie.Value); err != ErrUnauthenticated {
		t.Fatalf("logged-out refresh accepted: %v", err)
	}
}

func TestTokenTypesCannotBeExchanged(t *testing.T) {
	handler, repository, _ := testHTTP(t)
	response, cookie := loginHTTP(t, handler)
	before := repository.reads
	if w := call(handler, http.MethodGet, "/v1/auth/me", "", nil, cookie.Value); w.Code != 401 {
		t.Fatal("refresh used as access")
	}
	if w := call(handler, http.MethodPost, "/v1/auth/refresh", "{}", &http.Cookie{Name: refreshCookieName, Value: response.AccessToken}, ""); w.Code != 401 {
		t.Fatal("access used as refresh")
	}
	if repository.reads != before {
		t.Fatal("invalid token reached database")
	}
}

func TestSessionChangesInvalidateTokens(t *testing.T) {
	for _, change := range []string{"version", "activation", "role", "expiry", "missing-user"} {
		t.Run(change, func(t *testing.T) {
			handler, repository, service := testHTTP(t)
			response, cookie := loginHTTP(t, handler)
			switch change {
			case "version":
				repository.user.SessionVersion++
			case "activation":
				repository.user.ActivationRequired = true
			case "role":
				repository.user.AccessRole = "admin-from-untrusted-data"
			case "missing-user":
				repository.user.ID = ""
			case "expiry":
				for key := range repository.sessions {
					repository.sessions[key] = time.Now().Add(-time.Minute)
				}
			}
			if _, err := service.CurrentUser(context.Background(), response.AccessToken); err != ErrUnauthenticated {
				t.Fatalf("access: %v", err)
			}
			if _, err := service.Refresh(context.Background(), cookie.Value); err != ErrUnauthenticated {
				t.Fatalf("refresh: %v", err)
			}
		})
	}
}

func TestParallelRefreshAndLogoutCannotRestoreSession(t *testing.T) {
	handler, _, service := testHTTP(t)
	_, cookie := loginHTTP(t, handler)
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); _, _ = service.Refresh(context.Background(), cookie.Value) }()
	}
	if err := service.Logout(context.Background(), cookie.Value); err != nil {
		t.Fatal(err)
	}
	wg.Wait()
	if _, err := service.Refresh(context.Background(), cookie.Value); err != ErrUnauthenticated {
		t.Fatalf("session restored: %v", err)
	}
}

func TestRejectedOriginsAndBodiesHaveNoSideEffects(t *testing.T) {
	handler, repository, _ := testHTTP(t)
	r := httptest.NewRequest(http.MethodPost, "/v1/auth/logout", nil)
	r.Header.Set("Origin", "https://attacker.invalid")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	if w.Code != 403 || w.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatal("untrusted origin accepted")
	}
	for _, body := range []string{`{"email":"auth-test@example.invalid","password":"x","access_role":"member"}`, `{"email":`, strings.Repeat(" ", 16385)} {
		w := call(handler, http.MethodPost, "/v1/auth/login", body, nil, "")
		if w.Code != 400 {
			t.Fatalf("body: %d", w.Code)
		}
		if w.Header().Get("Cache-Control") != "no-store" {
			t.Fatal("auth response cacheable")
		}
	}
	if repository.reads != 0 || len(repository.sessions) != 0 {
		t.Fatal("invalid input reached storage")
	}
}

func TestLoginLimiterDoesNotTrustForwardedIdentity(t *testing.T) {
	limiter := newLoginLimiter()
	for i := 0; i < 5; i++ {
		if !limiter.allow("127.0.0.1:1000") {
			t.Fatal("initial burst rejected")
		}
	}
	if limiter.allow("127.0.0.1:2000") {
		t.Fatal("changing source port bypassed limit")
	}
	if !limiter.allow("127.0.0.2:1000") {
		t.Fatal("unrelated peer blocked")
	}
}

func TestLoginRejectsInvalidCredentials(t *testing.T) {
	for _, kind := range []string{"wrong-password", "unknown-email", "oauth-only", "activation", "oversized-password"} {
		t.Run(kind, func(t *testing.T) {
			_, repository, service := testHTTP(t)
			email, password := testUser().Email, testPassword
			switch kind {
			case "wrong-password":
				password = "wrong-password"
			case "unknown-email":
				email = "absent@example.invalid"
			case "oauth-only":
				repository.user.PasswordHash = ""
			case "activation":
				repository.user.ActivationRequired = true
			case "oversized-password":
				password = strings.Repeat("é", 37)
			}
			_, _, _, err := service.Login(context.Background(), email, password)
			if err != ErrUnauthenticated || len(repository.sessions) != 0 {
				t.Fatalf("invalid login created a session: %v", err)
			}
		})
	}
}

func TestPendingDeletionCanReauthenticateOnlyForRetry(t *testing.T) {
	handler, repository, service := testHTTP(t)
	repository.user.DeletionPending = true
	response, cookie := loginHTTP(t, handler)
	if !response.User.DeletionPending {
		t.Fatal("pending deletion not exposed for retry UI")
	}
	if _, err := service.CurrentUser(context.Background(), response.AccessToken); err != ErrUnauthenticated {
		t.Fatal("pending account reached normal identity")
	}
	if w := call(handler, http.MethodGet, "/v1/auth/me", "", nil, response.AccessToken); w.Code != 200 {
		t.Fatal("pending session could not hydrate")
	}
	if _, err := service.Refresh(context.Background(), cookie.Value); err != nil {
		t.Fatal("pending account cannot refresh restricted session")
	}
	auth := NewHandler(service, HTTPConfig{AllowedOrigins: []string{"https://app.example.invalid"}}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	ok := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) })
	if w := call(auth.RequireMember(ok), http.MethodDelete, "/api/clips/id", "{}", nil, response.AccessToken); w.Code != 401 {
		t.Fatal("pending account mutation accepted")
	}
	if w := call(auth.RequireForDeletion(ok), http.MethodDelete, "/api/user/data", "{}", nil, response.AccessToken); w.Code != 204 {
		t.Fatal("pending deletion retry blocked")
	}
}

func TestOriginPreflightAndMissingRefresh(t *testing.T) {
	handler, repository, _ := testHTTP(t)
	for _, test := range []struct {
		origin, headers string
		status          int
	}{
		{"https://app.example.invalid", "authorization,content-type", http.StatusNoContent},
		{"https://other.example.invalid", "authorization", http.StatusForbidden},
		{"https://app.example.invalid", "x-internal-api-key", http.StatusForbidden},
	} {
		r := httptest.NewRequest(http.MethodOptions, "/v1/auth/refresh", nil)
		r.Header.Set("Origin", test.origin)
		r.Header.Set("Access-Control-Request-Method", "POST")
		r.Header.Set("Access-Control-Request-Headers", test.headers)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		if w.Code != test.status {
			t.Fatalf("preflight: %d", w.Code)
		}
		if test.status == http.StatusNoContent && (w.Header().Get("Access-Control-Allow-Origin") != test.origin || w.Header().Get("Access-Control-Allow-Credentials") != "true") {
			t.Fatal("credentialed origin contract lost")
		}
	}
	missing := call(handler, http.MethodPost, "/v1/auth/refresh", "{}", nil, "")
	if missing.Code != http.StatusUnauthorized || missing.Result().Cookies()[0].MaxAge != -1 {
		t.Fatal("missing session did not clear cookie")
	}
	if repository.reads != 0 {
		t.Fatal("unauthenticated/preflight reached storage")
	}
}
