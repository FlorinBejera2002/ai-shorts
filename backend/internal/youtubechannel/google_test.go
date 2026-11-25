package youtubechannel

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestAuthorizationURLRequestsOnlyReadonlyOfflineWithPKCE(t *testing.T) {
	client := newFakeGoogle(t).client(t)
	verifier := strings.Repeat("a", 43)
	target, err := client.AuthorizationURL("state-value", verifier, "ro")
	if err != nil {
		t.Fatal(err)
	}
	query := parseQuery(t, target)
	challenge := sha256.Sum256([]byte(verifier))
	checks := map[string]string{
		"scope":                 ReadonlyScope,
		"access_type":           "offline",
		"prompt":                "consent",
		"response_type":         "code",
		"code_challenge_method": "S256",
		"code_challenge":        base64.RawURLEncoding.EncodeToString(challenge[:]),
		"state":                 "state-value",
		"redirect_uri":          testCallbackURL,
		"hl":                    "ro",
	}
	for key, want := range checks {
		if got := query.Get(key); got != want {
			t.Fatalf("%s = %q, want %q", key, got, want)
		}
	}
}

func TestAuthorizationURLRejectsShortVerifier(t *testing.T) {
	client := newFakeGoogle(t).client(t)
	if _, err := client.AuthorizationURL("state", "short", "en"); err == nil {
		t.Fatal("accepted a PKCE verifier below the RFC 7636 length")
	}
}

func TestNewClientRejectsPlainHTTPEndpointsAndCallbacks(t *testing.T) {
	g := newFakeGoogle(t)
	bad := ClientConfig{ClientID: "id", ClientSecret: "secret", RedirectURL: testCallbackURL, HTTPClient: g.server.Client(), Endpoints: g.endpoints()}
	bad.Endpoints.TokenURL = "http://oauth.example/token"
	if _, err := NewClient(bad); err == nil {
		t.Fatal("accepted a plain HTTP token endpoint")
	}
	bad = ClientConfig{ClientID: "id", ClientSecret: "secret", RedirectURL: "http://sneepcut.example/cb"}
	if _, err := NewClient(bad); err == nil {
		t.Fatal("accepted a plain HTTP callback on a public host")
	}
	if _, err := NewClient(ClientConfig{ClientID: "id", RedirectURL: testCallbackURL}); err == nil {
		t.Fatal("accepted a client without a secret")
	}
}

func TestExchangeReturnsGrantAndHidesUpstreamText(t *testing.T) {
	g := newFakeGoogle(t)
	client := g.client(t)
	token, err := client.Exchange(context.Background(), "good-code", strings.Repeat("v", 43))
	if err != nil {
		t.Fatal(err)
	}
	if token.AccessToken != "access-1" || token.RefreshToken != "refresh-1" || !GrantsReadonly(token.Scope) {
		t.Fatalf("unexpected grant: %+v", token)
	}
	if time.Until(token.ExpiresAt) < 50*time.Minute {
		t.Fatalf("expiry not derived from expires_in: %s", token.ExpiresAt)
	}
	_, err = client.Exchange(context.Background(), "bad", strings.Repeat("v", 43))
	var apiErr *APIError
	if !errors.As(err, &apiErr) || apiErr.Code != "invalid_grant" {
		t.Fatalf("unexpected error %v", err)
	}
	if strings.Contains(err.Error(), "secret description") {
		t.Fatal("upstream error description leaked into the error")
	}
}

func TestRefreshKeepsRefreshTokenWhenGoogleOmitsIt(t *testing.T) {
	g := newFakeGoogle(t)
	client := g.client(t)
	token, err := client.Refresh(context.Background(), Token{RefreshToken: "refresh-1", Scope: ReadonlyScope})
	if err != nil {
		t.Fatal(err)
	}
	if token.AccessToken != "access-2" || token.RefreshToken != "refresh-1" || token.Scope != ReadonlyScope {
		t.Fatalf("refresh did not keep the grant: %+v", token)
	}
	if g.refreshCalls != 1 {
		t.Fatalf("refresh calls = %d", g.refreshCalls)
	}
	if _, err = client.Refresh(context.Background(), Token{}); !errors.Is(err, ErrReauthorize) {
		t.Fatalf("refresh without a refresh token returned %v", err)
	}
}

func TestChannelReturnsOwnChannelAndUploadsPlaylist(t *testing.T) {
	client := newFakeGoogle(t).client(t)
	channel, err := client.Channel(context.Background(), "access-1")
	if err != nil {
		t.Fatal(err)
	}
	if channel.ID != "UCchannel1" || channel.UploadsPlaylistID != testUploadsID || channel.Title != "Ana Creator" {
		t.Fatalf("unexpected channel: %+v", channel)
	}
	if channel.AvatarURL == nil || *channel.AvatarURL != "https://img.example/a.jpg" {
		t.Fatalf("avatar not chosen from the medium thumbnail: %v", channel.AvatarURL)
	}
	if _, err = client.Channel(context.Background(), "no-channel"); !errors.Is(err, ErrNoChannel) {
		t.Fatalf("account without a channel returned %v", err)
	}
}

func TestPlaylistAndVideoDetailsAreNormalised(t *testing.T) {
	client := newFakeGoogle(t).client(t)
	page, err := client.PlaylistItems(context.Background(), "access-1", testUploadsID, "")
	if err != nil {
		t.Fatal(err)
	}
	if page.NextPageToken != "page2" || len(page.Items) != 2 || page.Items[0].VideoID != "AAAAAAAAAAA" {
		t.Fatalf("unexpected first page: %+v", page)
	}
	videos, err := client.Videos(context.Background(), "access-1", []string{"AAAAAAAAAAA", "ZZZZZZZZZZZ", "BBBBBBBBBBB"})
	if err != nil {
		t.Fatal(err)
	}
	if len(videos) != 2 {
		t.Fatalf("unknown IDs must be omitted, got %d videos", len(videos))
	}
	first := videos[0]
	if first.Visibility != VisibilityPublic || first.DurationSeconds != 3723 || first.URL != "https://www.youtube.com/watch?v=AAAAAAAAAAA" || first.ThumbnailURL == nil {
		t.Fatalf("unexpected video: %+v", first)
	}
}

func TestRevokeTreatsAlreadyRevokedTokenAsDone(t *testing.T) {
	g := newFakeGoogle(t)
	client := g.client(t)
	if err := client.Revoke(context.Background(), "already-revoked"); err != nil {
		t.Fatalf("already revoked token returned %v", err)
	}
	if err := client.Revoke(context.Background(), "refresh-1"); err != nil {
		t.Fatal(err)
	}
	if len(g.revoked) != 1 || g.revoked[0] != "refresh-1" {
		t.Fatalf("revoked = %v", g.revoked)
	}
	if err := client.Revoke(context.Background(), " "); err == nil {
		t.Fatal("empty token was sent to Google")
	}
}

func TestGrantsReadonlyRequiresExactScope(t *testing.T) {
	if GrantsReadonly("https://www.googleapis.com/auth/youtube") || GrantsReadonly("openid email") {
		t.Fatal("broader or unrelated scopes counted as read-only access")
	}
	if !GrantsReadonly("openid " + ReadonlyScope) {
		t.Fatal("read-only scope in a scope list was not recognised")
	}
}

func TestParseISODuration(t *testing.T) {
	tests := map[string]int{
		"PT1H2M3S": 3723,
		"PT45S":    45,
		"P0D":      0,
		"P1DT2M":   86520,
		"PT":       0,
		"garbage":  0,
	}
	for input, want := range tests {
		if got := parseISODuration(input); got != want {
			t.Fatalf("parseISODuration(%q) = %d, want %d", input, got, want)
		}
	}
}

func TestValidPageTokenAcceptsOnlyOpaqueTokens(t *testing.T) {
	if !validPageToken("") || !validPageToken("CAUQAA_-") {
		t.Fatal("valid tokens rejected")
	}
	if validPageToken("a b") || validPageToken("x&y=1") || validPageToken(strings.Repeat("a", 513)) {
		t.Fatal("unsafe token accepted")
	}
}
