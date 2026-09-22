package publishing

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

const youtubeScopes = "https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.upload"
const youtubeMaxUploadBytes int64 = 256 << 30

// Pin each connection to a validated DNS result, avoiding rebinding between
// validation and dialing. The media storage hostname is independently allowlisted.
func youtubeMediaDial(ctx context.Context, network, address string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return nil, errors.New("invalid media address")
	}
	ips, err := net.DefaultResolver.LookupNetIP(ctx, "ip", host)
	if err != nil || len(ips) == 0 {
		return nil, errors.New("media storage address unavailable")
	}
	for _, ip := range ips {
		if !youtubePublicIP(ip) {
			return nil, errors.New("media storage must use a public address")
		}
	}
	dialer := net.Dialer{Timeout: 30 * time.Second}
	for _, ip := range ips {
		conn, dialErr := dialer.DialContext(ctx, network, net.JoinHostPort(ip.String(), port))
		if dialErr == nil {
			return conn, nil
		}
	}
	return nil, errors.New("media storage connection failed")
}

func youtubePublicIP(ip netip.Addr) bool {
	ip = ip.Unmap()
	if !ip.IsValid() || !ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() {
		return false
	}
	for _, block := range []string{"0.0.0.0/8", "100.64.0.0/10", "192.0.0.0/24", "192.0.2.0/24", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "240.0.0.0/4", "2001:db8::/32"} {
		if netip.MustParsePrefix(block).Contains(ip) {
			return false
		}
	}
	return true
}

type YouTubeOptions struct {
	TermsAccepted          bool   `json:"termsAccepted"`
	Title                  string `json:"title"`
	Description            string `json:"description"`
	PrivacyStatus          string `json:"privacyStatus"`
	MadeForKids            *bool  `json:"madeForKids"`
	ContainsSyntheticMedia *bool  `json:"containsSyntheticMedia"`
	NotifySubscribers      bool   `json:"notifySubscribers"`
}

func youtubeScopesGranted(granted string) bool {
	scopes := strings.Fields(granted)
	for _, required := range strings.Fields(youtubeScopes) {
		found := false
		for _, scope := range scopes {
			if scope == required {
				found = true
			}
		}
		if !found {
			return false
		}
	}
	return true
}

func ValidateYouTubeOptions(o YouTubeOptions, auditApproved bool) error {
	if !o.TermsAccepted {
		return errors.New("accept YouTube terms before publishing")
	}
	if !utf8.ValidString(o.Title) || strings.TrimSpace(o.Title) == "" || utf8.RuneCountInString(o.Title) > 100 || strings.ContainsAny(o.Title, "<>") {
		return errors.New("YouTube requires a title of 1–100 characters without angle brackets")
	}
	if !utf8.ValidString(o.Description) || len(o.Description) > 5000 || strings.ContainsAny(o.Description, "<>") {
		return errors.New("YouTube description must be at most 5000 bytes without angle brackets")
	}
	switch o.PrivacyStatus {
	case "private", "public", "unlisted":
	default:
		return errors.New("select YouTube visibility")
	}
	if !auditApproved && o.PrivacyStatus != "private" {
		return errors.New("YouTube uploads must be private until the application passes the YouTube API audit")
	}
	if o.MadeForKids == nil || o.ContainsSyntheticMedia == nil {
		return errors.New("answer YouTube audience and altered or synthetic content questions")
	}
	return nil
}

func (p *ProviderClient) YouTubeChannel(ctx context.Context, c Credentials, id string) (RemoteAccount, error) {
	var response struct {
		Items []struct {
			ID      string `json:"id"`
			Snippet struct {
				Title      string
				CustomURL  string `json:"customUrl"`
				Thumbnails struct{ Default struct{ URL string } }
			} `json:"snippet"`
		} `json:"items"`
	}
	if err := p.request(ctx, http.MethodGet, "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", c.AccessToken, nil, nil, &response); err != nil {
		return RemoteAccount{}, err
	}
	for _, channel := range response.Items {
		if channel.ID == id {
			return RemoteAccount{ID: id, Name: channel.Snippet.Title, Username: strings.TrimPrefix(channel.Snippet.CustomURL, "@"), AvatarURL: channel.Snippet.Thumbnails.Default.URL, Credentials: c}, nil
		}
	}
	return RemoteAccount{}, errors.New("connected YouTube channel is unavailable")
}

func YouTubeAuthorizationRevoked(err error) bool {
	var rejected *providerRejection
	return errors.As(err, &rejected) && (rejected.status == http.StatusUnauthorized || rejected.code == "invalid_grant" || rejected.code == "authError" || rejected.code == "insufficientPermissions")
}

// PublishYouTube streams trusted signed media into a resumable upload session.
// It deliberately does not retry mutations: an unconfirmed upload may exist.
func (p *ProviderClient) PublishYouTube(ctx context.Context, c Credentials, media []PublishMedia, o YouTubeOptions) (string, string, error) {
	if err := ValidateYouTubeOptions(o, p.config.YouTubeAuditApproved); err != nil {
		return "", "failed", err
	}
	if len(media) != 1 || media[0].Type != "video" || !verifiedMediaURL(p.config.YouTubeMediaURLPrefix, media[0].URL) {
		return "", "failed", errors.New("YouTube requires one video from the configured media storage")
	}
	// A separate bounded timeout allows streaming large media without weakening the
	// short timeout used by OAuth and polling. Redirects must never carry tokens.
	client := *p.httpClient
	client.Timeout = 30 * time.Minute
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, media[0].URL, nil)
	if err != nil {
		return "", "failed", errors.New("invalid YouTube media URL")
	}
	sourceClient := client
	if sourceClient.Transport == nil {
		transport := http.DefaultTransport.(*http.Transport).Clone()
		transport.Proxy = nil
		transport.DialContext = youtubeMediaDial
		sourceClient.Transport = transport
		defer transport.CloseIdleConnections()
	}
	source, err := sourceClient.Do(req)
	if err != nil {
		return "", "failed", errors.New("YouTube source video could not be read")
	}
	defer source.Body.Close()
	contentType, _, _ := mime.ParseMediaType(source.Header.Get("Content-Type"))
	if source.StatusCode != http.StatusOK || source.ContentLength <= 0 || source.ContentLength > youtubeMaxUploadBytes || (!strings.HasPrefix(contentType, "video/") && contentType != "application/octet-stream") {
		return "", "failed", errors.New("YouTube source video has an invalid response, size, or content type")
	}
	metadata, _ := json.Marshal(map[string]any{
		"snippet": map[string]any{"title": o.Title, "description": o.Description, "categoryId": "22"},
		"status":  map[string]any{"privacyStatus": o.PrivacyStatus, "selfDeclaredMadeForKids": *o.MadeForKids, "containsSyntheticMedia": *o.ContainsSyntheticMedia},
	})
	endpoint := "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status&notifySubscribers=" + strconv.FormatBool(o.NotifySubscribers)
	req, _ = http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(string(metadata)))
	req.Header.Set("Authorization", "Bearer "+c.AccessToken)
	req.Header.Set("Content-Type", "application/json; charset=UTF-8")
	req.Header.Set("X-Upload-Content-Type", contentType)
	req.Header.Set("X-Upload-Content-Length", strconv.FormatInt(source.ContentLength, 10))
	session, err := client.Do(req)
	if err != nil {
		return "", "unknown", errors.New("YouTube upload session could not be confirmed")
	}
	session.Body.Close()
	if session.StatusCode < 200 || session.StatusCode >= 300 {
		state := "unknown"
		if session.StatusCode >= 400 && session.StatusCode < 500 {
			state = "failed"
		}
		return "", state, errors.New("YouTube upload session was not accepted")
	}
	location, err := url.Parse(session.Header.Get("Location"))
	if err != nil || location.Scheme != "https" || location.Host != "www.googleapis.com" || location.User != nil || location.Fragment != "" || location.Path != "/upload/youtube/v3/videos" {
		return "", "unknown", errors.New("invalid YouTube upload session")
	}
	req, _ = http.NewRequestWithContext(ctx, http.MethodPut, location.String(), io.LimitReader(source.Body, source.ContentLength))
	req.ContentLength = source.ContentLength
	req.Header.Set("Authorization", "Bearer "+c.AccessToken)
	req.Header.Set("Content-Type", contentType)
	uploadClient := *p
	uploadClient.httpClient = &client
	var uploaded struct {
		ID string `json:"id"`
	}
	if err := uploadClient.execute(req, &uploaded); err != nil {
		return "", "unknown", err
	}
	if uploaded.ID == "" {
		return "", "unknown", errors.New("missing YouTube video ID")
	}
	return uploaded.ID, "processing", nil
}

func (p *ProviderClient) pollYouTube(ctx context.Context, id string, c Credentials) (string, string, error) {
	if id == "" {
		return "failed", "", errors.New("missing YouTube video ID")
	}
	var response struct {
		Items []struct {
			ID     string `json:"id"`
			Status struct {
				UploadStatus string `json:"uploadStatus"`
			} `json:"status"`
			Processing struct {
				Status string `json:"processingStatus"`
			} `json:"processingDetails"`
		} `json:"items"`
	}
	endpoint := "https://www.googleapis.com/youtube/v3/videos?part=status,processingDetails&id=" + url.QueryEscape(id)
	if err := p.request(ctx, http.MethodGet, endpoint, c.AccessToken, nil, nil, &response); err != nil {
		return "processing", "", err
	}
	if len(response.Items) != 1 || response.Items[0].ID != id {
		return "processing", "", errors.New("YouTube video is not available yet")
	}
	item := response.Items[0]
	if item.Status.UploadStatus == "failed" || item.Status.UploadStatus == "rejected" || item.Status.UploadStatus == "deleted" || item.Processing.Status == "failed" || item.Processing.Status == "terminated" {
		return "failed", "", errors.New("YouTube video processing failed or was rejected")
	}
	if item.Status.UploadStatus == "processed" || item.Processing.Status == "succeeded" {
		return "published", "https://www.youtube.com/watch?v=" + url.QueryEscape(id), nil
	}
	return "processing", "", nil
}
