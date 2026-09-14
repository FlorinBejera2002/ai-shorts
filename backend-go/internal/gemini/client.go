package gemini

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"sneepcut/backend-go/internal/aiprovider"
)

var ErrNotConfigured = aiprovider.ErrNotConfigured

type Generator = aiprovider.Generator
type Client struct {
	Key, Model string
	HTTP       *http.Client
	BaseURL    string
}

func New(key, model string) *Client {
	if model == "" {
		model = "gemini-2.5-flash"
	}
	return &Client{Key: key, Model: model, HTTP: &http.Client{Timeout: 90 * time.Second}, BaseURL: "https://generativelanguage.googleapis.com/v1beta"}
}
func (c *Client) Generate(ctx context.Context, prompt string) (string, error) {
	if c.Key == "" {
		return "", ErrNotConfigured
	}
	body, _ := json.Marshal(map[string]any{"contents": []any{map[string]any{"role": "user", "parts": []any{map[string]any{"text": prompt}}}}, "generationConfig": map[string]any{"responseMimeType": "application/json"}})
	r, err := http.NewRequestWithContext(ctx, http.MethodPost, c.BaseURL+"/models/"+url.PathEscape(c.Model)+":generateContent", bytes.NewReader(body))
	if err != nil {
		return "", errors.New("AI provider configuration is invalid")
	}
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("x-goog-api-key", c.Key)
	client := &http.Client{Timeout: 90 * time.Second}
	if c.HTTP != nil {
		clientCopy := *c.HTTP
		client = &clientCopy
	}
	// API credentials belong to the configured provider. The Go client treats
	// x-goog-api-key as an ordinary header, so redirects must not forward it.
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	response, err := client.Do(r)
	if err != nil {
		return "", errors.New("AI provider is temporarily unavailable")
	}
	// Read errors are handled below; closing the body is best-effort cleanup.
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode != http.StatusOK {
		return "", errors.New("AI provider rejected the request")
	}
	var result struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text    string `json:"text"`
					Thought bool   `json:"thought"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}
	payload, err := io.ReadAll(io.LimitReader(response.Body, 2*1024*1024+1))
	if err != nil || len(payload) > 2*1024*1024 {
		return "", errors.New("AI provider returned an invalid response")
	}
	if err = json.Unmarshal(payload, &result); err != nil || len(result.Candidates) == 0 {
		return "", errors.New("AI provider returned an invalid response")
	}
	var text strings.Builder
	for _, part := range result.Candidates[0].Content.Parts {
		if !part.Thought {
			text.WriteString(part.Text)
		}
	}
	if text.Len() == 0 {
		return "", errors.New("AI provider returned no text")
	}
	return text.String(), nil
}

func ExtractJSON(text string) (map[string]any, error) {
	text = strings.TrimSpace(text)
	text = strings.TrimPrefix(text, "```json")
	text = strings.TrimPrefix(text, "```")
	text = strings.TrimSuffix(text, "```")
	text = strings.TrimSpace(text)
	var parsed any
	if err := json.Unmarshal([]byte(text), &parsed); err == nil {
		value, ok := parsed.(map[string]any)
		if !ok {
			return nil, errors.New("AI response must be a JSON object")
		}
		return value, nil
	}
	start, end := strings.Index(text, "{"), strings.LastIndex(text, "}")
	if start < 0 || end <= start {
		return nil, errors.New("AI response must be a JSON object")
	}
	var value map[string]any
	if err := json.Unmarshal([]byte(text[start:end+1]), &value); err != nil || value == nil {
		return nil, errors.New("AI response must be a JSON object")
	}
	return value, nil
}
