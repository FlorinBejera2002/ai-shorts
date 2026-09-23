package aiprovider

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"
)

// MediaReviewer is optional. A text-only model cannot certify rendered media.
// Parts contain bounded private bytes, never provider-fetchable storage URLs.
type MediaReviewer interface {
	ReviewMedia(context.Context, string, []MediaPart) (string, error)
}

// MediaModelIdentity allows semantic caches to follow configured model changes.
// The identity contains provider/model names only, never credentials or URLs.
type MediaModelIdentity interface {
	MediaModelIdentity() string
}

type MediaPart struct {
	Label string
	MIME  string
	Data  []byte
}

const MaxReviewBytes = 12 << 20

func ValidateMedia(parts []MediaPart) error {
	if len(parts) == 0 || len(parts) > 512 {
		return errors.New("invalid media review inputs")
	}
	total := 0
	for _, part := range parts {
		total += len(part.Data)
		if len(part.Data) == 0 || total > MaxReviewBytes {
			return errors.New("media review input exceeds size limit")
		}
		switch part.MIME {
		case "video/mp4", "audio/mpeg", "image/jpeg":
		default:
			return errors.New("unsupported review media type")
		}
	}
	return nil
}

// MediaJSON performs the shared bounded request. Provider errors never disclose
// source media, prompts, credentials, or upstream response bodies.
func MediaJSON(ctx context.Context, client *http.Client, endpoint string, headers map[string]string, body any) ([]byte, error) {
	encoded, err := json.Marshal(body)
	if err != nil || len(encoded) > 18<<20 {
		return nil, errors.New("media review request is too large")
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(encoded))
	if err != nil {
		return nil, errors.New("media reviewer configuration is invalid")
	}
	request.Header.Set("Content-Type", "application/json")
	for key, value := range headers {
		request.Header.Set(key, value)
	}
	bounded := &http.Client{Timeout: 90 * time.Second}
	if client != nil {
		copy := *client
		bounded = &copy
		if bounded.Timeout == 0 || bounded.Timeout > 90*time.Second {
			bounded.Timeout = 90 * time.Second
		}
	}
	bounded.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	response, err := bounded.Do(request)
	if err != nil {
		return nil, errors.New("media reviewer is unavailable")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, errors.New("configured model could not review the media")
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, (2<<20)+1))
	if err != nil || len(data) > 2<<20 {
		return nil, errors.New("media reviewer returned an invalid response")
	}
	return data, nil
}
