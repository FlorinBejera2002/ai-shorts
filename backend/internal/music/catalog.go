// Package music provides an externally hosted, attributed music catalogue.
package music

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"sync"
	"time"
)

var (
	ErrNotFound = errors.New("music track not found")
	ErrInvalid  = errors.New("invalid music request")
)

type Track struct {
	ID              string   `json:"id"`
	Title           string   `json:"title"`
	Artist          string   `json:"artist"`
	DurationSeconds float64  `json:"duration_seconds"`
	BPM             float64  `json:"bpm"`
	Genres          []string `json:"genres"`
	Moods           []string `json:"moods"`
	PreviewURL      string   `json:"preview_url"`
	SourceURL       string   `json:"source_url"`
	License         string   `json:"license"`
	LicenseURL      string   `json:"license_url"`
	Attribution     string   `json:"attribution"`
}

type SearchResult struct {
	Tracks  []Track `json:"tracks"`
	Total   int     `json:"total"`
	Page    int     `json:"page"`
	HasMore bool    `json:"has_more"`
}

type entry struct {
	track  Track
	search string
}

// Catalog caches metadata only. Selected audio is downloaded into the caller's
// temporary render directory; the provider's library is never bundled locally.
type Catalog struct {
	client        *http.Client
	now           func() time.Time
	metadataLimit int64
	audioLimit    int64
	mu            sync.Mutex
	entries       []entry
	updated       time.Time
	retryAfter    time.Time
	lastError     error
	loading       chan struct{}
}

func NewCatalog() *Catalog {
	return &Catalog{
		client: &http.Client{Timeout: 90 * time.Second, CheckRedirect: providerRedirect},
		now:    time.Now, metadataLimit: 8 << 20, audioLimit: 64 << 20,
	}
}

func (c *Catalog) Search(ctx context.Context, query string, page, limit int) (SearchResult, error) {
	if len(query) > 200 || page < 0 || page > 100000 || limit < 0 || limit > 50 {
		return SearchResult{}, ErrInvalid
	}
	if page == 0 {
		page = 1
	}
	if limit == 0 {
		limit = 24
	}
	entries, err := c.snapshot(ctx)
	if err != nil {
		return SearchResult{}, err
	}
	terms := strings.Fields(strings.ToLower(query))
	result := SearchResult{Tracks: []Track{}, Page: page}
	start := (page - 1) * limit
	for _, item := range entries {
		matches := true
		for _, term := range terms {
			if !strings.Contains(item.search, term) {
				matches = false
				break
			}
		}
		if !matches {
			continue
		}
		if result.Total >= start && len(result.Tracks) < limit {
			result.Tracks = append(result.Tracks, cloneTrack(item.track))
		}
		result.Total++
	}
	result.HasMore = start+len(result.Tracks) < result.Total
	return result, nil
}

func (c *Catalog) Get(ctx context.Context, id string) (Track, error) {
	if !validID(id) {
		return Track{}, ErrInvalid
	}
	entries, err := c.snapshot(ctx)
	if err != nil {
		return Track{}, err
	}
	for _, item := range entries {
		if item.track.ID == id {
			return cloneTrack(item.track), nil
		}
	}
	return Track{}, ErrNotFound
}

func cloneTrack(track Track) Track {
	track.Genres = append([]string{}, track.Genres...)
	track.Moods = append([]string{}, track.Moods...)
	return track
}

func (c *Catalog) snapshot(ctx context.Context) ([]entry, error) {
	for {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		c.mu.Lock()
		now := c.now()
		if len(c.entries) > 0 && now.Sub(c.updated) < 6*time.Hour {
			entries := c.entries
			c.mu.Unlock()
			return entries, nil
		}
		if now.Before(c.retryAfter) {
			entries, err := c.cachedAfterFailure(now)
			c.mu.Unlock()
			return entries, err
		}
		if c.loading != nil {
			loading := c.loading
			c.mu.Unlock()
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-loading:
				continue
			}
		}
		c.loading = make(chan struct{})
		c.mu.Unlock()

		fetchCtx, cancel := context.WithTimeout(ctx, 25*time.Second)
		entries, err := c.fetch(fetchCtx)
		cancel()
		c.mu.Lock()
		if err == nil {
			c.entries, c.updated, c.lastError = entries, c.now(), nil
			c.retryAfter = time.Time{}
		} else {
			c.lastError = err
			// A disconnected caller must not poison the cache for other users.
			if ctx.Err() == nil {
				c.retryAfter = c.now().Add(time.Minute)
			}
		}
		close(c.loading)
		c.loading = nil
		if err != nil {
			entries, err = c.cachedAfterFailure(c.now())
		}
		c.mu.Unlock()
		return entries, err
	}
}

// A short provider outage may use recently verified metadata, but never an
// indefinitely stale catalogue after tracks have been changed or withdrawn.
func (c *Catalog) cachedAfterFailure(now time.Time) ([]entry, error) {
	if len(c.entries) > 0 && now.Sub(c.updated) < 24*time.Hour {
		return c.entries, nil
	}
	return nil, c.lastError
}
