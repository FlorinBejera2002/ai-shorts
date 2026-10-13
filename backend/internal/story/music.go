package story

import (
	"context"
	"fmt"
	"regexp"

	"sneepcut/backend-go/internal/music"
)

// MusicSelection contains user choices only. URLs and licences are resolved
// from the trusted catalogue by the worker, never from client-supplied metadata.
type MusicSelection struct {
	TrackID string  `json:"track_id"`
	Volume  float64 `json:"volume"`
	Sync    bool    `json:"sync"`
}

type PreparedMusic struct {
	Track      music.Track
	Key        string
	Beats      []float64
	BPM        float64
	Confidence float64
}

type MusicPreparer interface {
	PrepareStoryMusic(context.Context, MusicSelection) (*PreparedMusic, error)
}

type MusicSync struct {
	Status       string `json:"status"`
	AdjustedCuts int    `json:"adjusted_cuts"`
}

// MusicCredit travels with each rendered version, including after rollback.
type MusicCredit struct {
	TrackID      string  `json:"track_id"`
	Title        string  `json:"title"`
	Artist       string  `json:"artist"`
	License      string  `json:"license"`
	LicenseURL   string  `json:"license_url"`
	SourceURL    string  `json:"source_url"`
	Attribution  string  `json:"attribution"`
	SyncStatus   string  `json:"sync_status"`
	AdjustedCuts int     `json:"adjusted_cuts"`
	BPM          float64 `json:"bpm"`
}

var musicIDPattern = regexp.MustCompile(`^incompetech:[A-Za-z0-9-]{1,80}$`)

func validateMusicSelection(selection *MusicSelection) error {
	if selection == nil {
		return nil
	}
	if !musicIDPattern.MatchString(selection.TrackID) {
		return fmt.Errorf("choose a track from the music catalogue")
	}
	if !finite(selection.Volume) || selection.Volume < 0 || selection.Volume > 1 {
		return fmt.Errorf("music volume must be between 0 and 1")
	}
	return nil
}
