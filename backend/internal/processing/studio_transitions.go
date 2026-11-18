package processing

import "math"

const studioTransitionSeconds = .3
const studioNativeTransitionVersion = 1

// TransitionIn describes a visual blend centered on the existing cut. Studio
// owns the blend; source selection, audio, captions and montage clocks stay put.
func studioApplyNativeTransitions(plan *studioPlan, treatments []string) {
	studioApplyNativeTransitionsWithDurations(plan, treatments, nil)
}

// Explicit durations belong to the saved Story timeline. Legacy callers keep
// their established .3 second treatment; new musical cuts remain hard cuts.
func studioApplyNativeTransitionsWithDurations(plan *studioPlan, treatments []string, durations []float64) {
	previous := -1
	shot := 0
	for i := range plan.Scenes {
		right := &plan.Scenes[i]
		if right.Role == "bridge" {
			continue
		}
		treatment := "natural"
		if shot < len(treatments) {
			treatment = treatments[shot]
		}
		shot++
		leftIndex := previous
		previous = i
		if leftIndex < 0 || (treatment != "" && treatment != "natural" && treatment != "crossfade") {
			continue
		}
		left := plan.Scenes[leftIndex]
		duration := studioNativeTransitionDuration(left, *right)
		if duration == 0 {
			continue
		}
		if shot-1 < len(durations) && durations[shot-1] != 0 {
			requested := durations[shot-1]
			if !finite(requested) || requested < 0 || requested > .6 {
				continue
			}
			duration = studioRound(min(requested, left.Duration/2, right.Duration/2))
			if duration < 2.0/30 {
				continue
			}
		}
		start, end := right.Start-duration/2, right.Start+duration/2
		bridged := false
		for _, scene := range plan.Scenes {
			if scene.Role == "bridge" && scene.Start < end && scene.Start+scene.Duration > start {
				bridged = true
				break
			}
		}
		if !bridged {
			right.TransitionIn = duration
		}
	}
}

func studioNativeTransitionDuration(left, right studioScene) float64 {
	if math.Abs(left.Start+left.Duration-right.Start) > .002 || left.FadeOut != 0 || right.FadeIn != 0 {
		return 0
	}
	if left.AssetID == right.AssetID && math.Abs(left.SourceIn+left.Duration-right.SourceIn) <= .002 {
		return 0
	}
	// Each side uses at most a quarter of its shot, leaving room for the
	// neighboring join. Sub-two-frame blends would look like a hard cut anyway.
	duration := min(studioTransitionSeconds, left.Duration/2, right.Duration/2)
	if duration < 2.0/30 {
		return 0
	}
	return studioRound(duration)
}
