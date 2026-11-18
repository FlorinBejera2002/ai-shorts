package processing

import (
	"context"
	"encoding/json"
	"math"
	"os"
	"path/filepath"

	"sneepcut/backend-go/internal/story"
)

// measuredMusicFile supplements hosted interpretation with inexpensive timing
// measurements on the exact lossless excerpt used by the renderer. It never
// calls a provider and has its own content/version cache, independent of models.
func (p *Processor) measuredMusicFile(ctx context.Context, dir, key, file string, duration float64) (*story.MusicTiming, error) {
	hash, err := musicFileDigest(ctx, file)
	if err != nil {
		return nil, err
	}
	identity := storyDigest([]any{waveformTimingVersion, hash, duration})
	cacheKey := key + "." + identity + ".timing.json"
	cacheFile := filepath.Join(dir, "waveform-timing.json")
	_ = os.Remove(cacheFile)
	invalidCache := false
	if p.materialize(ctx, cacheKey, cacheFile) == nil {
		invalidCache = true
		if raw, readErr := readBoundedMusicFile(cacheFile, 2<<20); readErr == nil {
			var cached story.MusicTiming
			if json.Unmarshal(raw, &cached) == nil && validMeasuredMusicTiming(&cached, duration) {
				return &cached, nil
			}
		}
	}
	pcmFile := filepath.Join(dir, "waveform-timing.pcm")
	defer os.Remove(pcmFile)
	if err := p.ffmpeg(ctx, dir, "-i", file, "-map", "0:a:0", "-vn", "-t", seconds(math.Min(duration, storyMusicAnalysisSeconds)), "-ar", "16000", "-ac", "1", "-f", "s16le", pcmFile); err != nil {
		return nil, err
	}
	pcm, err := readBoundedMusicFile(pcmFile, waveformSampleRate*2*(storyMusicAnalysisSeconds+1))
	if err != nil {
		return nil, err
	}
	timing, err := measureMusicTiming(ctx, pcm, duration)
	if err != nil {
		return nil, err
	}
	if encoded, err := json.Marshal(timing); err == nil && os.WriteFile(cacheFile, encoded, 0600) == nil {
		if invalidCache {
			_ = p.storage.Delete(ctx, cacheKey)
		}
		_ = p.storySave(ctx, cacheFile, cacheKey, "application/json")
	}
	return timing, nil
}

func validMeasuredMusicTiming(timing *story.MusicTiming, duration float64) bool {
	if timing.Version != waveformTimingVersion || timing.Method != story.MeasuredMusicTimingMethod || !finite(timing.Duration) || timing.Duration != duration {
		return false
	}
	previous := -1.0
	for _, event := range timing.Events {
		if !finite(event.Time) || event.Time < 0 || event.Time >= duration || event.Time <= previous || event.Kind != "onset" || !finite(event.Confidence) || event.Confidence < .8 || event.Confidence > 1 || !finite(event.Strength) || event.Strength <= 0 || event.Strength > 1 || !finite(event.UncertaintySeconds) || event.UncertaintySeconds <= 0 || event.UncertaintySeconds > .025 {
			return false
		}
		previous = event.Time
	}
	for _, region := range timing.Regions {
		if !finite(region.Start) || !finite(region.End) || !finite(region.BPM) || !finite(region.Confidence) || region.Start < 0 || region.End > duration || region.End <= region.Start || region.BPM <= 0 || region.Confidence < .8 || region.Confidence > 1 {
			return false
		}
	}
	return true
}
