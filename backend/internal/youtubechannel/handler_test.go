package youtubechannel

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/julienschmidt/httprouter"

	"sneepcut/backend-go/internal/identity"
)

// passthroughAuth replaces the session middleware so handler tests can focus on
// HTTP behaviour. It signs every request in as testUser, the owner of the fixtures.
type passthroughAuth struct{}

func asTestUser(next http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		principal := identity.AuthResponse{User: identity.User{ID: testUser, AccessRole: "member"}}
		next(w, r.WithContext(identity.WithPrincipal(r.Context(), principal)))
	})
}

func (passthroughAuth) Require(next http.HandlerFunc) http.Handler       { return asTestUser(next) }
func (passthroughAuth) RequireMember(next http.HandlerFunc) http.Handler { return asTestUser(next) }
func (passthroughAuth) Limit(next http.HandlerFunc, _ string, _ int, _ time.Duration) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		asTestUser(next).ServeHTTP(w, r)
	}
}

type handlerFixture struct {
	router *httprouter.Router
	store  *fakeStore
	google *fakeGoogle
}

func newHandlerFixture(t *testing.T, connected bool) handlerFixture {
	t.Helper()
	google := newFakeGoogle(t)
	store := newFakeStore(true)
	service := newTestService(t, store, google)
	if connected {
		store.withConnection(t, service, freshToken("access-1", "refresh-1"))
	}
	router := httprouter.New()
	NewHandler(service, passthroughAuth{}, Config{AppURL: testAppURL, SecureCookies: true}).Register(router)
	return handlerFixture{router: router, store: store, google: google}
}

func (f handlerFixture) serve(request *http.Request) *httptest.ResponseRecorder {
	recorder := httptest.NewRecorder()
	f.router.ServeHTTP(recorder, request)
	return recorder
}

func postConnect(body string) *http.Request {
	return httptest.NewRequest(http.MethodPost, "/api/youtube/channel/connect", strings.NewReader(body))
}

func TestStatusReportsAccountWithoutTokens(t *testing.T) {
	f := newHandlerFixture(t, true)
	response := f.serve(httptest.NewRequest(http.MethodGet, "/api/youtube/channel", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("status returned %d", response.Code)
	}
	var status Status
	if err := json.Unmarshal(response.Body.Bytes(), &status); err != nil {
		t.Fatal(err)
	}
	if !status.Enabled || !status.Connected || status.Account == nil || status.Account.Title != "Ana Creator" {
		t.Fatalf("unexpected status %+v", status)
	}
	body := response.Body.String()
	if strings.Contains(body, "refresh") || strings.Contains(body, "access-1") || strings.Contains(body, "credentials") {
		t.Fatalf("status leaked credentials: %s", body)
	}
}

func TestConnectRequiresConsentAndStartsReadonlyFlow(t *testing.T) {
	f := newHandlerFixture(t, false)
	for _, body := range []string{`{"consent":false,"locale":"en"}`, `{"locale":"en"}`, `{"consent":true,"unexpected":1}`} {
		if response := f.serve(postConnect(body)); response.Code != http.StatusBadRequest {
			t.Fatalf("body %s returned %d", body, response.Code)
		}
	}
	response := f.serve(postConnect(`{"consent":true,"locale":"ro"}`))
	if response.Code != http.StatusOK {
		t.Fatalf("connect returned %d: %s", response.Code, response.Body.String())
	}
	var payload struct {
		URL string `json:"url"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(payload.URL, f.google.server.URL+"/auth?") {
		t.Fatalf("authorization URL points elsewhere: %s", payload.URL)
	}
	query := parseQuery(t, payload.URL)
	if query.Get("scope") != ReadonlyScope || query.Get("access_type") != "offline" || query.Get("hl") != "ro" {
		t.Fatalf("unexpected consent parameters: %v", query)
	}
	cookie := findCookie(t, response, authorizationName)
	if cookie.Path != callbackPath || !cookie.HttpOnly || !cookie.Secure || cookie.SameSite != http.SameSiteLaxMode {
		t.Fatalf("state cookie is not scoped and protected: %+v", cookie)
	}
}

func TestConnectIsUnavailableWithoutGoogleClient(t *testing.T) {
	store := newFakeStore(true)
	service, err := NewService(store, nil, "")
	if err != nil {
		t.Fatal(err)
	}
	router := httprouter.New()
	NewHandler(service, passthroughAuth{}, Config{AppURL: testAppURL}).Register(router)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, postConnect(`{"consent":true,"locale":"en"}`))
	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("unconfigured connect returned %d", recorder.Code)
	}
}

func TestCallbackStoresConnectionAndClearsState(t *testing.T) {
	f := newHandlerFixture(t, false)
	f.store.connection = nil
	connect := f.serve(postConnect(`{"consent":true,"locale":"en"}`))
	state := parseQuery(t, mustURL(t, connect)).Get("state")
	cookie := findCookie(t, connect, authorizationName)

	request := httptest.NewRequest(http.MethodGet, callbackPath+"?state="+url.QueryEscape(state)+"&code=good-code", nil)
	request.AddCookie(cookie)
	response := f.serve(request)
	if response.Code != http.StatusSeeOther {
		t.Fatalf("callback returned %d", response.Code)
	}
	if got := response.Header().Get("Location"); got != testAppURL+"/dashboard/create?mode=youtube&youtubeChannel=success" {
		t.Fatalf("redirect = %s", got)
	}
	if f.store.connection == nil || f.store.connection.ChannelID != "UCchannel1" {
		t.Fatalf("connection not saved: %+v", f.store.connection)
	}
	cleared := findCookie(t, response, authorizationName)
	if cleared.MaxAge >= 0 {
		t.Fatal("state cookie was not cleared after use")
	}
}

func TestCallbackRejectsMissingForgedAndDeclinedAuthorization(t *testing.T) {
	f := newHandlerFixture(t, false)
	f.store.connection = nil
	connect := f.serve(postConnect(`{"consent":true,"locale":"en"}`))
	state := parseQuery(t, mustURL(t, connect)).Get("state")
	cookie := findCookie(t, connect, authorizationName)

	cases := map[string]*http.Request{
		"no cookie": httptest.NewRequest(http.MethodGet, callbackPath+"?state="+state+"&code=good-code", nil),
		"wrong state": func() *http.Request {
			r := httptest.NewRequest(http.MethodGet, callbackPath+"?state=forged&code=good-code", nil)
			r.AddCookie(cookie)
			return r
		}(),
		"declined": func() *http.Request {
			r := httptest.NewRequest(http.MethodGet, callbackPath+"?state="+state+"&error=access_denied", nil)
			r.AddCookie(cookie)
			return r
		}(),
	}
	for name, request := range cases {
		response := f.serve(request)
		if response.Code != http.StatusSeeOther || !strings.HasSuffix(response.Header().Get("Location"), "youtubeChannel=error") {
			t.Fatalf("%s: redirect %d %s", name, response.Code, response.Header().Get("Location"))
		}
	}
	if f.google.tokenCalls != 0 || f.store.connection != nil {
		t.Fatalf("rejected callbacks reached Google or stored a grant: tokens=%d", f.google.tokenCalls)
	}
}

func TestVideosEndpointReturnsNotConnectedCode(t *testing.T) {
	f := newHandlerFixture(t, false)
	response := f.serve(httptest.NewRequest(http.MethodGet, "/api/youtube/channel/videos", nil))
	if response.Code != http.StatusConflict || strings.TrimSpace(response.Body.String()) != `{"error":"not_connected"}` {
		t.Fatalf("returned %d %s", response.Code, response.Body.String())
	}
}

func TestVideosEndpointValidatesFiltersAndReturnsPage(t *testing.T) {
	f := newHandlerFixture(t, true)
	for _, target := range []string{"/api/youtube/channel/videos?visibility=secret", "/api/youtube/channel/videos?page_token=a%20b", "/api/youtube/channel/videos?q=" + strings.Repeat("x", 101)} {
		if response := f.serve(httptest.NewRequest(http.MethodGet, target, nil)); response.Code != http.StatusBadRequest {
			t.Fatalf("%s returned %d", target, response.Code)
		}
	}
	response := f.serve(httptest.NewRequest(http.MethodGet, "/api/youtube/channel/videos?visibility=all", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("list returned %d: %s", response.Code, response.Body.String())
	}
	var page struct {
		Videos        []Video `json:"videos"`
		NextPageToken *string `json:"next_page_token"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &page); err != nil {
		t.Fatal(err)
	}
	if len(page.Videos) != 3 || page.NextPageToken != nil {
		t.Fatalf("page = %+v", page)
	}
	if !strings.Contains(response.Body.String(), `"next_page_token":null`) {
		t.Fatalf("exhausted listing must send null next_page_token: %s", response.Body.String())
	}
}

func TestDisconnectRevokesAndReturnsNoContent(t *testing.T) {
	f := newHandlerFixture(t, true)
	response := f.serve(httptest.NewRequest(http.MethodDelete, "/api/youtube/channel", nil))
	if response.Code != http.StatusNoContent {
		t.Fatalf("disconnect returned %d", response.Code)
	}
	if len(f.google.revoked) != 1 || f.google.revoked[0] != "refresh-1" || f.store.connection != nil {
		t.Fatalf("revoked=%v connection=%+v", f.google.revoked, f.store.connection)
	}
}

func TestDisconnectReportsRetryableFailureWhenGoogleRejectsRevocation(t *testing.T) {
	f := newHandlerFixture(t, true)
	f.google.revokeFailure["refresh-1"] = true
	response := f.serve(httptest.NewRequest(http.MethodDelete, "/api/youtube/channel", nil))
	if response.Code != http.StatusServiceUnavailable || f.store.connection == nil {
		t.Fatalf("returned %d and kept=%v", response.Code, f.store.connection != nil)
	}
}

func TestReturnURLKeepsLocalePrefixAndResult(t *testing.T) {
	if got := returnURL("https://sneepcut.example/", "ro", "error"); got != "https://sneepcut.example/ro/dashboard/create?mode=youtube&youtubeChannel=error" {
		t.Fatalf("ro return URL = %s", got)
	}
	if got := returnURL("https://sneepcut.example/", "es", "error"); got != "https://sneepcut.example/es/dashboard/create?mode=youtube&youtubeChannel=error" {
		t.Fatalf("Spanish return location: %q", got)
	}
	if got := returnURL(testAppURL, "en", "success"); got != testAppURL+"/dashboard/create?mode=youtube&youtubeChannel=success" {
		t.Fatalf("en return URL = %s", got)
	}
}

func findCookie(t *testing.T, response *httptest.ResponseRecorder, name string) *http.Cookie {
	t.Helper()
	for _, cookie := range response.Result().Cookies() {
		if cookie.Name == name {
			return cookie
		}
	}
	t.Fatalf("cookie %s not set", name)
	return nil
}

func mustURL(t *testing.T, response *httptest.ResponseRecorder) string {
	t.Helper()
	var payload struct {
		URL string `json:"url"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil || payload.URL == "" {
		t.Fatalf("no authorization URL in %s", response.Body.String())
	}
	return payload.URL
}
