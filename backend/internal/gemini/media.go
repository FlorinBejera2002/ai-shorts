package gemini

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/url"
	"strings"

	"sneepcut/backend-go/internal/aiprovider"
)

func (c *Client) MediaModelIdentity() string { return "gemini:" + c.Model }

// ReviewMedia uses generateContent's inlineData contract. It deliberately has
// no text-only fallback: unsupported audio/video leaves review incomplete.
func (c *Client) ReviewMedia(ctx context.Context, prompt string, media []aiprovider.MediaPart) (string, error) {
	if c.Key == "" {
		return "", ErrNotConfigured
	}
	if err := aiprovider.ValidateMedia(media); err != nil {
		return "", err
	}
	parts := []any{map[string]any{"text": prompt}}
	for _, item := range media {
		parts = append(parts, map[string]any{"text": item.Label})
		part := map[string]any{"inlineData": map[string]any{"mimeType": item.MIME, "data": base64.StdEncoding.EncodeToString(item.Data)}}
		if item.MIME == "video/mp4" {
			part["videoMetadata"] = map[string]any{"fps": 10}
		}
		parts = append(parts, part)
	}
	data, err := aiprovider.MediaJSON(ctx, c.HTTP, strings.TrimRight(c.BaseURL, "/")+"/models/"+url.PathEscape(c.Model)+":generateContent", map[string]string{"x-goog-api-key": c.Key}, map[string]any{
		"contents":         []any{map[string]any{"role": "user", "parts": parts}},
		"generationConfig": map[string]any{"responseMimeType": "application/json", "temperature": 0},
	})
	if err != nil {
		return "", err
	}
	var result struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text    string
					Thought bool
				}
			}
		}
	}
	if json.Unmarshal(data, &result) != nil || len(result.Candidates) == 0 {
		return "", errors.New("media reviewer returned an invalid response")
	}
	var text strings.Builder
	for _, part := range result.Candidates[0].Content.Parts {
		if !part.Thought {
			text.WriteString(part.Text)
		}
	}
	if text.Len() == 0 {
		return "", errors.New("media reviewer returned no findings")
	}
	return text.String(), nil
}
