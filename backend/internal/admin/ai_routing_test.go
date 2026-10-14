package admin

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/julienschmidt/httprouter"
	"github.com/pascaldekloe/jwt"

	"sneepcut/backend-go/internal/aiprovider"
	"sneepcut/backend-go/internal/airouting"
	"sneepcut/backend-go/internal/identity"
)

type routingStub struct {
	err     error
	views   int
	updates int
	actor   string
	version int64
	reason  string
	routes  map[aiprovider.Task]airouting.Route
}

func (s *routingStub) View(context.Context) (airouting.View, error) {
	s.views++
	return airouting.View{}, s.err
}

func (s *routingStub) Update(_ context.Context, version int64, routes map[aiprovider.Task]airouting.Route, actor, reason string) (airouting.Configuration, error) {
	s.updates++
	s.actor, s.version, s.reason, s.routes = actor, version, reason, routes
	return airouting.Configuration{Version: version + 1, Routes: routes}, s.err
}

const routingTestUserID = "00000000-0000-4000-8000-000000000001"
const routingTestSecret = "routing-handler-test-secret-long-enough"

type routingIdentityRepository struct{ role string }

func (r routingIdentityRepository) FindByEmail(context.Context, string) (identity.User, error) {
	return identity.User{}, identity.ErrUnauthenticated
}
func (r routingIdentityRepository) CreateSession(context.Context, string, identity.User, time.Time) error {
	return nil
}
func (r routingIdentityRepository) FindSession(context.Context, string) (identity.Session, error) {
	return identity.Session{User: identity.User{ID: routingTestUserID, AccessRole: r.role, AccountStatus: "active"}, Expires: time.Now().Add(time.Hour)}, nil
}
func (r routingIdentityRepository) DeleteSession(context.Context, string) error { return nil }

func routingHTTP(t *testing.T, role string, service *routingStub) http.Handler {
	t.Helper()
	tokens, err := identity.NewTokens(identity.TokenConfig{Secret: routingTestSecret, Issuer: "routing-test", Audience: "routing-test", AccessLifetime: time.Hour, RefreshLifetime: 2 * time.Hour})
	if err != nil {
		t.Fatal(err)
	}
	auth := identity.NewHandler(identity.NewService(routingIdentityRepository{role: role}, tokens), identity.HTTPConfig{}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	handler := New(nil, auth)
	handler.aiRouting = service
	router := httprouter.New()
	handler.Register(router)
	return router
}

func routingToken(t *testing.T, age time.Duration) string {
	t.Helper()
	key, err := jwt.NewHMAC(jwt.HS256, []byte(routingTestSecret))
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().Add(-time.Second)
	claims := jwt.Claims{Registered: jwt.Registered{Subject: routingTestUserID, Issuer: "routing-test", Audiences: []string{"routing-test"}, Issued: jwt.NewNumericTime(now), NotBefore: jwt.NewNumericTime(now), Expires: jwt.NewNumericTime(now.Add(time.Hour))}, Set: map[string]any{"token_use": "access", "session_id": strings.Repeat("a", 64), "session_version": 0, "auth_time": now.Add(-age).Unix()}}
	token, err := key.Sign(&claims)
	if err != nil {
		t.Fatal(err)
	}
	return string(token)
}

func routingRequest(handler http.Handler, method, token, body string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, "/api/admin/ai-routing", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func TestAIRoutingRequiresAdminAndRecentAuthentication(t *testing.T) {
	for _, test := range []struct {
		name, role, method string
		anonymous          bool
		age                time.Duration
		status             int
	}{
		{name: "anonymous read", role: "admin", method: http.MethodGet, anonymous: true, status: http.StatusUnauthorized},
		{name: "anonymous write", role: "admin", method: http.MethodPut, anonymous: true, status: http.StatusUnauthorized},
		{name: "member read", role: "member", method: http.MethodGet, status: http.StatusForbidden},
		{name: "member write", role: "member", method: http.MethodPut, status: http.StatusForbidden},
		{name: "stale admin write", role: "admin", method: http.MethodPut, age: 11 * time.Minute, status: http.StatusForbidden},
		{name: "stale admin read", role: "admin", method: http.MethodGet, age: 11 * time.Minute, status: http.StatusOK},
		{name: "recent admin write", role: "admin", method: http.MethodPut, status: http.StatusOK},
	} {
		t.Run(test.name, func(t *testing.T) {
			service := &routingStub{}
			token := ""
			if !test.anonymous {
				token = routingToken(t, test.age)
			}
			response := routingRequest(routingHTTP(t, test.role, service), test.method, token, `{"version":2,"routes":{},"reason":"Configure stage models"}`)
			if response.Code != test.status {
				t.Fatalf("got %d, want %d: %s", response.Code, test.status, response.Body.String())
			}
			if test.status != http.StatusOK && service.views+service.updates != 0 {
				t.Fatal("unauthorized request reached routing service")
			}
		})
	}
}

func TestAIRoutingUpdateUsesAuthenticatedActorAndVersion(t *testing.T) {
	service := &routingStub{}
	response := routingRequest(routingHTTP(t, "admin", service), http.MethodPut, routingToken(t, 0), `{"version":7,"routes":{"story_plan":{"provider":"openrouter","model":"example/planner"}},"reason":"Improve story planning"}`)
	if response.Code != http.StatusOK || service.actor != routingTestUserID || service.version != 7 || service.reason != "Improve story planning" || service.routes["story_plan"].Model != "example/planner" {
		t.Fatalf("incorrect update: status=%d service=%+v body=%s", response.Code, service, response.Body.String())
	}
	var result airouting.Configuration
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil || result.Version != 8 {
		t.Fatalf("invalid configuration response: %+v, %v", result, err)
	}
}

func TestAIRoutingHTTPErrorMapping(t *testing.T) {
	for _, test := range []struct {
		err    error
		status int
	}{
		{fmt.Errorf("stale update: %w", airouting.ErrConflict), http.StatusConflict},
		{fmt.Errorf("%w: invalid model", airouting.ErrInvalidConfiguration), http.StatusBadRequest},
		{airouting.ErrCatalogUnavailable, http.StatusServiceUnavailable},
		{errors.New("database credentials must not appear in response"), http.StatusInternalServerError},
	} {
		t.Run(fmt.Sprint(test.status), func(t *testing.T) {
			service := &routingStub{err: test.err}
			response := routingRequest(routingHTTP(t, "admin", service), http.MethodPut, routingToken(t, 0), `{"version":0,"routes":{},"reason":"Configure models"}`)
			if response.Code != test.status {
				t.Fatalf("got %d, want %d: %s", response.Code, test.status, response.Body.String())
			}
			if test.status == http.StatusInternalServerError && strings.Contains(response.Body.String(), "credentials") {
				t.Fatal("internal error leaked to response")
			}
		})
	}
}

func TestAIRoutingRejectsMalformedAndOversizedInput(t *testing.T) {
	for _, test := range []struct {
		body   string
		status int
	}{
		{`{"routes":{},"reason":"Configure models"}`, http.StatusBadRequest},
		{`{"version":0,"routes":{},"reason":"test","actorId":"forged"}`, http.StatusBadRequest},
		{`{"version":0,"routes":{},"reason":"` + strings.Repeat("x", 32*1024) + `"}`, http.StatusRequestEntityTooLarge},
	} {
		service := &routingStub{}
		response := routingRequest(routingHTTP(t, "admin", service), http.MethodPut, routingToken(t, 0), test.body)
		if response.Code != test.status || service.updates != 0 {
			t.Fatalf("invalid request accepted: status=%d updates=%d", response.Code, service.updates)
		}
	}
}
