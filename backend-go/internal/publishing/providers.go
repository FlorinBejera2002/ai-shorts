package publishing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"
)

type ProviderConfig struct {
	AppURL, MetaAppID, MetaAppSecret, InstagramAppID, InstagramAppSecret       string
	TikTokClientKey, TikTokClientSecret, TikTokVerifiedURLPrefix, GraphVersion string
	YouTubeClientID, YouTubeClientSecret                                       string
}
type Credentials struct {
	AccessToken, RefreshToken string
	ExpiresAt                 time.Time
}
type RemoteAccount struct {
	ID, Name, Username, AvatarURL string
	Credentials                   Credentials
}
type TikTokOptions struct {
	MusicUsageConfirmed bool   `json:"musicUsageConfirmed"`
	PrivacyLevel        string `json:"privacyLevel"`
	DisableComment      bool   `json:"disableComment"`
	DisableDuet         bool   `json:"disableDuet"`
	DisableStitch       bool   `json:"disableStitch"`
	BrandContentToggle  bool   `json:"brandContentToggle"`
	BrandOrganicToggle  bool   `json:"brandOrganicToggle"`
	IsAIGC              bool   `json:"isAigc"`
}
type CreatorOptions struct {
	PrivacyLevels   []string `json:"privacyLevels"`
	CommentDisabled bool     `json:"commentDisabled"`
	DuetDisabled    bool     `json:"duetDisabled"`
	StitchDisabled  bool     `json:"stitchDisabled"`
	MaxDuration     int      `json:"maxDuration"`
	Nickname        string   `json:"nickname"`
}
type ProviderClient struct {
	config     ProviderConfig
	httpClient *http.Client
}

var errTikTokCreatorTemporarilyUnavailable = errors.New("TikTok creator settings are temporarily unavailable")

func NewProviderClient(c ProviderConfig) *ProviderClient {
	if c.GraphVersion == "" {
		c.GraphVersion = "v23.0"
	}
	return &ProviderClient{c, &http.Client{Timeout: 45 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
}
func (p *ProviderClient) Configured(provider string) bool {
	switch provider {
	case "instagram":
		return p.config.InstagramAppID != "" && p.config.InstagramAppSecret != ""
	case "facebook":
		return p.config.MetaAppID != "" && p.config.MetaAppSecret != ""
	case "tiktok":
		return p.config.TikTokClientKey != "" && p.config.TikTokClientSecret != "" && verifiedMediaURL(p.config.TikTokVerifiedURLPrefix, p.config.TikTokVerifiedURLPrefix)
	case "youtube":
		return p.config.YouTubeClientID != "" && p.config.YouTubeClientSecret != ""
	}
	return false
}
func (p *ProviderClient) callback(provider string) string {
	return strings.TrimRight(p.config.AppURL, "/") + "/api/publishing/callback/" + provider
}
func verifiedMediaURL(prefix, media string) bool {
	base, err := url.Parse(prefix)
	if err != nil || base.Scheme != "https" || base.Host == "" || base.User != nil || base.RawQuery != "" || base.Fragment != "" {
		return false
	}
	target, err := url.Parse(media)
	if err != nil || target.Scheme != "https" || !strings.EqualFold(base.Host, target.Host) || target.User != nil || target.Fragment != "" {
		return false
	}
	for _, u := range []*url.URL{base, target} {
		if strings.Contains(u.Path, "\\") || path.Clean("/"+strings.TrimLeft(u.Path, "/")) != strings.TrimRight("/"+strings.TrimLeft(u.Path, "/"), "/") && u.Path != "" && u.Path != "/" {
			return false
		}
	}
	root := strings.TrimRight(base.EscapedPath(), "/")
	return target.EscapedPath() == root || strings.HasPrefix(target.EscapedPath(), root+"/")
}
func (p *ProviderClient) graph(provider, path string) string {
	host := "https://graph.facebook.com/"
	if provider == "instagram" {
		host = "https://graph.instagram.com/"
	}
	return host + p.config.GraphVersion + "/" + path
}
func (p *ProviderClient) Authorize(provider, state, verifier string) (string, error) {
	if !p.Configured(provider) {
		return "", errors.New("provider is not configured")
	}
	q := url.Values{"redirect_uri": {p.callback(provider)}, "state": {state}, "response_type": {"code"}}
	endpoint := ""
	switch provider {
	case "instagram":
		endpoint = "https://www.instagram.com/oauth/authorize"
		q.Set("client_id", p.config.InstagramAppID)
		q.Set("scope", "instagram_business_basic,instagram_business_content_publish")
		q.Set("enable_fb_login", "0")
		q.Set("force_authentication", "1")
	case "facebook":
		endpoint = "https://www.facebook.com/" + p.config.GraphVersion + "/dialog/oauth"
		q.Set("client_id", p.config.MetaAppID)
		q.Set("scope", "pages_show_list,pages_read_engagement,pages_manage_posts")
	case "tiktok":
		endpoint = "https://www.tiktok.com/v2/auth/authorize/"
		q.Set("client_key", p.config.TikTokClientKey)
		q.Set("scope", "user.info.basic,video.publish")
	case "youtube":
		endpoint = "https://accounts.google.com/o/oauth2/v2/auth"
		q.Set("client_id", p.config.YouTubeClientID)
		q.Set("scope", "https://www.googleapis.com/auth/youtube.readonly")
		q.Set("access_type", "offline")
		q.Set("include_granted_scopes", "true")
		q.Set("prompt", "consent")
		q.Set("code_challenge", pkceChallenge(verifier))
		q.Set("code_challenge_method", "S256")
	}
	return endpoint + "?" + q.Encode(), nil
}

// Provider responses and transport errors are deliberately not returned verbatim:
// they can contain access tokens, client secrets, or signed media URLs.
func (p *ProviderClient) request(ctx context.Context, method, endpoint, token string, form url.Values, body any, out any) error {
	var reader io.Reader
	contentType := ""
	if form != nil {
		reader = strings.NewReader(form.Encode())
		contentType = "application/x-www-form-urlencoded"
	} else if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = strings.NewReader(string(b))
		contentType = "application/json"
	}
	req, err := http.NewRequestWithContext(ctx, method, endpoint, reader)
	if err != nil {
		return errors.New("invalid provider request")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	return p.execute(req, out)
}
func (p *ProviderClient) execute(req *http.Request, out any) error {
	res, err := p.httpClient.Do(req)
	if err != nil {
		return errors.New("provider request could not be confirmed")
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(res.Body, 2<<20))
	if err != nil {
		return errors.New("provider response could not be read")
	}
	if res.StatusCode == http.StatusTooManyRequests {
		return errTikTokCreatorTemporarilyUnavailable
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("provider rejected request (HTTP %d)", res.StatusCode)
	}
	var envelope struct {
		Error json.RawMessage `json:"error"`
	}
	if err = json.Unmarshal(raw, &envelope); err != nil {
		return errors.New("invalid provider response")
	}
	if len(envelope.Error) > 0 && string(envelope.Error) != "null" {
		var e struct {
			Code json.RawMessage `json:"code"`
		}
		_ = json.Unmarshal(envelope.Error, &e)
		if string(e.Code) != "\"ok\"" {
			var code string
			_ = json.Unmarshal(e.Code, &code)
			if code == "spam_risk_too_many_posts" || code == "reached_active_user_cap" || code == "rate_limit_exceeded" {
				return errTikTokCreatorTemporarilyUnavailable
			}
			return errors.New("provider reported an API error")
		}
	}
	if out != nil {
		if json.Unmarshal(raw, out) != nil {
			return errors.New("invalid provider response fields")
		}
	}
	return nil
}

type tokenResponse struct {
	Data         []tokenResponse `json:"data"`
	Scope        string          `json:"scope"`
	AccessToken  string          `json:"access_token"`
	RefreshToken string          `json:"refresh_token"`
	ExpiresIn    int64           `json:"expires_in"`
	OpenID       string          `json:"open_id"`
}

func (t tokenResponse) credentials() Credentials {
	c := Credentials{AccessToken: t.AccessToken, RefreshToken: t.RefreshToken}
	if t.ExpiresIn > 0 {
		c.ExpiresAt = time.Now().Add(time.Duration(t.ExpiresIn) * time.Second)
	}
	return c
}
func (p *ProviderClient) Exchange(ctx context.Context, provider, code, verifier string) ([]RemoteAccount, error) {
	if !p.Configured(provider) {
		return nil, errors.New("provider is not configured")
	}
	form := url.Values{"code": {code}, "redirect_uri": {p.callback(provider)}, "grant_type": {"authorization_code"}}
	var tok tokenResponse
	endpoint := ""
	switch provider {
	case "instagram":
		endpoint = "https://api.instagram.com/oauth/access_token"
		form.Set("client_id", p.config.InstagramAppID)
		form.Set("client_secret", p.config.InstagramAppSecret)
	case "facebook":
		endpoint = p.graph(provider, "oauth/access_token")
		form.Set("client_id", p.config.MetaAppID)
		form.Set("client_secret", p.config.MetaAppSecret)
	case "tiktok":
		endpoint = "https://open.tiktokapis.com/v2/oauth/token/"
		form.Set("client_key", p.config.TikTokClientKey)
		form.Set("client_secret", p.config.TikTokClientSecret)
	case "youtube":
		endpoint = "https://oauth2.googleapis.com/token"
		form.Set("client_id", p.config.YouTubeClientID)
		form.Set("client_secret", p.config.YouTubeClientSecret)
		form.Set("code_verifier", verifier)
	}
	if err := p.request(ctx, "POST", endpoint, "", form, nil, &tok); err != nil {
		return nil, err
	}
	if provider == "instagram" && tok.AccessToken == "" && len(tok.Data) == 1 {
		tok = tok.Data[0]
	}
	if tok.AccessToken == "" {
		return nil, errors.New("provider did not return an access token")
	}
	if provider == "tiktok" {
		publishingGranted := false
		for _, scope := range strings.Split(tok.Scope, ",") {
			if strings.TrimSpace(scope) == "video.publish" {
				publishingGranted = true
			}
		}
		if !publishingGranted {
			return nil, errors.New("TikTok publishing permission was not granted")
		}
	}
	if provider == "instagram" || provider == "facebook" {
		q := url.Values{"access_token": {tok.AccessToken}, "client_secret": {p.config.InstagramAppSecret}, "grant_type": {"ig_exchange_token"}}
		endpoint = "https://graph.instagram.com/access_token"
		if provider == "facebook" {
			endpoint = p.graph(provider, "oauth/access_token")
			q = url.Values{"grant_type": {"fb_exchange_token"}, "client_id": {p.config.MetaAppID}, "client_secret": {p.config.MetaAppSecret}, "fb_exchange_token": {tok.AccessToken}}
		}
		var long tokenResponse
		if err := p.request(ctx, "GET", endpoint+"?"+q.Encode(), "", nil, nil, &long); err != nil {
			return nil, err
		}
		if long.AccessToken == "" {
			return nil, errors.New("provider did not return a long-lived token")
		}
		tok = long
	}
	creds := tok.credentials()
	switch provider {
	case "facebook":
		var accounts []RemoteAccount
		cursor := ""
		for page := 0; page < 100; page++ {
			q := url.Values{"fields": {"id,name,access_token,tasks,picture.type(square)"}, "limit": {"100"}}
			if cursor != "" {
				q.Set("after", cursor)
			}
			var r struct {
				Data []struct {
					ID, Name    string
					AccessToken string `json:"access_token"`
					Tasks       []string
					Picture     struct {
						Data struct{ URL string }
					}
				}
				Paging struct {
					Next    string
					Cursors struct{ After string }
				}
			}
			if err := p.request(ctx, "GET", p.graph(provider, "me/accounts")+"?"+q.Encode(), creds.AccessToken, nil, nil, &r); err != nil {
				return nil, err
			}
			for _, a := range r.Data {
				allowed := false
				for _, task := range a.Tasks {
					if task == "CREATE_CONTENT" || task == "MANAGE" || task == "PROFILE_PLUS_CREATE_CONTENT" || task == "PROFILE_PLUS_FULL_CONTROL" {
						allowed = true
					}
				}
				if allowed && a.ID != "" && a.AccessToken != "" {
					accounts = append(accounts, RemoteAccount{ID: a.ID, Name: a.Name, AvatarURL: a.Picture.Data.URL, Credentials: Credentials{AccessToken: a.AccessToken, ExpiresAt: creds.ExpiresAt}})
				}
			}
			if r.Paging.Next == "" {
				return accounts, nil
			}
			if r.Paging.Cursors.After == "" || r.Paging.Cursors.After == cursor {
				return nil, errors.New("invalid page pagination")
			}
			cursor = r.Paging.Cursors.After
		}
		return nil, errors.New("too many Facebook Pages")
	case "instagram":
		var r struct {
			ID, Username string
			UserID       string `json:"user_id"`
			AvatarURL    string `json:"profile_picture_url"`
		}
		if err := p.request(ctx, "GET", p.graph(provider, "me")+"?fields=id,user_id,username,profile_picture_url", creds.AccessToken, nil, nil, &r); err != nil {
			return nil, err
		}
		if r.UserID != "" {
			r.ID = r.UserID
		}
		if r.ID == "" {
			return nil, errors.New("missing Instagram account ID")
		}
		// Meta can omit profile_picture_url from /me immediately after OAuth.
		// Reading the concrete user resource reliably returns it once the account
		// identity has been resolved.
		if r.AvatarURL == "" {
			var profile struct {
				AvatarURL string `json:"profile_picture_url"`
			}
			if err := p.request(ctx, "GET", p.graph(provider, r.ID)+"?fields=profile_picture_url", creds.AccessToken, nil, nil, &profile); err == nil {
				r.AvatarURL = profile.AvatarURL
			}
		}
		return []RemoteAccount{{ID: r.ID, Name: r.Username, Username: r.Username, AvatarURL: r.AvatarURL, Credentials: creds}}, nil
	case "tiktok":
		var r struct {
			Data struct {
				User struct {
					OpenID      string `json:"open_id"`
					DisplayName string `json:"display_name"`
					AvatarURL   string `json:"avatar_url"`
				}
			}
		}
		if err := p.request(ctx, "GET", "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url", creds.AccessToken, nil, nil, &r); err != nil {
			return nil, err
		}
		if r.Data.User.OpenID == "" {
			return nil, errors.New("missing TikTok account ID")
		}
		return []RemoteAccount{{ID: r.Data.User.OpenID, Name: r.Data.User.DisplayName, AvatarURL: r.Data.User.AvatarURL, Credentials: creds}}, nil
	case "youtube":
		var r struct {
			Items []struct {
				ID      string
				Snippet struct {
					Title      string
					CustomURL  string `json:"customUrl"`
					Thumbnails struct {
						Default struct{ URL string }
					}
				}
			}
		}
		endpoint := "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true&maxResults=50"
		if err := p.request(ctx, "GET", endpoint, creds.AccessToken, nil, nil, &r); err != nil {
			return nil, err
		}
		accounts := make([]RemoteAccount, 0, len(r.Items))
		for _, channel := range r.Items {
			if channel.ID == "" {
				continue
			}
			accounts = append(accounts, RemoteAccount{ID: channel.ID, Name: channel.Snippet.Title, Username: strings.TrimPrefix(channel.Snippet.CustomURL, "@"), AvatarURL: channel.Snippet.Thumbnails.Default.URL, Credentials: creds})
		}
		if len(accounts) == 0 {
			return nil, errors.New("no YouTube channel is available for this account")
		}
		return accounts, nil
	}
	return nil, errors.New("unsupported provider")
}
func (p *ProviderClient) Options(ctx context.Context, c Credentials) (CreatorOptions, error) {
	var r struct {
		Data struct {
			Privacy  []string `json:"privacy_level_options"`
			Comment  bool     `json:"comment_disabled"`
			Duet     bool     `json:"duet_disabled"`
			Stitch   bool     `json:"stitch_disabled"`
			Max      int      `json:"max_video_post_duration_sec"`
			Nickname string   `json:"creator_nickname"`
		}
	}
	err := p.request(ctx, "POST", "https://open.tiktokapis.com/v2/post/publish/creator_info/query/", c.AccessToken, nil, struct{}{}, &r)
	return CreatorOptions{r.Data.Privacy, r.Data.Comment, r.Data.Duet, r.Data.Stitch, r.Data.Max, r.Data.Nickname}, err
}

// Publish creates a remote job. Callers must persist the intent before calling
// and never automatically retry an unconfirmed mutation.
func (p *ProviderClient) Publish(ctx context.Context, provider, account string, c Credentials, mediaURL, caption string, options TikTokOptions) (string, string, error) {
	return p.PublishMedia(ctx, provider, account, c, []PublishMedia{{Type: "video", URL: mediaURL}}, caption, options)
}

type PublishMedia struct{ Type, URL string }

func (p *ProviderClient) PublishMedia(ctx context.Context, provider, account string, c Credentials, media []PublishMedia, caption string, options TikTokOptions) (string, string, error) {
	if err := ValidateMediaReferences(provider, media); err != nil {
		return "", "failed", err
	}
	mediaURL := media[0].URL
	if provider == "instagram" || provider == "facebook" {
		if account == "" || strings.IndexFunc(account, func(r rune) bool { return r < '0' || r > '9' }) >= 0 {
			return "", "failed", errors.New("invalid provider account ID")
		}
	}
	switch provider {
	case "instagram":
		if len(media) > 1 {
			return p.createInstagramItems(ctx, account, c, media, caption)
		}
		var r struct{ ID string }
		if media[0].Type == "image" {
			err := p.request(ctx, "POST", p.graph(provider, url.PathEscape(account)+"/media"), c.AccessToken, url.Values{"image_url": {media[0].URL}, "caption": {caption}}, nil, &r)
			if err != nil {
				return "", "unknown", err
			}
		} else {
			err := p.request(ctx, "POST", p.graph(provider, url.PathEscape(account)+"/media"), c.AccessToken, url.Values{"media_type": {"REELS"}, "video_url": {mediaURL}, "caption": {caption}, "share_to_feed": {"true"}}, nil, &r)
			if err != nil {
				return "", "unknown", err
			}
		}
		if r.ID == "" {
			return "", "unknown", errors.New("missing Instagram container ID")
		}
		return account + ":" + r.ID, "processing", nil
	case "facebook":
		if media[0].Type == "image" {
			attached := make([]map[string]string, 0, len(media))
			for _, item := range media {
				var photo struct{ ID string }
				if err := p.request(ctx, "POST", p.graph(provider, url.PathEscape(account)+"/photos"), c.AccessToken, url.Values{"url": {item.URL}, "published": {"false"}}, nil, &photo); err != nil || photo.ID == "" {
					return "", "unknown", errors.New("Facebook carousel image failed")
				}
				attached = append(attached, map[string]string{"media_fbid": photo.ID})
			}
			var post struct{ ID string }
			if err := p.request(ctx, "POST", p.graph(provider, url.PathEscape(account)+"/feed"), c.AccessToken, nil, map[string]any{"message": caption, "attached_media": attached}, &post); err != nil {
				return "", "unknown", err
			}
			return post.ID, "published", nil
		}
		var r struct {
			ID        string `json:"video_id"`
			UploadURL string `json:"upload_url"`
		}
		if err := p.request(ctx, "POST", p.graph(provider, url.PathEscape(account)+"/video_reels"), c.AccessToken, url.Values{"upload_phase": {"start"}}, nil, &r); err != nil {
			return "", "unknown", err
		}
		u, err := url.Parse(r.UploadURL)
		if err != nil || u.Scheme != "https" || u.Host != "rupload.facebook.com" || u.User != nil || r.ID == "" {
			return "", "unknown", errors.New("invalid Facebook upload response")
		}
		req, err := http.NewRequestWithContext(ctx, "POST", r.UploadURL, nil)
		if err != nil {
			return "", "unknown", errors.New("invalid Facebook upload request")
		}
		req.Header.Set("Authorization", "OAuth "+c.AccessToken)
		req.Header.Set("file_url", mediaURL)
		var uploaded struct{ Success bool }
		if err = p.execute(req, &uploaded); err != nil {
			return "", "unknown", err
		}
		if !uploaded.Success {
			return "", "unknown", errors.New("Facebook upload was not accepted")
		}
		// Caption is encoded in the opaque job reference for the later finish call.
		return account + ":" + r.ID + ":" + url.QueryEscape(caption), "processing", nil
	case "tiktok":
		if !verifiedMediaURL(p.config.TikTokVerifiedURLPrefix, mediaURL) {
			return "", "failed", errors.New("TikTok requires a video URL under the configured verified domain or prefix")
		}
		if !options.MusicUsageConfirmed {
			return "", "failed", errors.New("confirm TikTok music usage terms before publishing")
		}
		creator, err := p.Options(ctx, c)
		if err != nil {
			return "", "failed", err
		}
		allowed := false
		for _, v := range creator.PrivacyLevels {
			if v == options.PrivacyLevel {
				allowed = true
			}
		}
		if !allowed {
			return "", "failed", errors.New("select an available TikTok privacy level")
		}
		if options.BrandContentToggle && options.PrivacyLevel == "SELF_ONLY" {
			return "", "failed", errors.New("branded TikTok posts cannot be private")
		}
		body := map[string]any{"post_info": map[string]any{"title": caption, "privacy_level": options.PrivacyLevel, "disable_comment": options.DisableComment || creator.CommentDisabled, "disable_duet": options.DisableDuet || creator.DuetDisabled, "disable_stitch": options.DisableStitch || creator.StitchDisabled, "brand_content_toggle": options.BrandContentToggle, "brand_organic_toggle": options.BrandOrganicToggle, "is_aigc": options.IsAIGC}, "source_info": map[string]any{"source": "PULL_FROM_URL", "video_url": mediaURL}}
		var r struct {
			Data struct {
				ID string `json:"publish_id"`
			}
		}
		if err = p.request(ctx, "POST", "https://open.tiktokapis.com/v2/post/publish/video/init/", c.AccessToken, nil, body, &r); err != nil {
			return "", "unknown", err
		}
		if r.Data.ID == "" {
			return "", "unknown", errors.New("missing TikTok publish ID")
		}
		return r.Data.ID, "processing", nil
	}
	return "", "failed", errors.New("unsupported provider")
}
func (p *ProviderClient) Poll(ctx context.Context, provider, job string, c Credentials) (string, string, error) {
	if provider == "tiktok" {
		var r struct {
			Data struct {
				Status string `json:"status"`
			}
		}
		if err := p.request(ctx, "POST", "https://open.tiktokapis.com/v2/post/publish/status/fetch/", c.AccessToken, nil, map[string]string{"publish_id": job}, &r); err != nil {
			return "processing", "", err
		}
		switch r.Data.Status {
		case "PUBLISH_COMPLETE":
			return "published", "", nil
		case "FAILED":
			return "failed", "", errors.New("TikTok publishing failed")
		}
		return "processing", "", nil
	}
	parts := strings.SplitN(job, ":", 3)
	if len(parts) < 2 {
		return "failed", "", errors.New("invalid provider job")
	}
	if provider == "instagram" {
		if len(parts) == 3 && parts[1] == "carousel" {
			return p.pollInstagramItems(ctx, job, c)
		}
		var r struct {
			Status string `json:"status_code"`
		}
		err := p.request(ctx, "GET", p.graph(provider, url.PathEscape(parts[1]))+"?fields=status_code", c.AccessToken, nil, nil, &r)
		if err != nil {
			return "processing", "", err
		}
		switch r.Status {
		case "FINISHED":
			return "ready", "", nil
		case "PUBLISHED":
			return "published", "", nil
		case "ERROR", "EXPIRED":
			return "failed", "", errors.New("Instagram media processing failed")
		}
		return "processing", "", nil
	}
	if provider == "facebook" {
		var r struct {
			Status struct {
				Video      string                  `json:"video_status"`
				Uploading  struct{ Status string } `json:"uploading_phase"`
				Processing struct{ Status string } `json:"processing_phase"`
				Publishing struct{ Status string } `json:"publishing_phase"`
			}
		}
		if err := p.request(ctx, "GET", p.graph(provider, url.PathEscape(parts[1]))+"?fields=status", c.AccessToken, nil, nil, &r); err != nil {
			return "processing", "", err
		}
		if r.Status.Publishing.Status == "complete" {
			return "published", "https://www.facebook.com/reel/" + url.PathEscape(parts[1]), nil
		}
		if r.Status.Video == "error" || r.Status.Processing.Status == "error" || r.Status.Publishing.Status == "error" {
			return "failed", "", errors.New("Facebook media processing failed")
		}
		// Meta's finish call ends the upload phase and starts assembling and
		// encoding the Reel. Waiting for processing to complete before finish
		// creates a deadlock because processing may remain not_started.
		if r.Status.Uploading.Status == "complete" || r.Status.Processing.Status == "complete" || r.Status.Video == "ready" {
			return "ready", "", nil
		}
		return "processing", "", nil
	}
	return "failed", "", errors.New("unsupported provider")
}

// Finalize performs the final, non-idempotent publication. The worker records
// finalizing durably first; ambiguous failures must be reconciled by the user.
func (p *ProviderClient) Finalize(ctx context.Context, provider, job string, c Credentials) (string, string, error) {
	parts := strings.SplitN(job, ":", 3)
	if len(parts) < 2 {
		return "", "", errors.New("invalid provider job")
	}
	if provider == "instagram" {
		var r struct{ ID string }
		if err := p.request(ctx, "POST", p.graph(provider, url.PathEscape(parts[0])+"/media_publish"), c.AccessToken, url.Values{"creation_id": {parts[1]}}, nil, &r); err != nil {
			return "", "", err
		}
		if r.ID == "" {
			return "", "", errors.New("missing published Instagram ID")
		}
		var link struct{ Permalink string }
		_ = p.request(ctx, "GET", p.graph(provider, url.PathEscape(r.ID))+"?fields=permalink", c.AccessToken, nil, nil, &link)
		return r.ID, link.Permalink, nil
	}
	if provider == "facebook" {
		caption := ""
		if len(parts) == 3 {
			caption, _ = url.QueryUnescape(parts[2])
		}
		var r struct{ Success bool }
		err := p.request(ctx, "POST", p.graph(provider, url.PathEscape(parts[0])+"/video_reels"), c.AccessToken, url.Values{"upload_phase": {"finish"}, "video_id": {parts[1]}, "video_state": {"PUBLISHED"}, "description": {caption}}, nil, &r)
		if err != nil {
			return "", "", err
		}
		if !r.Success {
			return "", "", errors.New("Facebook did not confirm publication")
		}
		return parts[1], "https://www.facebook.com/reel/" + url.PathEscape(parts[1]), nil
	}
	return "", "", errors.New("unsupported provider")
}

// DeletePost removes content previously published by Sneep Cut when the
// provider exposes a supported deletion endpoint.
func (p *ProviderClient) DeletePost(ctx context.Context, provider, remoteID string, c Credentials) error {
	if provider != "facebook" {
		return errors.New("provider does not support post deletion")
	}
	parts := strings.SplitN(remoteID, ":", 3)
	if len(parts) >= 2 {
		remoteID = parts[1]
	}
	if remoteID == "" || strings.IndexFunc(remoteID, func(r rune) bool { return r < '0' || r > '9' }) >= 0 {
		return errors.New("invalid provider post ID")
	}
	return p.request(ctx, "DELETE", p.graph(provider, url.PathEscape(remoteID)), c.AccessToken, nil, nil, nil)
}

func (p *ProviderClient) Refresh(ctx context.Context, provider string, c Credentials) (Credentials, error) {
	var t tokenResponse
	var err error
	switch provider {
	case "tiktok":
		if c.RefreshToken == "" {
			return c, errors.New("reconnect TikTok")
		}
		err = p.request(ctx, "POST", "https://open.tiktokapis.com/v2/oauth/token/", "", url.Values{"client_key": {p.config.TikTokClientKey}, "client_secret": {p.config.TikTokClientSecret}, "grant_type": {"refresh_token"}, "refresh_token": {c.RefreshToken}}, nil, &t)
	case "instagram":
		err = p.request(ctx, "GET", "https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token="+url.QueryEscape(c.AccessToken), "", nil, nil, &t)
	case "facebook":
		return c, errors.New("reconnect Facebook to renew permissions")
	case "youtube":
		if c.RefreshToken == "" {
			return c, errors.New("reconnect YouTube")
		}
		err = p.request(ctx, "POST", "https://oauth2.googleapis.com/token", "", url.Values{"client_id": {p.config.YouTubeClientID}, "client_secret": {p.config.YouTubeClientSecret}, "grant_type": {"refresh_token"}, "refresh_token": {c.RefreshToken}}, nil, &t)
	default:
		return c, errors.New("unsupported provider")
	}
	if err != nil {
		return c, err
	}
	if t.AccessToken == "" {
		return c, errors.New("provider did not return a renewed token")
	}
	if t.RefreshToken == "" {
		t.RefreshToken = c.RefreshToken
	}
	return t.credentials(), nil
}
func (p *ProviderClient) Revoke(ctx context.Context, provider string, c Credentials) error {
	if provider == "tiktok" {
		return p.request(ctx, "POST", "https://open.tiktokapis.com/v2/oauth/revoke/", "", url.Values{"client_key": {p.config.TikTokClientKey}, "client_secret": {p.config.TikTokClientSecret}, "token": {c.AccessToken}}, nil, nil)
	}
	if provider == "instagram" || provider == "facebook" {
		return p.request(ctx, "DELETE", p.graph(provider, "me/permissions"), c.AccessToken, nil, nil, nil)
	}
	if provider == "youtube" {
		return p.request(ctx, "POST", "https://oauth2.googleapis.com/revoke", "", url.Values{"token": {c.AccessToken}}, nil, nil)
	}
	return errors.New("unsupported provider")
}
