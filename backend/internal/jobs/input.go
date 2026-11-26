package jobs

import (
	"errors"
	"regexp"
	"sneepcut/backend-go/internal/audiocleanup"
	"sneepcut/backend-go/internal/youtubedownload"
	"unicode/utf8"
)

type Options struct {
	AudioCleanup  *audiocleanup.Settings `json:"audio_cleanup,omitempty"`
	NumClips      int                    `json:"num_clips_requested"`
	AspectRatio   string                 `json:"aspect_ratio"`
	Language      *string                `json:"language"`
	SubtitleStyle string                 `json:"subtitle_style"`
	IncludeBrand  bool                   `json:"include_brand"`
	// BrandKitID picks one of the account's kits; empty means the default kit.
	BrandKitID       *string `json:"brand_kit_id,omitempty"`
	BurnSubtitles    bool    `json:"burn_subtitles"`
	SmartCrop        bool    `json:"smart_crop"`
	UserInstructions *string `json:"user_instructions"`
}

// CreateInput accepts an owned upload or one public YouTube video.
type CreateInput struct {
	Options
	SourceType       string  `json:"source_type"`
	SourceURL        *string `json:"source_url"`
	SourceFilePath   *string `json:"source_file_path"`
	SourceStorageKey *string `json:"source_storage_key"`
}

// Generic URL imports remain disabled; YouTube uses its restricted downloader.
var ErrLinkImportsRemoved = errors.New("Use a YouTube video link or upload the original video file")

// MaxClipCount is the largest clip count a job accepts.
const MaxClipCount = 30

// AutoClipCount is the clip count used when num_clips_requested is 0 (Auto).
const AutoClipCount = 5

// ResolvedClipCount returns the clip count a job creates, resolving Auto (0).
func (o Options) ResolvedClipCount() int {
	if o.NumClips == 0 {
		return AutoClipCount
	}
	return o.NumClips
}

func DefaultOptions() Options {
	return Options{NumClips: 5, AspectRatio: "9:16", SubtitleStyle: "default", BurnSubtitles: true, SmartCrop: true}
}

var kitIDPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

func (o Options) Validate() error {
	if o.BrandKitID != nil && !kitIDPattern.MatchString(*o.BrandKitID) {
		return errors.New("invalid brand_kit_id")
	}
	if o.NumClips < 0 || o.NumClips > MaxClipCount {
		return errors.New("num_clips_requested must be 0 (auto) or between 1 and 30")
	}
	if o.AspectRatio != "9:16" && o.AspectRatio != "1:1" && o.AspectRatio != "16:9" {
		return errors.New("invalid aspect_ratio")
	}
	if !bounded(o.Language, 50) || utf8.RuneCountInString(o.SubtitleStyle) > 50 || !bounded(o.UserInstructions, 4000) {
		return errors.New("job options exceed their maximum length")
	}
	return nil
}

func (p CreateInput) Validate() error {
	if err := p.Options.Validate(); err != nil {
		return err
	}
	if p.SourceType == "youtube" {
		if !empty(p.SourceFilePath) || !empty(p.SourceStorageKey) {
			return errors.New("YouTube jobs cannot include an uploaded source")
		}
		_, err := youtubedownload.CanonicalURL(value(p.SourceURL))
		return err
	}
	if !empty(p.SourceURL) || p.SourceType == "url" {
		return ErrLinkImportsRemoved
	}
	if !bounded(p.SourceFilePath, 2048) || !bounded(p.SourceStorageKey, 2048) {
		return errors.New("source exceeds 2048 characters")
	}
	switch p.SourceType {
	case "upload", "local":
		if empty(p.SourceFilePath) && empty(p.SourceStorageKey) {
			return errors.New("provide an uploaded file path or storage key")
		}
	default:
		return errors.New("invalid source_type")
	}
	return nil
}

func bounded(s *string, n int) bool { return s == nil || utf8.RuneCountInString(*s) <= n }
func empty(s *string) bool          { return s == nil || *s == "" }
func value(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
