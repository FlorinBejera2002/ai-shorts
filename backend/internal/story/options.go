package story

import (
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

// NormalizeLimits supplies finite defaults. An entirely empty configuration uses
// product defaults; zero repair limits in a configured Limits disable repairs.
func NormalizeLimits(l Limits) Limits {
	d := DefaultLimits()
	if l == (Limits{}) {
		return d
	}
	if l.MaxFiles <= 0 {
		l.MaxFiles = d.MaxFiles
	}
	if l.MaxFileBytes <= 0 {
		l.MaxFileBytes = d.MaxFileBytes
	}
	if l.MaxTotalBytes <= 0 {
		l.MaxTotalBytes = d.MaxTotalBytes
	}
	if !finite(l.MaxSourceSeconds) || l.MaxSourceSeconds <= 0 {
		l.MaxSourceSeconds = d.MaxSourceSeconds
	}
	if !finite(l.MaxTotalSeconds) || l.MaxTotalSeconds <= 0 {
		l.MaxTotalSeconds = d.MaxTotalSeconds
	}
	if l.MaxRepairCycles < 0 {
		l.MaxRepairCycles = 0
	}
	if l.MaxAlternatives < 0 {
		l.MaxAlternatives = 0
	}
	if l.MaxAICalls <= 0 {
		l.MaxAICalls = d.MaxAICalls
	}
	if l.Timeout <= 0 {
		l.Timeout = d.Timeout
	}
	// These hard ceilings defend worker resources even after a bad configuration.
	l.MaxFiles = min(l.MaxFiles, 100)
	l.MaxFileBytes = min(l.MaxFileBytes, 100<<30)
	l.MaxTotalBytes = min(l.MaxTotalBytes, 100<<30)
	l.MaxSourceSeconds = min(l.MaxSourceSeconds, 86400)
	l.MaxTotalSeconds = min(l.MaxTotalSeconds, 86400)
	l.MaxRepairCycles = min(l.MaxRepairCycles, 10)
	l.MaxAlternatives = min(l.MaxAlternatives, 10)
	l.MaxAICalls = min(l.MaxAICalls, 100)
	l.Timeout = min(l.Timeout, 6*time.Hour)
	return l
}

func NormalizeOptions(o Options) (Options, error) {
	d := DefaultOptions()
	if o.TargetSeconds == 0 {
		o.TargetSeconds = d.TargetSeconds
	}
	if o.AspectRatio == "" {
		o.AspectRatio = d.AspectRatio
	}
	if o.Language == "" {
		o.Language = d.Language
	}
	if o.Mode == "" {
		o.Mode = d.Mode
	}
	o.Brief = strings.TrimSpace(o.Brief)
	return o, ValidateOptions(o)
}

func ValidateOptions(o Options) error {
	if utf8.RuneCountInString(o.Brief) > 4000 {
		return fmt.Errorf("brief must contain at most 4000 characters")
	}
	if !o.Narration && (o.TargetSeconds < 15 || o.TargetSeconds > 90) {
		return fmt.Errorf("target duration must be between 15 and 90 seconds")
	}
	switch o.AspectRatio {
	case "9:16", "1:1", "16:9", "4:5":
	default:
		return fmt.Errorf("unsupported aspect ratio")
	}
	switch o.Language {
	case "auto", "ro", "en":
	default:
		return fmt.Errorf("language must be auto, ro or en")
	}
	switch o.Mode {
	case "strict", "smart":
	default:
		return fmt.Errorf("mode must be strict or smart")
	}
	return ValidateBrandOptions(o)
}

// ValidateAssets accepts only assets already validated by ingestion. It never
// follows a URL or trusts source paths proposed by a language model.
func ValidateAssets(assets []Asset, limits Limits) error {
	l := NormalizeLimits(limits)
	videoCount, voiceCount := 0, 0
	for _, asset := range assets {
		if asset.Kind == "narration" {
			voiceCount++
		} else {
			videoCount++
		}
	}
	if len(assets) == 0 || videoCount > l.MaxFiles || voiceCount > 1 {
		return fmt.Errorf("choose at most %d video files and one narration recording", l.MaxFiles)
	}
	seen := make(map[string]bool, len(assets))
	var bytes int64
	var duration float64
	for _, a := range assets {
		if a.ID == "" || a.Key == "" || seen[a.ID] {
			return fmt.Errorf("source IDs and keys must be present and unique")
		}
		seen[a.ID] = true
		fileLimit := l.MaxFileBytes
		if a.Kind == "narration" {
			fileLimit = MaxNarrationBytes
		}
		if a.Size <= 0 || a.Size > fileLimit || bytes > l.MaxTotalBytes-a.Size {
			return fmt.Errorf("source files exceed the upload size limit")
		}
		if !finite(a.Duration) || a.Duration <= 0 || a.Duration > l.MaxSourceSeconds {
			return fmt.Errorf("source %s has an unsupported duration", a.ID)
		}
		if a.Kind != "" && a.Kind != "video" && a.Kind != "narration" {
			return fmt.Errorf("source %s has an unsupported media kind", a.ID)
		}
		if a.Kind == "narration" && (!a.HasAudio || a.Size > MaxNarrationBytes || a.Duration > MaxNarrationSeconds) {
			return fmt.Errorf("narration must contain audio and be at most %d seconds and %d MiB", MaxNarrationSeconds, MaxNarrationBytes>>20)
		}
		if a.Kind != "narration" && (a.Width <= 0 || a.Height <= 0) {
			return fmt.Errorf("source %s has no valid video stream", a.ID)
		}
		if a.Include != "" && a.Include != "auto" && a.Include != "required" && a.Include != "excluded" {
			return fmt.Errorf("invalid inclusion setting")
		}
		if a.Role != "" && !validRole(a.Role) && a.Role != "auto" {
			return fmt.Errorf("invalid source role")
		}
		bytes += a.Size
		duration += a.Duration
	}
	if duration > l.MaxTotalSeconds {
		return fmt.Errorf("combined source duration exceeds the project limit")
	}
	return nil
}

func finite(v float64) bool { return !math.IsNaN(v) && !math.IsInf(v, 0) }

func validRole(role string) bool {
	switch role {
	case "a_roll", "b_roll", "alternate", "alternate_take", "reaction", "transition", "supporting", "supporting_visual", "low_quality":
		return true
	}
	return false
}

func LimitsFromEnv(get func(string) string) (Limits, error) {
	l := DefaultLimits()
	integers := []struct {
		name      string
		target    *int
		low, high int
	}{
		{"STORY_MAX_FILES", &l.MaxFiles, 1, 100}, {"STORY_MAX_REPAIR_CYCLES", &l.MaxRepairCycles, 0, 10}, {"STORY_MAX_ALTERNATIVES", &l.MaxAlternatives, 0, 10}, {"STORY_MAX_AI_CALLS", &l.MaxAICalls, 1, 100},
	}
	for _, field := range integers {
		if raw := get(field.name); raw != "" {
			value, err := strconv.Atoi(raw)
			if err != nil || value < field.low || value > field.high {
				return Limits{}, fmt.Errorf("%s must be between %d and %d", field.name, field.low, field.high)
			}
			*field.target = value
		}
	}
	for _, field := range []struct {
		name   string
		target *int64
	}{{"STORY_MAX_FILE_BYTES", &l.MaxFileBytes}, {"STORY_MAX_TOTAL_BYTES", &l.MaxTotalBytes}} {
		if raw := get(field.name); raw != "" {
			value, err := strconv.ParseInt(raw, 10, 64)
			if err != nil || value < 1 || value > 100<<30 {
				return Limits{}, fmt.Errorf("%s must be between 1 byte and 100 GiB", field.name)
			}
			*field.target = value
		}
	}
	for _, field := range []struct {
		name   string
		target *float64
	}{{"STORY_MAX_SOURCE_SECONDS", &l.MaxSourceSeconds}, {"STORY_MAX_TOTAL_SECONDS", &l.MaxTotalSeconds}} {
		if raw := get(field.name); raw != "" {
			value, err := strconv.ParseFloat(raw, 64)
			if err != nil || !finite(value) || value <= 0 || value > 86400 {
				return Limits{}, fmt.Errorf("%s must be positive and at most 86400", field.name)
			}
			*field.target = value
		}
	}
	if raw := get("STORY_TIMEOUT_SECONDS"); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil || value < 1 || value > 21600 {
			return Limits{}, fmt.Errorf("STORY_TIMEOUT_SECONDS must be between 1 and 21600")
		}
		l.Timeout = time.Duration(value) * time.Second
	}
	if l.MaxFileBytes > l.MaxTotalBytes || l.MaxSourceSeconds > l.MaxTotalSeconds {
		return Limits{}, fmt.Errorf("per-source limits cannot exceed project limits")
	}
	return l, nil
}
