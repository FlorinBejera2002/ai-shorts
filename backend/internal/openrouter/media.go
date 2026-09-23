package openrouter

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"

	"sneepcut/backend-go/internal/aiprovider"
)

func (c *Client) MediaModelIdentity() string { return "openrouter:" + c.Model }

func (c *Client) ReviewMedia(ctx context.Context, prompt string, media []aiprovider.MediaPart) (string, error) {
	if c.Key == "" || c.Model == "" {
		return "", aiprovider.ErrNotConfigured
	}
	if err := aiprovider.ValidateMedia(media); err != nil {
		return "", err
	}
	parts := []any{map[string]any{"type": "text", "text": prompt}}
	for _, item := range media {
		parts = append(parts, map[string]any{"type": "text", "text": item.Label})
		encoded := base64.StdEncoding.EncodeToString(item.Data)
		switch item.MIME {
		case "video/mp4":
			parts = append(parts, map[string]any{"type": "video_url", "video_url": map[string]any{"url": "data:video/mp4;base64," + encoded}})
		case "audio/mpeg":
			parts = append(parts, map[string]any{"type": "input_audio", "input_audio": map[string]any{"data": encoded, "format": "mp3"}})
		case "image/jpeg":
			parts = append(parts, map[string]any{"type": "image_url", "image_url": map[string]any{"url": "data:image/jpeg;base64," + encoded}})
		}
	}
	headers := map[string]string{"Authorization": "Bearer " + c.Key, "X-Title": "Sneepcut"}
	if c.Referer != "" {
		headers["HTTP-Referer"] = c.Referer
	}
	data, err := aiprovider.MediaJSON(ctx, c.HTTP, strings.TrimRight(c.BaseURL, "/")+"/chat/completions", headers, map[string]any{
		"model": c.Model, "temperature": 0, "messages": []any{map[string]any{"role": "user", "content": parts}},
		"provider": map[string]any{"data_collection": "deny"},
	})
	if err != nil {
		return "", err
	}
	var result struct {
		Choices []struct{ Message struct{ Content string } }
	}
	if json.Unmarshal(data, &result) != nil || len(result.Choices) == 0 || strings.TrimSpace(result.Choices[0].Message.Content) == "" {
		return "", errors.New("media reviewer returned an invalid response")
	}
	return result.Choices[0].Message.Content, nil
}
