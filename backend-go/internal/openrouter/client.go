package openrouter

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"sneepcut/backend-go/internal/aiprovider"
)

const defaultModel = "google/gemini-2.5-flash"

type Client struct {
	Key, Model, Referer string
	HTTP                *http.Client
	BaseURL             string
}

func New(key, model, referer string) *Client {
	if strings.TrimSpace(model) == "" {
		model = defaultModel
	}
	return &Client{
		Key:     strings.TrimSpace(key),
		Model:   strings.TrimSpace(model),
		Referer: strings.TrimSpace(referer),
		HTTP:    &http.Client{Timeout: 90 * time.Second},
		BaseURL: "https://openrouter.ai/api/v1",
	}
}

func (c *Client) Generate(ctx context.Context, prompt string) (string, error) {
	if c.Key == "" || c.Model == "" {
		return "", aiprovider.ErrNotConfigured
	}
	body, err := json.Marshal(map[string]any{
		"model": c.Model,
		"messages": []any{
			map[string]any{"role": "user", "content": prompt},
		},
	})
	if err != nil {
		return "", errors.New("AI provider request could not be prepared")
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(c.BaseURL, "/")+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", errors.New("AI provider configuration is invalid")
	}
	request.Header.Set("Authorization", "Bearer "+c.Key)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Title", "Sneepcut")
	if c.Referer != "" {
		request.Header.Set("HTTP-Referer", c.Referer)
	}

	client := &http.Client{Timeout: 90 * time.Second}
	if c.HTTP != nil {
		clientCopy := *c.HTTP
		client = &clientCopy
	}
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	response, err := client.Do(request)
	if err != nil {
		return "", errors.New("AI provider is temporarily unavailable")
	}
	// Read errors are handled below; closing the body is best-effort cleanup.
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode != http.StatusOK {
		return "", errors.New("AI provider rejected the request")
	}
	payload, err := io.ReadAll(io.LimitReader(response.Body, 2*1024*1024+1))
	if err != nil || len(payload) > 2*1024*1024 {
		return "", errors.New("AI provider returned an invalid response")
	}
	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err = json.Unmarshal(payload, &result); err != nil || len(result.Choices) == 0 {
		return "", errors.New("AI provider returned an invalid response")
	}
	content := strings.TrimSpace(result.Choices[0].Message.Content)
	if content == "" {
		return "", errors.New("AI provider returned no text")
	}
	return content, nil
}
