package airouting

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"slices"
	"sort"
	"sync"
	"time"
)

// OpenRouterCatalog only reads public model metadata. It never receives API
// credentials, prompts or media. A failed refresh does not certify stale data.
type OpenRouterCatalog struct {
	HTTP    *http.Client
	URL     string
	mu      sync.Mutex
	cached  []Model
	expires time.Time
}

func NewOpenRouterCatalog() *OpenRouterCatalog {
	return &OpenRouterCatalog{HTTP: &http.Client{Timeout: 4 * time.Second}, URL: "https://openrouter.ai/api/v1/models"}
}

func cloneModels(models []Model) []Model {
	result := append([]Model{}, models...)
	for i := range result {
		result[i].InputModalities = append([]string{}, models[i].InputModalities...)
	}
	return result
}

func (c *OpenRouterCatalog) Models(ctx context.Context) ([]Model, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if time.Now().Before(c.expires) {
		return cloneModels(c.cached), nil
	}
	ctx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.URL, nil)
	if err != nil {
		return nil, ErrCatalogUnavailable
	}
	client := http.Client{Timeout: 4 * time.Second}
	if c.HTTP != nil {
		client = *c.HTTP
	}
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	response, err := client.Do(request)
	if err != nil {
		return nil, ErrCatalogUnavailable
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode != http.StatusOK {
		return nil, ErrCatalogUnavailable
	}
	const maxCatalogBytes = 8 << 20
	body, err := io.ReadAll(io.LimitReader(response.Body, maxCatalogBytes+1))
	if err != nil || len(body) > maxCatalogBytes {
		return nil, ErrCatalogUnavailable
	}
	var payload struct {
		Data []struct {
			ID           string `json:"id"`
			Name         string `json:"name"`
			Architecture struct {
				Input  []string `json:"input_modalities"`
				Output []string `json:"output_modalities"`
			} `json:"architecture"`
		} `json:"data"`
	}
	if json.Unmarshal(body, &payload) != nil {
		return nil, ErrCatalogUnavailable
	}
	models := []Model{}
	seen := map[string]bool{}
	for _, item := range payload.Data {
		if !validModelID(item.ID) || seen[item.ID] || !slices.Contains(item.Architecture.Output, "text") {
			continue
		}
		seen[item.ID] = true
		name := item.Name
		if name == "" {
			name = item.ID
		}
		models = append(models, Model{ID: item.ID, Name: name, Provider: "openrouter", InputModalities: item.Architecture.Input})
	}
	if len(models) == 0 {
		return nil, ErrCatalogUnavailable
	}
	sort.Slice(models, func(i, j int) bool { return models[i].ID < models[j].ID })
	c.cached, c.expires = models, time.Now().Add(5*time.Minute)
	return cloneModels(models), nil
}
