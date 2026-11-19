package youtubeimport

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
	"strings"
	"time"
)

const (
	PublicVideos   = "youtube.public_videos"
	UnlistedVideos = "youtube.unlisted_videos"
	PrivateVideos  = "youtube.private_videos"
	scopePrefix    = "https://www.googleapis.com/auth/dataportability."
	maxResponse    = 1 << 20
)

// Endpoints is primarily useful for isolated HTTPS test servers. Production
// callers should leave it nil to use Google's fixed endpoints.
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

type Client struct {
	config        ClientConfig
	endpoints     Endpoints
	httpClient    *http.Client
	archiveClient *http.Client
}

type Token struct {
	AccessToken  string    `json:"access_token"`
	RefreshToken string    `json:"refresh_token,omitempty"`
	Scope        string    `json:"scope"`
	TokenType    string    `json:"token_type"`
	ExpiresAt    time.Time `json:"expires_at"`
}

type ArchiveJob struct {
	ID         string `json:"archiveJobId"`
	AccessType string `json:"accessType"`
}

type ArchiveState struct {
	State string   `json:"state"`
	URLs  []string `json:"urls"`
}

// APIError deliberately excludes Google's error descriptions and response
// bodies, which may contain authorization codes, tokens or signed URLs.
type APIError struct {
	StatusCode int
	Code       string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("Google data import request failed (%d, %s)", e.StatusCode, e.Code)
}

func NewClient(config ClientConfig) (*Client, error) {
	if strings.TrimSpace(config.ClientID) == "" || strings.TrimSpace(config.ClientSecret) == "" {
		return nil, errors.New("Google data import credentials are not configured")
	}
	redirect, err := url.Parse(config.RedirectURL)
	if err != nil || redirect.Host == "" || redirect.User != nil || redirect.RawQuery != "" || redirect.Fragment != "" || (redirect.Scheme != "https" && !(redirect.Scheme == "http" && (redirect.Hostname() == "localhost" || redirect.Hostname() == "127.0.0.1" || redirect.Hostname() == "::1"))) {
		return nil, errors.New("invalid Google data import callback URL")
	}
	endpoints := Endpoints{
		AuthorizationURL: "https://accounts.google.com/o/oauth2/v2/auth",
		TokenURL:         "https://oauth2.googleapis.com/token",
		APIBaseURL:       "https://dataportability.googleapis.com/v1",
		RevokeURL:        "https://oauth2.googleapis.com/revoke",
	}
	if config.Endpoints != nil {
		endpoints = *config.Endpoints
	}
	for _, endpoint := range []string{endpoints.AuthorizationURL, endpoints.TokenURL, endpoints.APIBaseURL, endpoints.RevokeURL} {
		if !validEndpoint(endpoint) {
			return nil, errors.New("Google data import endpoints must use HTTPS")
		}
	}
	client := http.Client{Timeout: 45 * time.Second}
	if config.HTTPClient != nil {
		client = *config.HTTPClient
		if client.Timeout <= 0 {
			client.Timeout = 45 * time.Second
		}
	}
	client.Jar = nil
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	return &Client{config: config, endpoints: endpoints, httpClient: &client, archiveClient: newArchiveHTTPClient(config.HTTPClient)}, nil
}

func validEndpoint(raw string) bool {
	u, err := url.Parse(raw)
	return err == nil && u.Scheme == "https" && u.Host != "" && u.User == nil && u.RawQuery == "" && u.Fragment == ""
}

// NormalizeResources accepts only the three uploaded-video resource groups.
func NormalizeResources(resources []string) ([]string, error) {
	if len(resources) == 0 || len(resources) > 3 {
		return nil, errors.New("select at least one YouTube video visibility")
	}
	seen := make(map[string]bool, len(resources))
	result := make([]string, 0, len(resources))
	for _, resource := range resources {
		switch resource {
		case PublicVideos, UnlistedVideos, PrivateVideos:
		default:
			return nil, errors.New("invalid YouTube data import resource")
		}
		if !seen[resource] {
			result = append(result, resource)
			seen[resource] = true
		}
	}
	return result, nil
}

// GrantedResources returns only requested uploaded-video scopes actually granted
// by Google. Partial consent never silently expands the import.
func GrantedResources(scope string, requested []string) []string {
	granted := make(map[string]bool)
	for _, value := range strings.Fields(scope) {
		granted[value] = true
	}
	resources, err := NormalizeResources(requested)
	if err != nil {
		return nil
	}
	result := make([]string, 0, len(resources))
	for _, resource := range resources {
		if granted[scopePrefix+resource] {
			result = append(result, resource)
		}
	}
	return result
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

func (c *Client) AuthorizationURL(state, verifier string, resources []string) (string, error) {
	resources, err := NormalizeResources(resources)
	if err != nil {
		return "", err
	}
	if state == "" || !validVerifier(verifier) {
		return "", errors.New("invalid Google data import authorization state")
	}
	scopes := make([]string, len(resources))
	for i, resource := range resources {
		scopes[i] = scopePrefix + resource
	}
	challenge := sha256.Sum256([]byte(verifier))
	u, _ := url.Parse(c.endpoints.AuthorizationURL)
	query := url.Values{
		"client_id":              {c.config.ClientID},
		"redirect_uri":           {c.config.RedirectURL},
		"response_type":          {"code"},
		"scope":                  {strings.Join(scopes, " ")},
		"state":                  {state},
		"access_type":            {"offline"},
		"prompt":                 {"consent"},
		"include_granted_scopes": {"false"},
		"code_challenge":         {base64.RawURLEncoding.EncodeToString(challenge[:])},
		"code_challenge_method":  {"S256"},
	}
	u.RawQuery = query.Encode()
	return u.String(), nil
}

func (c *Client) Exchange(ctx context.Context, code, verifier string) (Token, error) {
	if strings.TrimSpace(code) == "" || !validVerifier(verifier) {
		return Token{}, errors.New("invalid Google data import authorization code")
	}
	return c.tokenRequest(ctx, url.Values{
		"grant_type": {"authorization_code"}, "code": {code},
		"redirect_uri": {c.config.RedirectURL}, "code_verifier": {verifier},
	}, Token{})
}

func (c *Client) Refresh(ctx context.Context, previous Token) (Token, error) {
	if previous.RefreshToken == "" {
		return Token{}, errors.New("Google data import needs reconnection")
	}
	return c.tokenRequest(ctx, url.Values{"grant_type": {"refresh_token"}, "refresh_token": {previous.RefreshToken}}, previous)
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
	if err := c.request(ctx, http.MethodPost, c.endpoints.TokenURL, "", "application/x-www-form-urlencoded", strings.NewReader(form.Encode()), &response); err != nil {
		return Token{}, err
	}
	if response.AccessToken == "" || response.ExpiresIn <= 0 || response.ExpiresIn > 365*24*60*60 || response.TokenType != "" && !strings.EqualFold(response.TokenType, "Bearer") {
		return Token{}, errors.New("invalid Google data import token response")
	}
	if response.RefreshToken == "" {
		response.RefreshToken = previous.RefreshToken
	}
	if response.Scope == "" {
		response.Scope = previous.Scope
	}
	for _, scope := range strings.Fields(response.Scope) {
		switch scope {
		case scopePrefix + PublicVideos, scopePrefix + UnlistedVideos, scopePrefix + PrivateVideos:
		default:
			return Token{}, errors.New("Google data import returned unexpected permissions")
		}
	}
	return Token{AccessToken: response.AccessToken, RefreshToken: response.RefreshToken, Scope: response.Scope, TokenType: "Bearer", ExpiresAt: time.Now().UTC().Add(time.Duration(response.ExpiresIn) * time.Second)}, nil
}

func (c *Client) Initiate(ctx context.Context, accessToken string, resources []string) (ArchiveJob, error) {
	resources, err := NormalizeResources(resources)
	if err != nil {
		return ArchiveJob{}, err
	}
	body, _ := json.Marshal(struct {
		Resources []string `json:"resources"`
	}{resources})
	var job ArchiveJob
	if err := c.request(ctx, http.MethodPost, strings.TrimRight(c.endpoints.APIBaseURL, "/")+"/portabilityArchive:initiate", accessToken, "application/json", bytes.NewReader(body), &job); err != nil {
		return ArchiveJob{}, err
	}
	if !validJobID(job.ID) {
		return ArchiveJob{}, errors.New("invalid Google data import archive response")
	}
	return job, nil
}

func validJobID(id string) bool {
	if len(id) == 0 || len(id) > 256 {
		return false
	}
	for _, ch := range id {
		if !(ch >= 'a' && ch <= 'z' || ch >= 'A' && ch <= 'Z' || ch >= '0' && ch <= '9' || ch == '-' || ch == '_') {
			return false
		}
	}
	return true
}

func (c *Client) State(ctx context.Context, accessToken, jobID string) (ArchiveState, error) {
	if !validJobID(jobID) {
		return ArchiveState{}, errors.New("invalid Google data import archive ID")
	}
	var state ArchiveState
	endpoint := strings.TrimRight(c.endpoints.APIBaseURL, "/") + "/archiveJobs/" + jobID + "/portabilityArchiveState"
	if err := c.request(ctx, http.MethodGet, endpoint, accessToken, "", nil, &state); err != nil {
		return ArchiveState{}, err
	}
	switch state.State {
	case "IN_PROGRESS", "COMPLETE", "FAILED", "CANCELLED":
	default:
		return ArchiveState{}, errors.New("invalid Google data import archive state")
	}
	if len(state.URLs) > 256 {
		return ArchiveState{}, errors.New("too many Google data import archives")
	}
	return state, nil
}

// Reset is called after all archives have been copied, or when disconnecting.
// It must not be called at the beginning of an export.
func (c *Client) Reset(ctx context.Context, accessToken string) error {
	return c.request(ctx, http.MethodPost, strings.TrimRight(c.endpoints.APIBaseURL, "/")+"/authorization:reset", accessToken, "", nil, nil)
}

// Revoke invalidates the user's grants for the entire Google Cloud project,
// including other OAuth clients in that project. Import credentials must belong
// to a dedicated project so this cannot disconnect sign-in or publishing.
func (c *Client) Revoke(ctx context.Context, token string) error {
	if strings.TrimSpace(token) == "" {
		return errors.New("Google data import token is missing")
	}
	form := url.Values{"token": {token}}
	return c.request(ctx, http.MethodPost, c.endpoints.RevokeURL, "", "application/x-www-form-urlencoded", strings.NewReader(form.Encode()), nil)
}

func (c *Client) request(ctx context.Context, method, endpoint, accessToken, contentType string, body io.Reader, target any) error {
	request, err := http.NewRequestWithContext(ctx, method, endpoint, body)
	if err != nil {
		return errors.New("cannot construct Google data import request")
	}
	if accessToken != "" {
		request.Header.Set("Authorization", "Bearer "+accessToken)
	}
	if contentType != "" {
		request.Header.Set("Content-Type", contentType)
	}
	request.Header.Set("Accept", "application/json")
	response, err := c.httpClient.Do(request)
	if err != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		return errors.New("Google data import service is unavailable")
	}
	defer response.Body.Close()
	data, err := io.ReadAll(io.LimitReader(response.Body, maxResponse+1))
	if err != nil || len(data) > maxResponse {
		return errors.New("invalid Google data import response")
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return &APIError{StatusCode: response.StatusCode, Code: googleErrorCode(data)}
	}
	if target != nil {
		if err := json.Unmarshal(data, target); err != nil {
			return errors.New("invalid Google data import response")
		}
	}
	return nil
}

func googleErrorCode(data []byte) string {
	var result struct {
		Error json.RawMessage `json:"error"`
	}
	if json.Unmarshal(data, &result) != nil {
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
	// A fixed allowlist keeps arbitrary upstream text out of logs and UI.
	switch code {
	case "invalid_grant", "invalid_token", "invalid_client", "invalid_scope", "access_denied", "temporarily_unavailable", "PERMISSION_DENIED", "UNAUTHENTICATED", "RESOURCE_EXHAUSTED", "FAILED_PRECONDITION", "INVALID_ARGUMENT", "NOT_FOUND", "INTERNAL", "UNAVAILABLE":
		return code
	default:
		return "request_rejected"
	}
}
