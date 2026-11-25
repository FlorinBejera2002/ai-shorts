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

func TestCompleteAuthorizationStoresReadonlyGrantBoundToPKCE(t *testing.T) {
	g := newFakeGoogle(t)
	store := newFakeStore(true)
	service := newTestService(t, store, g)
	target, cookie, err := service.BeginAuthorization(testUser, testSessionVer, "en")
	if err != nil {
		t.Fatal(err)
	}
	state, err := service.OpenAuthorization(cookie, parseQuery(t, target).Get("state"))
	if err != nil {
		t.Fatal(err)
	}
	if err = service.CompleteAuthorization(context.Background(), state, "good-code"); err != nil {
		t.Fatal(err)
	}
	if store.connection == nil || store.connection.ChannelID != "UCchannel1" || store.connection.UploadsPlaylistID != testUploadsID {
		t.Fatalf("connection not stored: %+v", store.connection)
	}
	if strings.Contains(store.connection.Credentials, "refresh-1") || strings.Contains(store.connection.Credentials, "access-1") {
		t.Fatal("credentials were stored in plain text")
	}
	challenge := sha256.Sum256([]byte(state.Verifier))
	if parseQuery(t, target).Get("code_challenge") != base64.RawURLEncoding.EncodeToString(challenge[:]) {
		t.Fatal("authorization challenge does not match the sealed verifier")
	}
	if g.verifierSeen != state.Verifier {
		t.Fatal("token exchange did not send the sealed PKCE verifier")
	}
}

func TestOpenAuthorizationRejectsForgedOrExpiredState(t *testing.T) {
	g := newFakeGoogle(t)
	service := newTestService(t, newFakeStore(true), g)
	target, cookie, err := service.BeginAuthorization(testUser, testSessionVer, "en")
	if err != nil {
		t.Fatal(err)
	}
	state := parseQuery(t, target).Get("state")
	if _, err = service.OpenAuthorization(cookie, "other-state"); err == nil {
		t.Fatal("accepted a mismatched state parameter")
	}
	if _, err = service.OpenAuthorization(cookie+"x", state); err == nil {
		t.Fatal("accepted a tampered cookie")
	}
	service.now = func() time.Time { return time.Now().Add(11 * time.Minute) }
	if _, err = service.OpenAuthorization(cookie, state); err == nil {
		t.Fatal("accepted an expired authorization state")
	}
}

func TestCompleteAuthorizationRefusesAccountsThatCannotConnect(t *testing.T) {
	g := newFakeGoogle(t)
	service := newTestService(t, newFakeStore(false), g)
	target, cookie, err := service.BeginAuthorization(testUser, testSessionVer, "en")
	if err != nil {
		t.Fatal(err)
	}
	state, err := service.OpenAuthorization(cookie, parseQuery(t, target).Get("state"))
	if err != nil {
		t.Fatal(err)
	}
	if err = service.CompleteAuthorization(context.Background(), state, "good-code"); !errors.Is(err, ErrNotAllowed) {
		t.Fatalf("unauthorised account returned %v", err)
	}
	if g.tokenCalls != 0 {
		t.Fatal("token exchange ran for an account that cannot connect")
	}
}

func TestCompleteAuthorizationRevokesGrantWithoutReadonlyAccess(t *testing.T) {
	for _, code := range []string{"no-readonly", "no-refresh"} {
		g := newFakeGoogle(t)
		store := newFakeStore(true)
		service := newTestService(t, store, g)
		state := authorizationState{Verifier: strings.Repeat("v", 43), UserID: testUser, SessionVersion: testSessionVer, Locale: "en"}
		err := service.CompleteAuthorization(context.Background(), state, code)
		if !errors.Is(err, ErrAccessNotGranted) {
			t.Fatalf("%s returned %v", code, err)
		}
		if store.connection != nil {
			t.Fatalf("%s stored an unusable grant", code)
		}
		if len(g.revoked) != 1 {
			t.Fatalf("%s did not revoke the unusable grant: %v", code, g.revoked)
		}
	}
}

func TestListVideosPaginatesAndFiltersByVisibilityAndTitle(t *testing.T) {
	g := newFakeGoogle(t)
	store := newFakeStore(true)
	service := newTestService(t, store, g)
	store.withConnection(t, service, freshToken("access-1", "refresh-1"))

	all, err := service.ListVideos(context.Background(), testUser, VideoQuery{Visibility: VisibilityAll})
	if err != nil {
		t.Fatal(err)
	}
	if len(all.Videos) != 3 || all.NextPageToken != nil || g.playlistCalls != 2 {
		t.Fatalf("all: %d videos, next=%v, playlist calls=%d", len(all.Videos), all.NextPageToken, g.playlistCalls)
	}

	public, err := service.ListVideos(context.Background(), testUser, VideoQuery{Visibility: VisibilityPublic})
	if err != nil {
		t.Fatal(err)
	}
	if len(public.Videos) != 1 || public.Videos[0].ID != "AAAAAAAAAAA" {
		t.Fatalf("public filter returned %+v", public.Videos)
	}

	searched, err := service.ListVideos(context.Background(), testUser, VideoQuery{Search: "  INTRO ", Visibility: VisibilityAll})
	if err != nil {
		t.Fatal(err)
	}
	if len(searched.Videos) != 2 || searched.Videos[1].ID != "CCCCCCCCCCC" {
		t.Fatalf("title search returned %+v", searched.Videos)
	}

	second, err := service.ListVideos(context.Background(), testUser, VideoQuery{Visibility: VisibilityAll, PageToken: "page2"})
	if err != nil {
		t.Fatal(err)
	}
	if len(second.Videos) != 1 || second.Videos[0].ID != "CCCCCCCCCCC" || second.NextPageToken != nil {
		t.Fatalf("page two returned %+v next=%v", second.Videos, second.NextPageToken)
	}
}

func TestListVideosRetriesOnceAfterGoogleRejectsAccessToken(t *testing.T) {
	g := newFakeGoogle(t)
	store := newFakeStore(true)
	service := newTestService(t, store, g)
	store.withConnection(t, service, freshToken("stale", "refresh-1"))

	page, err := service.ListVideos(context.Background(), testUser, VideoQuery{Visibility: VisibilityAll})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Videos) == 0 {
		t.Fatal("no videos after refreshing the access token")
	}
	if g.unauthorized != 1 || g.refreshCalls != 1 {
		t.Fatalf("unauthorized=%d refreshes=%d, want 1 and 1", g.unauthorized, g.refreshCalls)
	}
	stored, err := service.openCredentials(testUser, *store.connection)
	if err != nil || stored.AccessToken != "access-2" || stored.RefreshToken != "refresh-1" {
		t.Fatalf("refreshed grant not persisted: %+v err=%v", stored, err)
	}
}

func TestListVideosRefreshesExpiredTokenBeforeCalling(t *testing.T) {
	g := newFakeGoogle(t)
	store := newFakeStore(true)
	service := newTestService(t, store, g)
	expired := freshToken("stale", "refresh-1")
	expired.ExpiresAt = time.Now().Add(-time.Minute)
	store.withConnection(t, service, expired)

	if _, err := service.ListVideos(context.Background(), testUser, VideoQuery{Visibility: VisibilityAll}); err != nil {
		t.Fatal(err)
	}
	if g.unauthorized != 0 || g.refreshCalls != 1 {
		t.Fatalf("expired token was sent to Google: unauthorized=%d refreshes=%d", g.unauthorized, g.refreshCalls)
	}
}

func TestRejectedRefreshTokenRemovesConnection(t *testing.T) {
	g := newFakeGoogle(t)
	store := newFakeStore(true)
	service := newTestService(t, store, g)
	store.withConnection(t, service, freshToken("stale", "revoked-refresh"))

	_, err := service.ListVideos(context.Background(), testUser, VideoQuery{Visibility: VisibilityAll})
	if !errors.Is(err, ErrNotConnected) {
		t.Fatalf("rejected refresh returned %v", err)
	}
	if store.connection != nil || len(store.deleted) != 1 || store.deleted[0] != testConnectionID {
		t.Fatalf("connection not removed: %+v deleted=%v", store.connection, store.deleted)
	}
}

func TestListVideosWithoutConnectionReportsNotConnected(t *testing.T) {
	service := newTestService(t, newFakeStore(true), newFakeGoogle(t))
	if _, err := service.ListVideos(context.Background(), testUser, VideoQuery{Visibility: VisibilityAll}); !errors.Is(err, ErrNotConnected) {
		t.Fatalf("returned %v", err)
	}
}

func TestDisconnectRevokesRefreshTokenAndDeletesConnection(t *testing.T) {
	g := newFakeGoogle(t)
	store := newFakeStore(true)
	service := newTestService(t, store, g)
	store.withConnection(t, service, freshToken("access-1", "refresh-1"))

	if err := service.Disconnect(context.Background(), testUser); err != nil {
		t.Fatal(err)
	}
	if len(g.revoked) != 1 || g.revoked[0] != "refresh-1" {
		t.Fatalf("revoked = %v", g.revoked)
	}
	if store.connection != nil || len(store.deleted) != 1 {
		t.Fatalf("connection kept: %+v deleted=%v", store.connection, store.deleted)
	}
}

func TestDisconnectKeepsGrantWhenGoogleCannotRevoke(t *testing.T) {
	g := newFakeGoogle(t)
	g.revokeFailure["refresh-1"] = true
	store := newFakeStore(true)
	service := newTestService(t, store, g)
	store.withConnection(t, service, freshToken("access-1", "refresh-1"))

	if err := service.Disconnect(context.Background(), testUser); !errors.Is(err, ErrRevocationFailed) {
		t.Fatalf("returned %v", err)
	}
	if store.connection == nil || len(store.deleted) != 0 {
		t.Fatal("local grant deleted although Google may still honour it")
	}
}

func TestDisconnectWithoutConnectionIsIdempotent(t *testing.T) {
	service := newTestService(t, newFakeStore(true), newFakeGoogle(t))
	if err := service.Disconnect(context.Background(), testUser); err != nil {
		t.Fatal(err)
	}
}

func TestStatusNeverExposesCredentialsAndReportsDisabledClient(t *testing.T) {
	store := newFakeStore(true)
	disabled, err := NewService(store, nil, "")
	if err != nil {
		t.Fatal(err)
	}
	status, err := disabled.Status(context.Background(), testUser)
	if err != nil || status.Enabled || status.Connected || status.Account != nil {
		t.Fatalf("disabled status = %+v err=%v", status, err)
	}

	g := newFakeGoogle(t)
	enabled := newTestService(t, store, g)
	store.withConnection(t, enabled, freshToken("access-1", "refresh-1"))
	status, err = enabled.Status(context.Background(), testUser)
	if err != nil || !status.Enabled || !status.Connected || status.Account == nil || status.Account.ChannelID != "UCchannel1" {
		t.Fatalf("connected status = %+v err=%v", status, err)
	}
}

func TestNewServiceRejectsWeakEncryptionKey(t *testing.T) {
	g := newFakeGoogle(t)
	if _, err := NewService(newFakeStore(true), g.client(t), "not-base64-32-bytes"); err == nil {
		t.Fatal("accepted an invalid encryption key")
	}
}
