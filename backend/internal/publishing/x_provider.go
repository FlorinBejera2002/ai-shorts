package publishing

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
)

const (
	xMaxUploadBytes = int64(2 << 30)
	xChunkBytes     = int64(5 << 20)
)

type xMediaJob struct {
	MediaID string `json:"mediaId"`
	Caption string `json:"caption"`
}

type xMediaResponse struct {
	Data struct {
		ID             string `json:"id"`
		ExpiresAfter   int    `json:"expires_after_secs"`
		ProcessingInfo struct {
			State          string `json:"state"`
			CheckAfterSecs int    `json:"check_after_secs"`
		} `json:"processing_info"`
	} `json:"data"`
}

func (p *ProviderClient) xTokenRequest(ctx context.Context, endpoint string, form url.Values, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return errors.New("invalid X authorization request")
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.SetBasicAuth(p.config.XClientID, p.config.XClientSecret)
	return p.execute(req, out)
}

func (p *ProviderClient) XAccounts(ctx context.Context, credentials Credentials) ([]RemoteAccount, error) {
	var response struct {
		Data struct {
			ID, Name, Username string
			AvatarURL          string `json:"profile_image_url"`
		}
	}
	if err := p.request(ctx, http.MethodGet, "https://api.x.com/2/users/me?user.fields=profile_image_url", credentials.AccessToken, nil, nil, &response); err != nil {
		return nil, err
	}
	if response.Data.ID == "" || response.Data.Username == "" {
		return nil, errors.New("X did not return an account identifier")
	}
	return []RemoteAccount{{ID: response.Data.ID, Name: response.Data.Name, Username: response.Data.Username, AvatarURL: response.Data.AvatarURL, Credentials: credentials}}, nil
}

func (p *ProviderClient) XAccount(ctx context.Context, credentials Credentials, expectedID string) (RemoteAccount, error) {
	accounts, err := p.XAccounts(ctx, credentials)
	if err != nil {
		return RemoteAccount{}, err
	}
	if len(accounts) != 1 || accounts[0].ID != expectedID {
		return RemoteAccount{}, errors.New("connected X account is unavailable")
	}
	return accounts[0], nil
}

func XAuthorizationRevoked(err error) bool {
	var rejected *providerRejection
	return errors.As(err, &rejected) && (rejected.status == http.StatusUnauthorized || rejected.status == http.StatusForbidden)
}

func (p *ProviderClient) appendXChunk(ctx context.Context, credentials Credentials, mediaID string, segment int, chunk []byte) error {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if err := writer.WriteField("segment_index", strconv.Itoa(segment)); err != nil {
		return errors.New("X video chunk could not be prepared")
	}
	part, err := writer.CreateFormFile("media", "chunk.mp4")
	if err != nil {
		return errors.New("X video chunk could not be prepared")
	}
	if _, err = part.Write(chunk); err != nil {
		return errors.New("X video chunk could not be prepared")
	}
	if err = writer.Close(); err != nil {
		return errors.New("X video chunk could not be prepared")
	}
	endpoint := "https://api.x.com/2/media/upload/" + url.PathEscape(mediaID) + "/append"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, &body)
	if err != nil {
		return errors.New("invalid X upload request")
	}
	req.Header.Set("Authorization", "Bearer "+credentials.AccessToken)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	return p.execute(req, nil)
}

func (p *ProviderClient) PublishX(ctx context.Context, account string, credentials Credentials, media []PublishMedia, caption string) (string, string, error) {
	if len(media) != 1 || media[0].Type != "video" || account == "" || strings.IndexFunc(account, func(r rune) bool { return r < '0' || r > '9' }) >= 0 {
		return "", "failed", errors.New("X requires one video and a valid connected account")
	}
	if len([]rune(caption)) > 280 {
		return "", "failed", errors.New("X post text must be at most 280 characters")
	}
	if !verifiedMediaURL(p.config.XMediaURLPrefix, media[0].URL) {
		return "", "failed", errors.New("X requires one video from the configured media storage")
	}
	mediaURL, err := url.Parse(media[0].URL)
	if err != nil {
		return "", "failed", errors.New("invalid X media URL")
	}
	downloader := &http.Client{Timeout: 0, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }, Transport: &http.Transport{Proxy: http.ProxyFromEnvironment, DialContext: youtubeMediaDial}}
	request, _ := http.NewRequestWithContext(ctx, http.MethodGet, mediaURL.String(), nil)
	response, err := downloader.Do(request)
	if err != nil {
		return "", "failed", errors.New("X source video could not be read")
	}
	defer response.Body.Close()
	contentType := strings.ToLower(strings.TrimSpace(strings.Split(response.Header.Get("Content-Type"), ";")[0]))
	if response.StatusCode < 200 || response.StatusCode >= 300 || contentType != "video/mp4" || response.ContentLength <= 0 || response.ContentLength > xMaxUploadBytes {
		return "", "failed", errors.New("X requires an MP4 video of at most 2 GB")
	}
	file, err := os.CreateTemp("", "sneepcut-x-*.mp4")
	if err != nil {
		return "", "failed", errors.New("X upload staging is unavailable")
	}
	defer os.Remove(file.Name())
	defer file.Close()
	written, copyErr := io.Copy(file, io.LimitReader(response.Body, xMaxUploadBytes+1))
	if copyErr != nil || written != response.ContentLength || written > xMaxUploadBytes {
		return "", "failed", errors.New("X source video could not be staged")
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return "", "failed", errors.New("X staged video could not be opened")
	}
	var initialized xMediaResponse
	if err := p.request(ctx, http.MethodPost, "https://api.x.com/2/media/upload/initialize", credentials.AccessToken, nil, map[string]any{"media_type": "video/mp4", "total_bytes": written, "media_category": "tweet_video"}, &initialized); err != nil {
		return "", "unknown", err
	}
	if initialized.Data.ID == "" {
		return "", "unknown", errors.New("X returned an invalid upload session")
	}
	buffer := make([]byte, xChunkBytes)
	for segment := 0; ; segment++ {
		read, readErr := file.Read(buffer)
		if read > 0 {
			if err := p.appendXChunk(ctx, credentials, initialized.Data.ID, segment, buffer[:read]); err != nil {
				return "", "unknown", err
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return "", "unknown", errors.New("X video chunk could not be read")
		}
	}
	var finalized xMediaResponse
	endpoint := "https://api.x.com/2/media/upload/" + url.PathEscape(initialized.Data.ID) + "/finalize"
	if err := p.request(ctx, http.MethodPost, endpoint, credentials.AccessToken, nil, nil, &finalized); err != nil {
		return "", "unknown", err
	}
	job, _ := json.Marshal(xMediaJob{MediaID: initialized.Data.ID, Caption: caption})
	if strings.EqualFold(finalized.Data.ProcessingInfo.State, "failed") {
		return "", "failed", errors.New("X video processing failed")
	}
	return string(job), "processing", nil
}

func decodeXJob(raw string) (xMediaJob, error) {
	var job xMediaJob
	if json.Unmarshal([]byte(raw), &job) != nil || job.MediaID == "" {
		return job, errors.New("invalid X publishing job")
	}
	return job, nil
}

func (p *ProviderClient) pollX(ctx context.Context, raw string, credentials Credentials) (string, string, error) {
	job, err := decodeXJob(raw)
	if err != nil {
		return "failed", "", err
	}
	endpoint := "https://api.x.com/2/media/upload?command=STATUS&media_id=" + url.QueryEscape(job.MediaID)
	var response xMediaResponse
	if err := p.request(ctx, http.MethodGet, endpoint, credentials.AccessToken, nil, nil, &response); err != nil {
		return "processing", "", err
	}
	switch strings.ToLower(response.Data.ProcessingInfo.State) {
	case "succeeded", "success", "":
		return "ready", "", nil
	case "failed":
		return "failed", "", errors.New("X video processing failed")
	default:
		return "processing", "", nil
	}
}

func (p *ProviderClient) finalizeX(ctx context.Context, raw string, credentials Credentials) (string, string, error) {
	job, err := decodeXJob(raw)
	if err != nil {
		return "", "", err
	}
	var response struct {
		Data struct{ ID string }
	}
	body := map[string]any{"text": job.Caption, "media": map[string]any{"media_ids": []string{job.MediaID}}}
	if err := p.request(ctx, http.MethodPost, "https://api.x.com/2/tweets", credentials.AccessToken, nil, body, &response); err != nil {
		return "", "", err
	}
	if response.Data.ID == "" {
		return "", "", errors.New("X did not return a post identifier")
	}
	return response.Data.ID, "https://x.com/i/web/status/" + response.Data.ID, nil
}

func (p *ProviderClient) deleteXPost(ctx context.Context, remoteID string, credentials Credentials) error {
	if remoteID == "" || strings.IndexFunc(remoteID, func(r rune) bool { return r < '0' || r > '9' }) >= 0 {
		return errors.New("invalid X post identifier")
	}
	var response struct {
		Data struct{ Deleted bool }
	}
	if err := p.request(ctx, http.MethodDelete, "https://api.x.com/2/tweets/"+url.PathEscape(remoteID), credentials.AccessToken, nil, nil, &response); err != nil {
		return err
	}
	if !response.Data.Deleted {
		return errors.New("X did not confirm post deletion")
	}
	return nil
}

func xScopesGranted(granted string) bool {
	available := map[string]bool{}
	for _, scope := range strings.Fields(granted) {
		available[scope] = true
	}
	for _, scope := range []string{"tweet.read", "users.read", "tweet.write", "media.write", "offline.access"} {
		if !available[scope] {
			return false
		}
	}
	return true
}
