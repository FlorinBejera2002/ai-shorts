package story

import (
	"context"
	"fmt"
	"regexp"
	"strings"

	"sneepcut/backend-go/internal/music"
)

// MusicSelection contains user choices only. URLs and licences are resolved
// from the trusted catalogue by the worker, never from client-supplied metadata.
type MusicSelection struct {
	TrackID         string  `json:"track_id"`
	Volume          float64 `json:"volume"`
	Sync            bool    `json:"sync"`
	UploadReference string  `json:"upload_reference,omitempty"`
	Title           string  `json:"title,omitempty"`
	StartSeconds    float64 `json:"start_seconds,omitempty"`
	EndSeconds      float64 `json:"end_seconds,omitempty"`
	Loop            *bool   `json:"loop,omitempty"`
	SourceAudio     string  `json:"source_audio,omitempty"` // Empty/preserve retains original audio; mute is an explicit music-led edit.
}

type PreparedMusic struct {
	Track       music.Track
	Key         string
	Beats       []float64
	BPM         float64
	Confidence  float64
	Analysis    *MusicAnalysis
	SourceStart float64
	SourceEnd   float64
	Repeat      bool
}

// MusicAnalysis contains evidence, never commands to cut. Times refer to the
// prepared excerpt so planning, preview offsets and rendered audio agree.
type MusicAnalysis struct {
	Version  string             `json:"version"`
	Model    string             `json:"model,omitempty"`
	Summary  string             `json:"summary,omitempty"`
	Duration float64            `json:"duration"`
	Events   []MusicEvent       `json:"events"`
	Regions  []MusicRegion      `json:"regions"`
	Energy   []MusicEnergyPoint `json:"energy"`
	Sections []MusicSection     `json:"sections,omitempty"`
	Timing   *MusicTiming       `json:"timing,omitempty"`
}

// MusicTiming is independent waveform evidence, never hosted-model estimates.
// Events describe measured attacks; regions do not authorize a synthetic grid.
type MusicTiming struct {
	Version  string        `json:"version"`
	Method   string        `json:"method"`
	Duration float64       `json:"duration"`
	Events   []MusicEvent  `json:"events"`
	Regions  []MusicRegion `json:"regions,omitempty"`
}

const MeasuredMusicTimingVersion = "waveform-rhythm-1"
const MeasuredMusicTimingMethod = "measured-onsets"

type MusicEvent struct {
	Time               float64 `json:"time"`
	Kind               string  `json:"kind"`
	Strength           float64 `json:"strength"`
	Confidence         float64 `json:"confidence"`
	UncertaintySeconds float64 `json:"uncertainty_seconds,omitempty"`
}

// MusicSection is hosted musical interpretation, not a command to cut or a
// guarantee of beat precision. All times use the prepared excerpt's clock.
type MusicSection struct {
	Start      float64 `json:"start"`
	End        float64 `json:"end"`
	Label      string  `json:"label"`
	Energy     float64 `json:"energy"`
	Pace       string  `json:"pace"`
	Transition string  `json:"transition"`
	Confidence float64 `json:"confidence"`
}
type MusicRegion struct {
	Start      float64 `json:"start"`
	End        float64 `json:"end"`
	BPM        float64 `json:"bpm"`
	Confidence float64 `json:"confidence"`
}
type MusicEnergyPoint struct {
	Time  float64 `json:"time"`
	Value float64 `json:"value"`
}

// OwnedMusicPreparer resolves private uploads using authenticated request
// ownership. Legacy preparers remain valid for public catalogue tracks only.
type OwnedMusicPreparer interface {
	PrepareStoryMusicForUser(context.Context, string, MusicSelection) (*PreparedMusic, error)
}

func (s MusicSelection) Repeats() bool { return s.Loop == nil || *s.Loop }

// UsesMusicOnlyAudio never infers permission to mute from a missing transcript.
// Recorded narration is governed separately and remains audible.
func UsesMusicOnlyAudio(options Options) bool {
	return options.Music != nil && options.Music.SourceAudio == "mute"
}

func (s MusicSelection) Matches(p *PreparedMusic) bool {
	return p != nil && p.Key != "" && (s.UploadReference != "" && p.Track.ID == "upload" || s.UploadReference == "" && p.Track.ID == s.TrackID)
}

type MusicPreparer interface {
	PrepareStoryMusic(context.Context, MusicSelection) (*PreparedMusic, error)
}

type MusicSync struct {
	Status       string `json:"status"`
	AdjustedCuts int    `json:"adjusted_cuts"`
	AlignedCuts  int    `json:"aligned_cuts,omitempty"`
	Strategy     string `json:"strategy,omitempty"`
	Explanation  string `json:"explanation,omitempty"`
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
	AlignedCuts  int     `json:"aligned_cuts,omitempty"`
	BPM          float64 `json:"bpm"`
	Strategy     string  `json:"strategy,omitempty"`
	Explanation  string  `json:"explanation,omitempty"`
	StartSeconds float64 `json:"start_seconds,omitempty"`
	EndSeconds   float64 `json:"end_seconds,omitempty"`
}

var musicIDPattern = regexp.MustCompile(`^incompetech:[A-Za-z0-9-]{1,80}$`)

func validateMusicSelection(selection *MusicSelection) error {
	if selection == nil {
		return nil
	}
	if selection.SourceAudio != "" && selection.SourceAudio != "preserve" && selection.SourceAudio != "mute" {
		return fmt.Errorf("choose whether to preserve source audio or use music only")
	}
	if selection.UploadReference != "" {
		if selection.TrackID != "" || !strings.HasPrefix(selection.UploadReference, "uploads/") || len(selection.UploadReference) > 512 || strings.ContainsAny(selection.UploadReference, "\\\x00?#") || strings.Contains(selection.UploadReference, "..") || strings.Count(selection.UploadReference, "/") != 2 {
			return fmt.Errorf("choose an uploaded music file from this account")
		}
	} else if !musicIDPattern.MatchString(selection.TrackID) {
		return fmt.Errorf("choose a track from the music catalogue")
	}
	if len(selection.Title) > 255 || !finite(selection.StartSeconds) || !finite(selection.EndSeconds) || selection.StartSeconds < 0 || selection.StartSeconds >= 1800 || selection.EndSeconds < 0 || selection.EndSeconds > 1800 || selection.EndSeconds > 0 && (selection.EndSeconds-selection.StartSeconds < 1 || selection.EndSeconds-selection.StartSeconds > 600) {
		return fmt.Errorf("choose a music excerpt between 1 second and 10 minutes")
	}
	if !finite(selection.Volume) || selection.Volume < 0 || selection.Volume > 1 {
		return fmt.Errorf("music volume must be between 0 and 1")
	}
	return nil
}
