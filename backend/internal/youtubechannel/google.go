package youtubechannel

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	defaultAuthorizationURL = "https://accounts.google.com/o/oauth2/v2/auth"
	defaultTokenURL         = "https://oauth2.googleapis.com/token"
	defaultRevokeURL        = "https://oauth2.googleapis.com/revoke"
	defaultAPIBaseURL       = "https://www.googleapis.com/youtube/v3"
	maxResponseBytes        = 1 << 20
	maxTitleRunes           = 300
	playlistPageSize        = 50
	videoIDLength           = 11
)

// Endpoints lets isolated HTTPS test servers replace Google's fixed endpoints.
// Production callers leave ClientConfig.Endpoints nil.
type Endpoints struct {
	AuthorizationURL string
	TokenURL         string
	APIBaseURL       string
	RevokeURL        string
}

type ClientConfig struct {
	ClientID     string
	ClientSecret string
	RedirectURL  string
	HTTPClient   *http.Client
	Endpoints    *Endpoints
}

// Client talks to Google's OAuth and YouTube Data API v3 endpoints.
type Client struct {
	config    ClientConfig
	endpoints Endpoints
	http      *http.Client
}

// Token is the decrypted grant. RefreshToken is kept only in encrypted storage.
type Token struct {
	AccessToken  string    `json:"access_token"`
	RefreshToken string    `json:"refresh_token,omitempty"`
	Scope        string    `json:"scope"`
	ExpiresAt    time.Time `json:"expires_at"`
}

// ChannelInfo identifies the connected channel and its uploads playlist.
type ChannelInfo struct {
	ID                string
	Title             string
	AvatarURL         *string
	UploadsPlaylistID string
}

type playlistItem struct {
	VideoID string
	Title   string
}

type playlistPage struct {
	Items         []playlistItem
	NextPageToken string
}

// APIError deliberately omits Google's descriptions, which can echo codes or tokens.
type APIError struct {
	StatusCode int
	Code       string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("YouTube request failed (%d, %s)", e.StatusCode, e.Code)
}

// NewClient validates the OAuth client and its callback before any request is made.
func NewClient(config ClientConfig) (*Client, error) {
	if strings.TrimSpace(config.ClientID) == "" || strings.TrimSpace(config.ClientSecret) == "" {
		return nil, errors.New("YouTube channel credentials are not configured")
	}
	if !validCallbackURL(config.RedirectURL) {
		return nil, errors.New("invalid YouTube channel callback URL")
	}
	endpoints := Endpoints{
		AuthorizationURL: defaultAuthorizationURL,
		TokenURL:         defaultTokenURL,
		APIBaseURL:       defaultAPIBaseURL,
		RevokeURL:        defaultRevokeURL,
	}
	if config.Endpoints != nil {
		endpoints = *config.Endpoints
	}
	for _, endpoint := range []string{endpoints.AuthorizationURL, endpoints.TokenURL, endpoints.APIBaseURL, endpoints.RevokeURL} {
		if !validEndpoint(endpoint) {
			return nil, errors.New("YouTube channel endpoints must use HTTPS")
		}
	}
	client := http.Client{Timeout: 20 * time.Second}
	if config.HTTPClient != nil {
		client = *config.HTTPClient
		if client.Timeout <= 0 {
			client.Timeout = 20 * time.Second
		}
	}
	client.Jar = nil
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	return &Client{config: config, endpoints: endpoints, http: &client}, nil
}

func validCallbackURL(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return false
	}
	return u.Scheme == "https" || (u.Scheme == "http" && (u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1" || u.Hostname() == "::1"))
}

func validEndpoint(raw string) bool {
	u, err := url.Parse(raw)
	return err == nil && u.Scheme == "https" && u.Host != "" && u.User == nil && u.RawQuery == "" && u.Fragment == ""
}

// GrantsReadonly reports whether a Google scope string includes read-only access.
func GrantsReadonly(scope string) bool {
	for _, granted := range strings.Fields(scope) {
		if granted == ReadonlyScope {
			return true
		}
	}
	return false
}

func validVerifier(verifier string) bool {
	if len(verifier) < 43 || len(verifier) > 128 {
		return false
	}
	for _, c := range verifier {
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || strings.ContainsRune("-._~", c)) {
			return false
		}
	}
	return true
}

// AuthorizationURL builds a PKCE consent request for read-only, offline access.
func (c *Client) AuthorizationURL(state, verifier, locale string) (string, error) {
	if state == "" || !validVerifier(verifier) {
		return "", errors.New("invalid YouTube channel authorization state")
	}
	u, err := url.Parse(c.endpoints.AuthorizationURL)
	if err != nil {
		return "", err
	}
	challenge := sha256.Sum256([]byte(verifier))
	values := url.Values{
		"client_id":              {c.config.ClientID},
		"redirect_uri":           {c.config.RedirectURL},
		"response_type":          {"code"},
		"scope":                  {ReadonlyScope},
		"state":                  {state},
		"code_challenge":         {base64.RawURLEncoding.EncodeToString(challenge[:])},
		"code_challenge_method":  {"S256"},
		"access_type":            {"offline"},
		"prompt":                 {"consent"},
		"include_granted_scopes": {"false"},
	}
	if locale == "ro" {
		values.Set("hl", "ro")
	}
	u.RawQuery = values.Encode()
	return u.String(), nil
}

// Exchange trades the authorization code for a grant. The caller checks scopes.
func (c *Client) Exchange(ctx context.Context, code, verifier string) (Token, error) {
	if strings.TrimSpace(code) == "" || len(code) > 4096 || !validVerifier(verifier) {
		return Token{}, errors.New("invalid YouTube channel authorization code")
	}
	return c.tokenRequest(ctx, url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {code},
		"redirect_uri":  {c.config.RedirectURL},
		"code_verifier": {verifier},
	}, Token{})
}

// Refresh returns a new access token. Google may omit the refresh token, so the
// previous one is kept.
func (c *Client) Refresh(ctx context.Context, previous Token) (Token, error) {
	if previous.RefreshToken == "" {
		return Token{}, ErrReauthorize
	}
	return c.tokenRequest(ctx, url.Values{
		"grant_type":    {"refresh_token"},
		"refresh_token": {previous.RefreshToken},
	}, previous)
}

func (c *Client) tokenRequest(ctx context.Context, form url.Values, previous Token) (Token, error) {
	form.Set("client_id", c.config.ClientID)
	form.Set("client_secret", c.config.ClientSecret)
	var response struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		Scope        string `json:"scope"`
		TokenType    string `json:"token_type"`
		ExpiresIn    int64  `json:"expires_in"`
	}
	body := strings.NewReader(form.Encode())
	if err := c.do(ctx, http.MethodPost, c.endpoints.TokenURL, "", "application/x-www-form-urlencoded", body, &response); err != nil {
		return Token{}, err
	}
	if response.AccessToken == "" || response.ExpiresIn <= 0 || response.ExpiresIn > 86400 || (response.TokenType != "" && !strings.EqualFold(response.TokenType, "Bearer")) {
		return Token{}, errors.New("invalid YouTube channel token response")
	}
	if response.RefreshToken == "" {
		response.RefreshToken = previous.RefreshToken
	}
	if response.Scope == "" {
		response.Scope = previous.Scope
	}
	return Token{
		AccessToken:  response.AccessToken,
		RefreshToken: response.RefreshToken,
		Scope:        response.Scope,
		ExpiresAt:    time.Now().UTC().Add(time.Duration(response.ExpiresIn) * time.Second),
	}, nil
}

// Revoke invalidates a token at Google. An already invalid token counts as revoked.
func (c *Client) Revoke(ctx context.Context, token string) error {
	if strings.TrimSpace(token) == "" {
		return errors.New("YouTube channel token is missing")
	}
	body := strings.NewReader(url.Values{"token": {token}}.Encode())
	err := c.do(ctx, http.MethodPost, c.endpoints.RevokeURL, "", "application/x-www-form-urlencoded", body, nil)
	var apiErr *APIError
	if errors.As(err, &apiErr) && apiErr.StatusCode == http.StatusBadRequest && apiErr.Code == "invalid_token" {
		return nil
	}
	return err
}

func (c *Client) apiURL(path string, query url.Values) string {
	return strings.TrimRight(c.endpoints.APIBaseURL, "/") + path + "?" + query.Encode()
}

type thumbnail struct {
	URL string `json:"url"`
}

type thumbnailSet map[string]thumbnail

// bestThumbnail returns the first HTTPS thumbnail in preference order.
func bestThumbnail(set thumbnailSet, preferred ...string) *string {
	for _, size := range preferred {
		if value := set[size].URL; strings.HasPrefix(value, "https://") && len(value) <= 2048 {
			return &value
		}
	}
	return nil
}

// Channel returns the authenticated user's own channel (channels.list mine=true).
func (c *Client) Channel(ctx context.Context, accessToken string) (ChannelInfo, error) {
	var response struct {
		Items []struct {
			ID      string `json:"id"`
			Snippet struct {
				Title      string       `json:"title"`
				Thumbnails thumbnailSet `json:"thumbnails"`
			} `json:"snippet"`
			ContentDetails struct {
				RelatedPlaylists struct {
					Uploads string `json:"uploads"`
				} `json:"relatedPlaylists"`
			} `json:"contentDetails"`
		} `json:"items"`
	}
	query := url.Values{"part": {"snippet,contentDetails"}, "mine": {"true"}}
	if err := c.do(ctx, http.MethodGet, c.apiURL("/channels", query), accessToken, "", nil, &response); err != nil {
		return ChannelInfo{}, err
	}
	if len(response.Items) == 0 {
		return ChannelInfo{}, ErrNoChannel
	}
	item := response.Items[0]
	uploads := item.ContentDetails.RelatedPlaylists.Uploads
	if item.ID == "" || uploads == "" || !validPageToken(item.ID) || !validPageToken(uploads) {
		return ChannelInfo{}, ErrNoChannel
	}
	return ChannelInfo{
		ID:                item.ID,
		Title:             safeTitle(item.Snippet.Title, "YouTube channel"),
		AvatarURL:         bestThumbnail(item.Snippet.Thumbnails, "medium", "default", "high"),
		UploadsPlaylistID: uploads,
	}, nil
}

// PlaylistItems returns one page of the uploads playlist.
func (c *Client) PlaylistItems(ctx context.Context, accessToken, playlistID, pageToken string) (playlistPage, error) {
	var response struct {
		NextPageToken string `json:"nextPageToken"`
		Items         []struct {
			Snippet struct {
				Title      string `json:"title"`
				ResourceID struct {
					VideoID string `json:"videoId"`
				} `json:"resourceId"`
			} `json:"snippet"`
			ContentDetails struct {
				VideoID string `json:"videoId"`
			} `json:"contentDetails"`
		} `json:"items"`
	}
	query := url.Values{"part": {"snippet,contentDetails"}, "playlistId": {playlistID}, "maxResults": {strconv.Itoa(playlistPageSize)}}
	if pageToken != "" {
		query.Set("pageToken", pageToken)
	}
	if err := c.do(ctx, http.MethodGet, c.apiURL("/playlistItems", query), accessToken, "", nil, &response); err != nil {
		return playlistPage{}, err
	}
	if !validPageToken(response.NextPageToken) {
		return playlistPage{}, errors.New("invalid YouTube channel playlist response")
	}
	page := playlistPage{NextPageToken: response.NextPageToken}
	for _, item := range response.Items {
		videoID := item.ContentDetails.VideoID
		if videoID == "" {
			videoID = item.Snippet.ResourceID.VideoID
		}
		if !validVideoID(videoID) {
			continue
		}
		page.Items = append(page.Items, playlistItem{VideoID: videoID, Title: safeTitle(item.Snippet.Title, "Untitled video")})
	}
	return page, nil
}

// Videos returns details for up to one playlist page of video IDs. Videos the
// API no longer returns (deleted or inaccessible) are omitted.
func (c *Client) Videos(ctx context.Context, accessToken string, ids []string) ([]Video, error) {
	if len(ids) == 0 || len(ids) > playlistPageSize {
		return nil, errors.New("invalid YouTube channel video request")
	}
	var response struct {
		Items []struct {
			ID      string `json:"id"`
			Snippet struct {
				Title       string       `json:"title"`
				ChannelID   string       `json:"channelId"`
				PublishedAt string       `json:"publishedAt"`
				Thumbnails  thumbnailSet `json:"thumbnails"`
			} `json:"snippet"`
			ContentDetails struct {
				Duration string `json:"duration"`
			} `json:"contentDetails"`
			Status struct {
				PrivacyStatus string `json:"privacyStatus"`
			} `json:"status"`
		} `json:"items"`
	}
	query := url.Values{"part": {"snippet,contentDetails,status"}, "id": {strings.Join(ids, ",")}, "maxResults": {strconv.Itoa(len(ids))}}
	if err := c.do(ctx, http.MethodGet, c.apiURL("/videos", query), accessToken, "", nil, &response); err != nil {
		return nil, err
	}
	videos := make([]Video, 0, len(response.Items))
	for _, item := range response.Items {
		visibility := item.Status.PrivacyStatus
		if !validVideoID(item.ID) || (visibility != VisibilityPublic && visibility != VisibilityUnlisted && visibility != VisibilityPrivate) {
			continue
		}
		videos = append(videos, Video{
			ID:              item.ID,
			Title:           safeTitle(item.Snippet.Title, "Untitled video"),
			DurationSeconds: parseISODuration(item.ContentDetails.Duration),
			PublishedAt:     item.Snippet.PublishedAt,
			Visibility:      visibility,
			ThumbnailURL:    bestThumbnail(item.Snippet.Thumbnails, "medium", "high", "default"),
			URL:             "https://www.youtube.com/watch?v=" + item.ID,
			ChannelID:       item.Snippet.ChannelID,
		})
	}
	return videos, nil
}

func validVideoID(id string) bool {
	if len(id) != videoIDLength {
		return false
	}
	for _, c := range id {
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '-' || c == '_') {
			return false
		}
	}
	return true
}

// safeTitle strips control characters and bounds length before data reaches the UI.
func safeTitle(value, fallback string) string {
	value = strings.TrimSpace(strings.Map(func(r rune) rune {
		if r < 32 || r == 127 {
			return -1
		}
		return r
	}, value))
	if value == "" {
		return fallback
	}
	if utf8.RuneCountInString(value) > maxTitleRunes {
		runes := []rune(value)
		value = string(runes[:maxTitleRunes])
	}
	return value
}

func (c *Client) do(ctx context.Context, method, endpoint, accessToken, contentType string, body io.Reader, target any) error {
	if body == nil {
		body = bytes.NewReader(nil)
	}
	request, err := http.NewRequestWithContext(ctx, method, endpoint, body)
	if err != nil {
		return errors.New("cannot construct YouTube channel request")
	}
	if accessToken != "" {
		request.Header.Set("Authorization", "Bearer "+accessToken)
	}
	if contentType != "" {
		request.Header.Set("Content-Type", contentType)
	}
	request.Header.Set("Accept", "application/json")
	response, err := c.http.Do(request)
	if err != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		return errors.New("YouTube service is unavailable")
	}
	defer response.Body.Close()
	data, err := io.ReadAll(io.LimitReader(response.Body, maxResponseBytes+1))
	if err != nil || len(data) > maxResponseBytes {
		return errors.New("invalid YouTube channel response")
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return &APIError{StatusCode: response.StatusCode, Code: googleErrorCode(data)}
	}
	if target != nil {
		if err := json.Unmarshal(data, target); err != nil {
			return errors.New("invalid YouTube channel response")
		}
	}
	return nil
}

// googleErrorCode maps upstream errors to a fixed allowlist so arbitrary text
// never reaches logs or the UI.
func googleErrorCode(data []byte) string {
	var result struct {
		Error json.RawMessage `json:"error"`
	}
	if json.Unmarshal(data, &result) != nil || len(result.Error) == 0 {
		return "request_rejected"
	}
	var code string
	if json.Unmarshal(result.Error, &code) != nil {
		var object struct {
			Status string `json:"status"`
		}
		if json.Unmarshal(result.Error, &object) == nil {
			code = object.Status
		}
	}
	switch code {
	case "invalid_grant", "invalid_token", "invalid_client", "invalid_scope", "access_denied", "UNAUTHENTICATED", "PERMISSION_DENIED", "RESOURCE_EXHAUSTED", "NOT_FOUND", "INVALID_ARGUMENT", "INTERNAL", "UNAVAILABLE":
		return code
	default:
		return "request_rejected"
	}
}
