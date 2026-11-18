package story

import "math"

// measuredMusicEvents checks the independent measurement envelope before any
// timestamp can affect an edit. Hosted confidence cannot satisfy provenance.
// Reject a malformed envelope rather than interpreting it as legacy evidence.
func measuredMusicEvents(music *PreparedMusic) []MusicEvent {
	if music == nil || music.Analysis == nil || music.Analysis.Timing == nil {
		return nil
	}
	timing := music.Analysis.Timing
	if timing.Version != MeasuredMusicTimingVersion || timing.Method != MeasuredMusicTimingMethod ||
		!finite(timing.Duration) || timing.Duration <= 0 || !finite(music.Track.DurationSeconds) ||
		math.Abs(timing.Duration-music.Track.DurationSeconds) > .05 || len(timing.Events) > 20000 {
		return nil
	}
	previous := -1.0
	for _, event := range timing.Events {
		if !finite(event.Time) || event.Time <= previous || event.Time < 0 || event.Time >= timing.Duration ||
			!finite(event.Confidence) || event.Confidence < .8 || event.Confidence > 1 ||
			!finite(event.Strength) || event.Strength <= 0 || event.Strength > 1 ||
			!finite(event.UncertaintySeconds) || event.UncertaintySeconds <= 0 || event.UncertaintySeconds > .025 ||
			(event.Kind != "onset" && event.Kind != "accent") {
			return nil
		}
		previous = event.Time
	}
	return timing.Events
}

// Cuts are placed on the renderer's 30 fps clock, not between video frames.
// Source bounds and complete moments are checked after this rounding.
func musicCutFrame(seconds float64) float64 {
	return math.Round(seconds*30) / 30
}
