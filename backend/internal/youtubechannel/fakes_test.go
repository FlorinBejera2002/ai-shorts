package youtubechannel

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"
)

const (
	testUser         = "user-1"
	testSessionVer   = 3
	testUploadsID    = "UUuploads1"
	testConnectionID = "11111111-1111-4111-8111-111111111111"
	testCallbackURL  = "https://sneepcut.example/v1/youtube/channel/callback"
	testAppURL       = "https://sneepcut.example"
)

// testEncryptionKey is 32 zero bytes, which is valid but fixed; tests never ship it.
var testEncryptionKey = base64.StdEncoding.EncodeToString(make([]byte, 32))

// fakeGoogle serves the subset of Google's OAuth and YouTube endpoints the
// package uses. Access and refresh tokens are synthetic fixtures.
type fakeGoogle struct {
	server *httptest.Server

	mu            sync.Mutex
	revoked       []string
	revokeFailure map[string]bool
	tokenCalls    int
	refreshCalls  int
	unauthorized  int
	playlistCalls int
	verifierSeen  string
}

func newFakeGoogle(t *testing.T) *fakeGoogle {
	t.Helper()
	g := &fakeGoogle{revokeFailure: map[string]bool{}}
	g.server = httptest.NewTLSServer(http.HandlerFunc(g.serve))
	t.Cleanup(g.server.Close)
	return g
}

func (g *fakeGoogle) endpoints() *Endpoints {
	return &Endpoints{
		AuthorizationURL: g.server.URL + "/auth",
		TokenURL:         g.server.URL + "/token",
		APIBaseURL:       g.server.URL + "/youtube/v3",
		RevokeURL:        g.server.URL + "/revoke",
	}
}

func (g *fakeGoogle) client(t *testing.T) *Client {
	t.Helper()
	client, err := NewClient(ClientConfig{
		ClientID:     "channel-client-id",
		ClientSecret: "channel-client-secret",
		RedirectURL:  testCallbackURL,
		HTTPClient:   g.server.Client(),
		Endpoints:    g.endpoints(),
	})
	if err != nil {
		t.Fatal(err)
	}
	return client
}

func (g *fakeGoogle) serve(w http.ResponseWriter, r *http.Request) {
	switch {
	case r.Method == http.MethodPost && r.URL.Path == "/token":
		g.serveToken(w, r)
	case r.Method == http.MethodPost && r.URL.Path == "/revoke":
		g.serveRevoke(w, r)
	case r.Method == http.MethodGet && r.URL.Path == "/youtube/v3/channels":
		g.serveChannels(w, r)
	case r.Method == http.MethodGet && r.URL.Path == "/youtube/v3/playlistItems":
		g.servePlaylist(w, r)
	case r.Method == http.MethodGet && r.URL.Path == "/youtube/v3/videos":
		g.serveVideos(w, r)
	default:
		writeTestJSON(w, http.StatusNotFound, map[string]any{"error": map[string]any{"status": "NOT_FOUND"}})
	}
}

func (g *fakeGoogle) serveToken(w http.ResponseWriter, r *http.Request) {
	g.mu.Lock()
	g.tokenCalls++
	g.mu.Unlock()
	if err := r.ParseForm(); err != nil {
		writeTestJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid_request"})
		return
	}
	if r.Form.Get("client_id") != "channel-client-id" || r.Form.Get("client_secret") != "channel-client-secret" {
		writeTestJSON(w, http.StatusUnauthorized, map[string]any{"error": "invalid_client"})
		return
	}
	switch r.Form.Get("grant_type") {
	case "authorization_code":
		g.mu.Lock()
		g.verifierSeen = r.Form.Get("code_verifier")
		g.mu.Unlock()
		switch r.Form.Get("code") {
		case "good-code":
			writeTestJSON(w, http.StatusOK, tokenBody("access-1", "refresh-1", ReadonlyScope))
		case "no-refresh":
			writeTestJSON(w, http.StatusOK, tokenBody("access-1", "", ReadonlyScope))
		case "no-readonly":
			writeTestJSON(w, http.StatusOK, tokenBody("access-1", "refresh-1", "openid email"))
		default:
			// The description must never reach callers; tests assert its absence.
			writeTestJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid_grant", "error_description": "secret description"})
		}
	case "refresh_token":
		g.mu.Lock()
		g.refreshCalls++
		g.mu.Unlock()
		if r.Form.Get("refresh_token") == "refresh-1" {
			writeTestJSON(w, http.StatusOK, tokenBody("access-2", "", ReadonlyScope))
			return
		}
		writeTestJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid_grant"})
	default:
		writeTestJSON(w, http.StatusBadRequest, map[string]any{"error": "unsupported_grant_type"})
	}
}

func tokenBody(access, refresh, scope string) map[string]any {
	body := map[string]any{"access_token": access, "scope": scope, "token_type": "Bearer", "expires_in": 3600}
	if refresh != "" {
		body["refresh_token"] = refresh
	}
	return body
}

func (g *fakeGoogle) serveRevoke(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		writeTestJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid_request"})
		return
	}
	token := r.Form.Get("token")
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.revokeFailure[token] {
		writeTestJSON(w, http.StatusInternalServerError, map[string]any{"error": "internal"})
		return
	}
	if token == "already-revoked" {
		writeTestJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid_token"})
		return
	}
	g.revoked = append(g.revoked, token)
	writeTestJSON(w, http.StatusOK, map[string]any{})
}

// authorized checks the bearer token. Only access-1 and access-2 are valid; any
// other token (such as the stale token in retry tests) gets a 401.
func (g *fakeGoogle) authorized(w http.ResponseWriter, r *http.Request) bool {
	header := r.Header.Get("Authorization")
	switch header {
	case "Bearer access-1", "Bearer access-2", "Bearer no-channel":
		return true
	}
	g.mu.Lock()
	g.unauthorized++
	g.mu.Unlock()
	writeTestJSON(w, http.StatusUnauthorized, map[string]any{"error": map[string]any{"code": 401, "status": "UNAUTHENTICATED"}})
	return false
}

func (g *fakeGoogle) serveChannels(w http.ResponseWriter, r *http.Request) {
	if !g.authorized(w, r) {
		return
	}
	if r.Header.Get("Authorization") == "Bearer no-channel" {
		writeTestJSON(w, http.StatusOK, map[string]any{"items": []any{}})
		return
	}
	writeTestJSON(w, http.StatusOK, map[string]any{"items": []any{map[string]any{
		"id":             "UCchannel1",
		"snippet":        map[string]any{"title": "Ana Creator", "thumbnails": map[string]any{"default": map[string]any{"url": "https://img.example/default.jpg"}, "medium": map[string]any{"url": "https://img.example/a.jpg"}}},
		"contentDetails": map[string]any{"relatedPlaylists": map[string]any{"uploads": testUploadsID}},
	}}})
}

func playlistEntry(videoID, title string) map[string]any {
	return map[string]any{
		"snippet":        map[string]any{"title": title, "resourceId": map[string]any{"videoId": videoID}},
		"contentDetails": map[string]any{"videoId": videoID},
	}
}

// servePlaylist returns the uploads in two pages: page one has a next token.
func (g *fakeGoogle) servePlaylist(w http.ResponseWriter, r *http.Request) {
	if !g.authorized(w, r) {
		return
	}
	g.mu.Lock()
	g.playlistCalls++
	g.mu.Unlock()
	if r.URL.Query().Get("playlistId") != testUploadsID {
		writeTestJSON(w, http.StatusNotFound, map[string]any{"error": map[string]any{"status": "NOT_FOUND"}})
		return
	}
	switch r.URL.Query().Get("pageToken") {
	case "":
		writeTestJSON(w, http.StatusOK, map[string]any{
			"nextPageToken": "page2",
			"items": []any{
				playlistEntry("AAAAAAAAAAA", "Intro episode"),
				playlistEntry("BBBBBBBBBBB", "Gaming clip"),
			},
		})
	case "page2":
		writeTestJSON(w, http.StatusOK, map[string]any{
			"items": []any{playlistEntry("CCCCCCCCCCC", "Intro part two")},
		})
	default:
		writeTestJSON(w, http.StatusBadRequest, map[string]any{"error": map[string]any{"status": "INVALID_ARGUMENT"}})
	}
}

// knownVideos maps synthetic IDs to privacy, duration and title fixtures.
var knownVideos = map[string]struct{ privacy, duration, title string }{
	"AAAAAAAAAAA": {"public", "PT1H2M3S", "Intro episode"},
	"BBBBBBBBBBB": {"unlisted", "PT45S", "Gaming clip"},
	"CCCCCCCCCCC": {"private", "P0D", "Intro part two"},
}

func (g *fakeGoogle) serveVideos(w http.ResponseWriter, r *http.Request) {
	if !g.authorized(w, r) {
		return
	}
	items := []any{}
	for _, id := range strings.Split(r.URL.Query().Get("id"), ",") {
		video, ok := knownVideos[id]
		if !ok {
			continue
		}
		items = append(items, map[string]any{
			"id":             id,
			"snippet":        map[string]any{"title": video.title, "publishedAt": "2026-11-01T10:00:00Z", "thumbnails": map[string]any{"medium": map[string]any{"url": "https://img.example/" + id + ".jpg"}}},
			"contentDetails": map[string]any{"duration": video.duration},
			"status":         map[string]any{"privacyStatus": video.privacy},
		})
	}
	writeTestJSON(w, http.StatusOK, map[string]any{"items": items})
}

func writeTestJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

// fakeStore is an in-memory Store that records writes.
type fakeStore struct {
	mu         sync.Mutex
	allowed    bool
	connection *Connection
	saved      []Connection
	deleted    []string
}

func (s *fakeStore) CanConnect(context.Context, string, int) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.allowed, nil
}

func (s *fakeStore) Connection(context.Context, string) (Connection, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.connection == nil {
		return Connection{}, ErrNotConnected
	}
	return *s.connection, nil
}

func (s *fakeStore) SaveConnection(_ context.Context, _ string, _ int, connection Connection) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.allowed {
		return ErrNotAllowed
	}
	saved := connection
	s.connection = &saved
	s.saved = append(s.saved, connection)
	return nil
}

func (s *fakeStore) UpdateCredentials(_ context.Context, _, _, credentials string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.connection != nil {
		s.connection.Credentials = credentials
	}
	return nil
}

func (s *fakeStore) DeleteConnection(_ context.Context, _, connectionID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.deleted = append(s.deleted, connectionID)
	s.connection = nil
	return nil
}

func newFakeStore(allowed bool) *fakeStore {
	return &fakeStore{allowed: allowed}
}

func (s *fakeStore) withConnection(t *testing.T, service *Service, token Token) {
	t.Helper()
	credentials, err := seal(service.vault, token, credentialPurpose(testUser))
	if err != nil {
		t.Fatal(err)
	}
	s.connection = &Connection{
		ID: testConnectionID, ChannelID: "UCchannel1", Title: "Ana Creator",
		UploadsPlaylistID: testUploadsID, Credentials: credentials,
	}
}

func freshToken(access, refresh string) Token {
	return Token{AccessToken: access, RefreshToken: refresh, Scope: ReadonlyScope, ExpiresAt: time.Now().Add(time.Hour)}
}

func newTestService(t *testing.T, store Store, g *fakeGoogle) *Service {
	t.Helper()
	service, err := NewService(store, g.client(t), testEncryptionKey)
	if err != nil {
		t.Fatal(err)
	}
	return service
}

func parseQuery(t *testing.T, raw string) url.Values {
	t.Helper()
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	return u.Query()
}
