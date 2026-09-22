package publishing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

const linkedinMaxUploadBytes int64 = 500 << 20

type linkedInVideoJob struct {
	Author  string `json:"author"`
	Video   string `json:"video"`
	Caption string `json:"caption"`
	Title   string `json:"title"`
}

func (p *ProviderClient) linkedInRequest(ctx context.Context, method, endpoint, token string, body any, out any) error {
	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = strings.NewReader(string(encoded))
	}
	req, err := http.NewRequestWithContext(ctx, method, endpoint, reader)
	if err != nil {
		return errors.New("invalid LinkedIn request")
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Linkedin-Version", p.config.LinkedInAPIVersion)
	req.Header.Set("X-Restli-Protocol-Version", "2.0.0")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return p.execute(req, out)
}

func (p *ProviderClient) LinkedInAccounts(ctx context.Context, credentials Credentials) ([]RemoteAccount, error) {
	var member struct {
		Sub     string `json:"sub"`
		Name    string `json:"name"`
		Picture string `json:"picture"`
	}
	if err := p.request(ctx, http.MethodGet, "https://api.linkedin.com/v2/userinfo", credentials.AccessToken, nil, nil, &member); err != nil {
		return nil, err
	}
	if member.Sub == "" {
		return nil, errors.New("LinkedIn did not return a member identifier")
	}
	accounts := []RemoteAccount{{ID: "urn:li:person:" + member.Sub, Name: member.Name, AvatarURL: member.Picture, Credentials: credentials}}
	if !p.config.LinkedInOrganizationEnabled {
		return accounts, nil
	}
	for start := 0; start < 1000; start += 100 {
		endpoint := fmt.Sprintf("https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=100&start=%d", start)
		var access struct {
			Elements []struct {
				Organization       string `json:"organization"`
				OrganizationTarget string `json:"organizationTarget"`
				State              string `json:"state"`
				Role               string `json:"role"`
			} `json:"elements"`
			Paging struct {
				Count int `json:"count"`
				Start int `json:"start"`
				Total int `json:"total"`
			} `json:"paging"`
		}
		if err := p.linkedInRequest(ctx, http.MethodGet, endpoint, credentials.AccessToken, nil, &access); err != nil {
			return nil, err
		}
		for _, item := range access.Elements {
			organization := item.OrganizationTarget
			if organization == "" {
				organization = item.Organization
			}
			if item.State != "APPROVED" || item.Role != "ADMINISTRATOR" || !strings.HasPrefix(organization, "urn:li:organization:") {
				continue
			}
			account, err := p.LinkedInAccount(ctx, credentials, organization)
			if err != nil {
				return nil, err
			}
			accounts = append(accounts, account)
		}
		if len(access.Elements) < 100 || access.Paging.Total > 0 && start+len(access.Elements) >= access.Paging.Total {
			break
		}
	}
	return accounts, nil
}

func (p *ProviderClient) LinkedInAccount(ctx context.Context, credentials Credentials, author string) (RemoteAccount, error) {
	if strings.HasPrefix(author, "urn:li:person:") {
		var member struct {
			Sub     string `json:"sub"`
			Name    string `json:"name"`
			Picture string `json:"picture"`
		}
		if err := p.request(ctx, http.MethodGet, "https://api.linkedin.com/v2/userinfo", credentials.AccessToken, nil, nil, &member); err != nil {
			return RemoteAccount{}, err
		}
		if "urn:li:person:"+member.Sub != author {
			return RemoteAccount{}, errors.New("connected LinkedIn member is unavailable")
		}
		return RemoteAccount{ID: author, Name: member.Name, AvatarURL: member.Picture, Credentials: credentials}, nil
	}
	if !p.config.LinkedInOrganizationEnabled || !strings.HasPrefix(author, "urn:li:organization:") {
		return RemoteAccount{}, errors.New("connected LinkedIn organization is unavailable")
	}
	organizationID := strings.TrimPrefix(author, "urn:li:organization:")
	if organizationID == "" || strings.IndexFunc(organizationID, func(r rune) bool { return r < '0' || r > '9' }) >= 0 {
		return RemoteAccount{}, errors.New("invalid LinkedIn organization identifier")
	}
	query := url.Values{"q": {"organization"}, "organization": {author}, "role": {"ADMINISTRATOR"}, "state": {"APPROVED"}}
	var access struct {
		Elements []json.RawMessage `json:"elements"`
	}
	if err := p.linkedInRequest(ctx, http.MethodGet, "https://api.linkedin.com/rest/organizationAcls?"+query.Encode(), credentials.AccessToken, nil, &access); err != nil {
		return RemoteAccount{}, err
	}
	if len(access.Elements) == 0 {
		return RemoteAccount{}, errors.New("LinkedIn organization administrator access was removed")
	}
	var organization struct {
		LocalizedName string `json:"localizedName"`
		VanityName    string `json:"vanityName"`
		Logo          struct {
			Original struct {
				Elements []struct {
					Identifiers []struct {
						Identifier string `json:"identifier"`
					} `json:"identifiers"`
				} `json:"elements"`
			} `json:"original~"`
		} `json:"logoV2"`
	}
	if err := p.linkedInRequest(ctx, http.MethodGet, "https://api.linkedin.com/rest/organizations/"+organizationID, credentials.AccessToken, nil, &organization); err != nil {
		return RemoteAccount{}, err
	}
	avatar := ""
	if len(organization.Logo.Original.Elements) > 0 && len(organization.Logo.Original.Elements[0].Identifiers) > 0 {
		avatar = organization.Logo.Original.Elements[0].Identifiers[0].Identifier
	}
	return RemoteAccount{ID: author, Name: organization.LocalizedName, Username: organization.VanityName, AvatarURL: avatar, Credentials: credentials}, nil
}

func LinkedInAuthorizationRevoked(err error) bool {
	var rejected *providerRejection
	return errors.As(err, &rejected) && (rejected.status == http.StatusUnauthorized || rejected.status == http.StatusForbidden || rejected.code == "invalid_token")
}

func (p *ProviderClient) PublishLinkedIn(ctx context.Context, author string, credentials Credentials, media []PublishMedia, caption string) (string, string, error) {
	if err := ValidateMediaReferences("linkedin", media); err != nil {
		return "", "failed", err
	}
	if !strings.HasPrefix(author, "urn:li:person:") && !strings.HasPrefix(author, "urn:li:organization:") {
		return "", "failed", errors.New("invalid LinkedIn author")
	}
	if len(caption) > 3000 {
		return "", "failed", errors.New("LinkedIn commentary must be at most 3000 bytes")
	}
	if !verifiedMediaURL(p.config.LinkedInMediaURLPrefix, media[0].URL) {
		return "", "failed", errors.New("LinkedIn requires one video from the configured media storage")
	}

	client := *p.httpClient
	client.Timeout = 30 * time.Minute
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, media[0].URL, nil)
	if err != nil {
		return "", "failed", errors.New("invalid LinkedIn media URL")
	}
	sourceClient := client
	if sourceClient.Transport == nil {
		transport := http.DefaultTransport.(*http.Transport).Clone()
		transport.Proxy = nil
		transport.DialContext = youtubeMediaDial
		sourceClient.Transport = transport
		defer transport.CloseIdleConnections()
	}
	source, err := sourceClient.Do(request)
	if err != nil {
		return "", "failed", errors.New("LinkedIn source video could not be read")
	}
	defer source.Body.Close()
	contentType, _, _ := mime.ParseMediaType(source.Header.Get("Content-Type"))
	if source.StatusCode != http.StatusOK || source.ContentLength > linkedinMaxUploadBytes || (!strings.HasPrefix(contentType, "video/mp4") && contentType != "application/octet-stream") {
		return "", "failed", errors.New("LinkedIn requires an MP4 video of at most 500 MB")
	}
	temporary, err := os.CreateTemp("", "sneepcut-linkedin-video-*.mp4")
	if err != nil {
		return "", "failed", errors.New("LinkedIn upload staging is unavailable")
	}
	temporaryName := temporary.Name()
	defer os.Remove(temporaryName)
	written, copyErr := io.Copy(temporary, io.LimitReader(source.Body, linkedinMaxUploadBytes+1))
	if closeErr := temporary.Close(); copyErr != nil || closeErr != nil || written <= 0 || written > linkedinMaxUploadBytes {
		return "", "failed", errors.New("LinkedIn source video could not be staged")
	}

	var initialized struct {
		Value struct {
			Video              string `json:"video"`
			UploadToken        string `json:"uploadToken"`
			UploadInstructions []struct {
				FirstByte int64  `json:"firstByte"`
				LastByte  int64  `json:"lastByte"`
				UploadURL string `json:"uploadUrl"`
			} `json:"uploadInstructions"`
		} `json:"value"`
	}
	initializeBody := map[string]any{"initializeUploadRequest": map[string]any{"owner": author, "fileSizeBytes": written, "uploadCaptions": false, "uploadThumbnail": false}}
	if err := p.linkedInRequest(ctx, http.MethodPost, "https://api.linkedin.com/rest/videos?action=initializeUpload", credentials.AccessToken, initializeBody, &initialized); err != nil {
		return "", "unknown", err
	}
	if initialized.Value.Video == "" || initialized.Value.UploadToken == "" || len(initialized.Value.UploadInstructions) == 0 {
		return "", "unknown", errors.New("LinkedIn returned an invalid upload session")
	}
	file, err := os.Open(temporaryName)
	if err != nil {
		return "", "failed", errors.New("LinkedIn staged video could not be opened")
	}
	defer file.Close()
	partIDs := make([]string, 0, len(initialized.Value.UploadInstructions))
	for _, instruction := range initialized.Value.UploadInstructions {
		uploadURL, parseErr := url.Parse(instruction.UploadURL)
		length := instruction.LastByte - instruction.FirstByte + 1
		if parseErr != nil || uploadURL.Scheme != "https" || uploadURL.User != nil || uploadURL.Fragment != "" || (!strings.EqualFold(uploadURL.Hostname(), "linkedin.com") && !strings.HasSuffix(strings.ToLower(uploadURL.Hostname()), ".linkedin.com")) || instruction.FirstByte < 0 || length <= 0 || instruction.LastByte >= written {
			return "", "unknown", errors.New("LinkedIn returned invalid upload instructions")
		}
		partRequest, requestErr := http.NewRequestWithContext(ctx, http.MethodPut, uploadURL.String(), io.NewSectionReader(file, instruction.FirstByte, length))
		if requestErr != nil {
			return "", "unknown", errors.New("LinkedIn video part could not be prepared")
		}
		partRequest.ContentLength = length
		partRequest.Header.Set("Content-Type", "application/octet-stream")
		response, uploadErr := client.Do(partRequest)
		if uploadErr != nil {
			return "", "unknown", errors.New("LinkedIn video upload could not be confirmed")
		}
		io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
		response.Body.Close()
		if response.StatusCode < 200 || response.StatusCode >= 300 {
			return "", "unknown", errors.New("LinkedIn rejected a video part")
		}
		partID := strings.Trim(response.Header.Get("ETag"), "\"")
		if partID == "" {
			return "", "unknown", errors.New("LinkedIn did not confirm a video part")
		}
		partIDs = append(partIDs, partID)
	}
	finalizeBody := map[string]any{"finalizeUploadRequest": map[string]any{"video": initialized.Value.Video, "uploadToken": initialized.Value.UploadToken, "uploadedPartIds": partIDs}}
	if err := p.linkedInRequest(ctx, http.MethodPost, "https://api.linkedin.com/rest/videos?action=finalizeUpload", credentials.AccessToken, finalizeBody, nil); err != nil {
		return "", "unknown", err
	}
	job, _ := json.Marshal(linkedInVideoJob{Author: author, Video: initialized.Value.Video, Caption: caption, Title: strings.TrimSpace(caption)})
	return string(job), "processing", nil
}

func decodeLinkedInJob(raw string) (linkedInVideoJob, error) {
	var job linkedInVideoJob
	if json.Unmarshal([]byte(raw), &job) != nil || job.Author == "" || job.Video == "" {
		return job, errors.New("invalid LinkedIn publishing job")
	}
	return job, nil
}

func (p *ProviderClient) pollLinkedIn(ctx context.Context, raw string, credentials Credentials) (string, string, error) {
	job, err := decodeLinkedInJob(raw)
	if err != nil {
		return "failed", "", err
	}
	var video struct {
		Status                  string `json:"status"`
		ProcessingFailureReason string `json:"processingFailureReason"`
	}
	endpoint := "https://api.linkedin.com/rest/videos/" + url.QueryEscape(job.Video)
	if err := p.linkedInRequest(ctx, http.MethodGet, endpoint, credentials.AccessToken, nil, &video); err != nil {
		return "processing", "", err
	}
	switch video.Status {
	case "AVAILABLE":
		return "ready", "", nil
	case "PROCESSING_FAILED":
		return "failed", "", errors.New("LinkedIn video processing failed")
	default:
		return "processing", "", nil
	}
}

func (p *ProviderClient) finalizeLinkedIn(ctx context.Context, raw string, credentials Credentials) (string, string, error) {
	job, err := decodeLinkedInJob(raw)
	if err != nil {
		return "", "", err
	}
	title := job.Title
	if title == "" {
		title = "Sneep Cut video"
	}
	titleRunes := []rune(title)
	if len(titleRunes) > 200 {
		title = string(titleRunes[:200])
	}
	body := map[string]any{
		"author": job.Author, "commentary": job.Caption, "visibility": "PUBLIC", "lifecycleState": "PUBLISHED", "isReshareDisabledByAuthor": false,
		"distribution": map[string]any{"feedDistribution": "MAIN_FEED", "targetEntities": []any{}, "thirdPartyDistributionChannels": []any{}},
		"content":      map[string]any{"media": map[string]any{"title": title, "id": job.Video}},
	}
	encoded, _ := json.Marshal(body)
	request, _ := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.linkedin.com/rest/posts", strings.NewReader(string(encoded)))
	request.Header.Set("Authorization", "Bearer "+credentials.AccessToken)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Linkedin-Version", p.config.LinkedInAPIVersion)
	request.Header.Set("X-Restli-Protocol-Version", "2.0.0")
	response, err := p.httpClient.Do(request)
	if err != nil {
		return "", "", errors.New("LinkedIn publication could not be confirmed")
	}
	defer response.Body.Close()
	io.Copy(io.Discard, io.LimitReader(response.Body, 2<<20))
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return "", "", &providerRejection{status: response.StatusCode}
	}
	postID := response.Header.Get("X-RestLi-Id")
	if postID == "" {
		return "", "", errors.New("LinkedIn did not return a post identifier")
	}
	return postID, "https://www.linkedin.com/feed/update/" + postID + "/", nil
}

func (p *ProviderClient) deleteLinkedInPost(ctx context.Context, remoteID string, credentials Credentials) error {
	if !strings.HasPrefix(remoteID, "urn:li:share:") && !strings.HasPrefix(remoteID, "urn:li:ugcPost:") {
		return errors.New("invalid LinkedIn post identifier")
	}
	endpoint := "https://api.linkedin.com/rest/posts/" + url.QueryEscape(remoteID)
	request, err := http.NewRequestWithContext(ctx, http.MethodDelete, endpoint, nil)
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+credentials.AccessToken)
	request.Header.Set("Linkedin-Version", p.config.LinkedInAPIVersion)
	request.Header.Set("X-Restli-Protocol-Version", "2.0.0")
	request.Header.Set("X-RestLi-Method", "DELETE")
	return p.execute(request, nil)
}

func linkedInScopesGranted(granted string, organizations bool) bool {
	available := map[string]bool{}
	for _, scope := range strings.FieldsFunc(granted, func(r rune) bool { return r == ' ' || r == ',' }) {
		available[scope] = true
	}
	required := []string{"openid", "profile", "w_member_social"}
	if organizations {
		required = append(required, "rw_organization_admin", "r_organization_social", "w_organization_social")
	}
	for _, scope := range required {
		if !available[scope] {
			return false
		}
	}
	return true
}
