package openrouter

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
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
		// Qwen Omni accepts inline audio/video only below 10 MB after
		// base64 encoding. Reject before allocating or transmitting the body.
		if strings.HasPrefix(c.Model, "qwen/qwen3.8-omni") && item.MIME != "image/jpeg" && base64.StdEncoding.EncodedLen(len(item.Data)) >= 10_000_000 {
			return "", errors.New("Qwen Omni inline audio or video exceeds the model limit")
		}
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
	return mediaReviewContent(data)
}

// mediaReviewContent accepts string or text-part content. Failures report only
// the provider's error code or finish reason, never the upstream body.
func mediaReviewContent(data []byte) (string, error) {
	var result struct {
		Choices []struct {
			FinishReason string `json:"finish_reason"`
			Message      struct {
				Content json.RawMessage `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Error *struct {
			Code any `json:"code"`
		} `json:"error"`
	}
	if json.Unmarshal(data, &result) != nil {
		return "", errors.New("media reviewer returned an invalid response")
	}
	if result.Error != nil {
		return "", fmt.Errorf("media reviewer returned provider error %v", result.Error.Code)
	}
	if len(result.Choices) == 0 {
		return "", errors.New("media reviewer returned no choices")
	}
	choice := result.Choices[0]
	var text string
	if json.Unmarshal(choice.Message.Content, &text) != nil {
		var parts []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		}
		if json.Unmarshal(choice.Message.Content, &parts) == nil {
			var joined strings.Builder
			for _, part := range parts {
				if part.Type == "text" {
					joined.WriteString(part.Text)
				}
			}
			text = joined.String()
		}
	}
	if strings.TrimSpace(text) == "" {
		return "", fmt.Errorf("media reviewer returned no content (finish_reason=%q)", choice.FinishReason)
	}
	return text, nil
}
