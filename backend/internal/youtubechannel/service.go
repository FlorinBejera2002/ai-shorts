package youtubechannel

import (
	"context"
	"crypto/cipher"
	"crypto/hmac"
	"errors"
	"net/http"
	"strings"
	"time"

	"sneepcut/backend-go/internal/data"
)

const (
	authorizationPurpose = "youtube-channel-authorization"
	authorizationTTL     = 10 * time.Minute
	// refreshLeeway refreshes the access token before Google starts rejecting it.
	refreshLeeway = time.Minute
	// maxScanPages bounds how many playlist pages one request may read, which
	// bounds quota use when a search matches nothing.
	maxScanPages = 5
	// videoPageSize is the number of matching videos returned per request.
	videoPageSize  = 20
	videoBatchSize = playlistPageSize
)

// authorizationState travels in an encrypted, single-purpose browser cookie.
type authorizationState struct {
	State          string `json:"state"`
	Verifier       string `json:"verifier"`
	Locale         string `json:"locale"`
	UserID         string `json:"user_id"`
	SessionVersion int    `json:"session_version"`
	ExpiresAt      int64  `json:"expires_at"`
}

// Service owns the grant lifecycle: consent, token refresh, revocation and
// listing. It has no HTTP concerns.
type Service struct {
	store  Store
	client *Client
	vault  cipher.AEAD
	now    func() time.Time
}

// NewService returns a disabled service when client is nil.
func NewService(store Store, client *Client, encryptionKey string) (*Service, error) {
	service := &Service{store: store, client: client, now: time.Now}
	if client != nil {
		vault, err := newVault(encryptionKey)
		if err != nil {
			return nil, err
		}
		service.vault = vault
	}
	return service, nil
}

// Enabled reports whether the Google OAuth client for this feature is configured.
func (s *Service) Enabled() bool {
	return s.client != nil && s.vault != nil
}

func (s *Service) CanConnect(ctx context.Context, userID string, sessionVersion int) (bool, error) {
	return s.store.CanConnect(ctx, userID, sessionVersion)
}

// BeginAuthorization returns the Google consent URL and the sealed state cookie.
func (s *Service) BeginAuthorization(userID string, sessionVersion int, locale string) (string, string, error) {
	if !s.Enabled() {
		return "", "", ErrNotConfigured
	}
	state, err := randomSecret()
	if err != nil {
		return "", "", err
	}
	verifier, err := randomSecret()
	if err != nil {
		return "", "", err
	}
	target, err := s.client.AuthorizationURL(state, verifier, locale)
	if err != nil {
		return "", "", err
	}
	cookie, err := seal(s.vault, authorizationState{
		State: state, Verifier: verifier, Locale: locale, UserID: userID,
		SessionVersion: sessionVersion, ExpiresAt: s.now().Add(authorizationTTL).Unix(),
	}, authorizationPurpose)
	if err != nil {
		return "", "", err
	}
	return target, cookie, nil
}

// OpenAuthorization checks the state cookie against the callback's state parameter.
func (s *Service) OpenAuthorization(cookie, state string) (authorizationState, error) {
	var payload authorizationState
	if !s.Enabled() || open(s.vault, cookie, authorizationPurpose, &payload) != nil {
		return payload, errors.New("invalid YouTube channel authorization state")
	}
	if payload.State == "" || payload.ExpiresAt <= s.now().Unix() || !hmac.Equal([]byte(payload.State), []byte(state)) {
		return payload, errors.New("invalid YouTube channel authorization state")
	}
	return payload, nil
}

// CompleteAuthorization exchanges the code and stores the grant. A grant that
// cannot be stored is revoked so Google access never outlives the attempt.
func (s *Service) CompleteAuthorization(ctx context.Context, state authorizationState, code string) error {
	allowed, err := s.store.CanConnect(ctx, state.UserID, state.SessionVersion)
	if err != nil {
		return err
	}
	if !allowed {
		return ErrNotAllowed
	}
	token, err := s.client.Exchange(ctx, code, state.Verifier)
	if err != nil {
		return err
	}
	if !GrantsReadonly(token.Scope) || token.RefreshToken == "" {
		_ = s.client.Revoke(ctx, revocableToken(token))
		return ErrAccessNotGranted
	}
	channel, err := s.client.Channel(ctx, token.AccessToken)
	if err != nil {
		_ = s.client.Revoke(ctx, token.RefreshToken)
		return err
	}
	credentials, err := seal(s.vault, token, credentialPurpose(state.UserID))
	if err != nil {
		_ = s.client.Revoke(ctx, token.RefreshToken)
		return err
	}
	id, err := data.NewUUID()
	if err != nil {
		_ = s.client.Revoke(ctx, token.RefreshToken)
		return err
	}
	err = s.store.SaveConnection(ctx, state.UserID, state.SessionVersion, Connection{
		ID: id, ChannelID: channel.ID, Title: channel.Title, AvatarURL: channel.AvatarURL,
		UploadsPlaylistID: channel.UploadsPlaylistID, Credentials: credentials,
	})
	if err != nil {
		_ = s.client.Revoke(ctx, token.RefreshToken)
		return err
	}
	return nil
}

// Status reports configuration and the connected account, if any.
func (s *Service) Status(ctx context.Context, userID string) (Status, error) {
	status := Status{Enabled: s.Enabled()}
	connection, err := s.store.Connection(ctx, userID)
	if errors.Is(err, ErrNotConnected) {
		return status, nil
	}
	if err != nil {
		return status, err
	}
	status.Connected = true
	status.Account = &Account{ChannelID: connection.ChannelID, Title: connection.Title, AvatarURL: connection.AvatarURL}
	return status, nil
}

// Disconnect revokes the grant at Google, then deletes it locally. If Google
// cannot confirm revocation, the local grant is kept so the user can retry.
func (s *Service) Disconnect(ctx context.Context, userID string) error {
	connection, err := s.store.Connection(ctx, userID)
	if errors.Is(err, ErrNotConnected) {
		return nil
	}
	if err != nil {
		return err
	}
	if s.Enabled() {
		if token, openErr := s.openCredentials(userID, connection); openErr == nil {
			if err = s.client.Revoke(ctx, revocableToken(token)); err != nil {
				return ErrRevocationFailed
			}
		}
	}
	return s.store.DeleteConnection(ctx, userID, connection.ID)
}

func revocableToken(token Token) string {
	if token.RefreshToken != "" {
		return token.RefreshToken
	}
	return token.AccessToken
}

// ListVideos returns one page of the connected channel's uploads, matching the
// title search and visibility filter. It scans a bounded number of playlist
// pages, and NextPageToken resumes exactly where the scan stopped.
func (s *Service) ListVideos(ctx context.Context, userID string, query VideoQuery) (VideoPage, error) {
	connection, err := s.store.Connection(ctx, userID)
	if err != nil {
		return VideoPage{}, err
	}
	if !s.Enabled() {
		return VideoPage{}, ErrNotConfigured
	}
	query.Search = strings.ToLower(strings.TrimSpace(query.Search))
	page := VideoPage{Videos: []Video{}}
	token := query.PageToken
	for scanned := 0; scanned < maxScanPages; scanned++ {
		var items playlistPage
		err = s.withAccessToken(ctx, userID, &connection, func(accessToken string) error {
			var callErr error
			items, callErr = s.client.PlaylistItems(ctx, accessToken, connection.UploadsPlaylistID, token)
			return callErr
		})
		if err != nil {
			return VideoPage{}, err
		}
		matches, err := s.matchVideos(ctx, userID, &connection, items.Items, query)
		if err != nil {
			return VideoPage{}, err
		}
		page.Videos = append(page.Videos, matches...)
		token = items.NextPageToken
		if token == "" || len(page.Videos) >= videoPageSize {
			break
		}
	}
	if token != "" {
		page.NextPageToken = &token
	}
	return page, nil
}

// matchVideos applies the title search before fetching details, so only
// candidate videos cost a videos.list request.
func (s *Service) matchVideos(ctx context.Context, userID string, connection *Connection, items []playlistItem, query VideoQuery) ([]Video, error) {
	ids := make([]string, 0, len(items))
	for _, item := range items {
		if query.Search == "" || strings.Contains(strings.ToLower(item.Title), query.Search) {
			ids = append(ids, item.VideoID)
		}
	}
	var matches []Video
	for start := 0; start < len(ids); start += videoBatchSize {
		batch := ids[start:min(start+videoBatchSize, len(ids))]
		var details []Video
		err := s.withAccessToken(ctx, userID, connection, func(accessToken string) error {
			var callErr error
			details, callErr = s.client.Videos(ctx, accessToken, batch)
			return callErr
		})
		if err != nil {
			return nil, err
		}
		byID := make(map[string]Video, len(details))
		for _, video := range details {
			byID[video.ID] = video
		}
		for _, id := range batch {
			video, ok := byID[id]
			if ok && (query.Visibility == VisibilityAll || video.Visibility == query.Visibility) {
				matches = append(matches, video)
			}
		}
	}
	return matches, nil
}

// LookupVideos returns the requested videos that belong to the connected channel.
// Ids that are unknown, or that belong to another channel, are omitted, so the
// caller decides how to report them. It makes one videos.list request per batch.
func (s *Service) LookupVideos(ctx context.Context, userID string, ids []string) ([]Video, error) {
	connection, err := s.store.Connection(ctx, userID)
	if err != nil {
		return nil, err
	}
	if !s.Enabled() {
		return nil, ErrNotConfigured
	}
	owned := make([]Video, 0, len(ids))
	for start := 0; start < len(ids); start += videoBatchSize {
		batch := ids[start:min(start+videoBatchSize, len(ids))]
		var details []Video
		err = s.withAccessToken(ctx, userID, &connection, func(accessToken string) error {
			var callErr error
			details, callErr = s.client.Videos(ctx, accessToken, batch)
			return callErr
		})
		if err != nil {
			return nil, err
		}
		for _, video := range details {
			if video.ChannelID == connection.ChannelID {
				owned = append(owned, video)
			}
		}
	}
	return owned, nil
}

func (s *Service) openCredentials(userID string, connection Connection) (Token, error) {
	var token Token
	err := open(s.vault, connection.Credentials, credentialPurpose(userID), &token)
	return token, err
}

// withAccessToken runs call with a usable access token. It refreshes a token
// that is about to expire, and retries once after Google rejects the access token.
func (s *Service) withAccessToken(ctx context.Context, userID string, connection *Connection, call func(accessToken string) error) error {
	token, err := s.openCredentials(userID, *connection)
	if err != nil {
		if deleteErr := s.store.DeleteConnection(ctx, userID, connection.ID); deleteErr != nil {
			return deleteErr
		}
		return ErrNotConnected
	}
	if s.now().Add(refreshLeeway).After(token.ExpiresAt) {
		if token, err = s.refresh(ctx, userID, connection, token); err != nil {
			return err
		}
	}
	err = call(token.AccessToken)
	var apiErr *APIError
	if errors.As(err, &apiErr) && apiErr.StatusCode == http.StatusUnauthorized {
		token, err = s.refresh(ctx, userID, connection, token)
		if err != nil {
			return err
		}
		return call(token.AccessToken)
	}
	return err
}

// refresh stores the new token. A refresh token Google rejects removes the
// connection, because only a new consent can restore access.
func (s *Service) refresh(ctx context.Context, userID string, connection *Connection, previous Token) (Token, error) {
	token, err := s.client.Refresh(ctx, previous)
	if err != nil {
		var apiErr *APIError
		if errors.Is(err, ErrReauthorize) || (errors.As(err, &apiErr) && apiErr.Code == "invalid_grant") {
			if deleteErr := s.store.DeleteConnection(ctx, userID, connection.ID); deleteErr != nil {
				return Token{}, deleteErr
			}
			return Token{}, ErrNotConnected
		}
		return Token{}, err
	}
	credentials, err := seal(s.vault, token, credentialPurpose(userID))
	if err != nil {
		return Token{}, err
	}
	if err = s.store.UpdateCredentials(ctx, userID, connection.ID, credentials); err != nil {
		return Token{}, err
	}
	connection.Credentials = credentials
	return token, nil
}
