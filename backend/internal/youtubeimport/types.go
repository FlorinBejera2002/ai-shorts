// Package youtubeimport imports a user's own YouTube files through Google's
// Data Portability API. It is independent of YouTube publishing authorization.
package youtubeimport

import (
	"context"
	"errors"
	"sneepcut/backend-go/internal/locale"
	"strings"
	"time"
)

type Media interface {
	ImportSource(context.Context, string, ImportedVideo) (string, error)
	RemoveImportSource(context.Context, string, string) error
}

type Config struct {
	Enabled       bool
	TestMode      bool
	SecureCookies bool
	AppURL        string
	EncryptionKey string
	TempRoot      string
	FFmpegPath    string
	MaxImportAge  time.Duration
	PollInterval  time.Duration
	Limits        ArchiveLimits
}

type Import struct {
	ID           string    `json:"id"`
	Status       string    `json:"status"`
	Visibilities []string  `json:"visibilities"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
	Error        string    `json:"error"`
	VideoCount   int       `json:"video_count"`
	// Selection lists the chosen channel videos of a selected import; null for whole-category imports.
	Selection *SelectionOverview `json:"selection"`
}

type Video struct {
	ID               string `json:"id"`
	ImportID         string `json:"import_id"`
	Title            string `json:"title"`
	FileName         string `json:"file_name"`
	FileSize         int64  `json:"file_size"`
	SourceStorageKey string `json:"source_storage_key"`
	// ThumbnailURL is a short-lived signed URL, empty until a preview exists.
	ThumbnailURL string    `json:"thumbnail_url"`
	CreatedAt    time.Time `json:"created_at"`
	thumbnailKey string
}

type Overview struct {
	Enabled bool     `json:"enabled"`
	Imports []Import `json:"imports"`
	Videos  []Video  `json:"videos"`
}

var errLeaseLost = errors.New("YouTube import is no longer active")
var errActiveImport = errors.New("a YouTube import is already active")
var errImportBudget = errors.New("YouTube import limit reached")

func requestedResources(visibilities []string) ([]string, error) {
	if len(visibilities) < 1 || len(visibilities) > 2 {
		return nil, errors.New("choose which YouTube videos to import")
	}
	seen := make(map[string]bool)
	resources := make([]string, 0, len(visibilities))
	for _, visibility := range visibilities {
		var resource string
		switch visibility {
		case "public":
			resource = PublicVideos
		case "unlisted":
			resource = UnlistedVideos
		default:
			return nil, errors.New("unknown YouTube video visibility")
		}
		if seen[resource] {
			return nil, errors.New("duplicate YouTube video visibility")
		}
		seen[resource] = true
		resources = append(resources, resource)
	}
	return resources, nil
}

func resourceVisibilities(resources []string) []string {
	values := make([]string, 0, len(resources))
	for _, resource := range resources {
		values = append(values, strings.TrimSuffix(strings.TrimPrefix(resource, "youtube."), "_videos"))
	}
	return values
}

func returnURL(appURL, uiLocale, result string) string {
	prefix := locale.PathPrefix(uiLocale)
	query := "youtubeImport=success"
	if result != "success" {
		query = "youtubeImport=error&youtubeImportError=" + result
	}
	return strings.TrimRight(appURL, "/") + prefix + "/dashboard/create?mode=youtube&" + query
}
