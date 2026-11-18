package processing

import (
	"math"
	"sort"
	"strings"

	"sneepcut/backend-go/internal/story"
)

const storyVisualMomentPrompt = `
MUSIC TIMING: You may additionally return an optional "moment":{"in":1.0,"out":2.0,"peak":1.5,"confidence":0.95,"evidence":"specific observed preparation, action, completion and surrounding idle frames"} for a candidate. All times are ORIGINAL SOURCE seconds, copied exactly from supplied image labels. This is a protected useful interval, not permission to discard meaningful context. Include the complete preparation and completion of any visible action. Return a moment only when closely spaced supplied frames (no gap greater than 0.5 seconds) cover the ENTIRE candidate, support a whole action and establish that the surrounding handles contain no other important action. A genuinely static scenic video with no action to complete may protect an established useful view lasting at least one second; describe the unchanged scene and both surrounding handles in evidence. Do not treat walking, panning, reactions, revealing a landscape, subjects entering/leaving, or unfolding gestures as static holds. If the action is already underway, unfinished, ambiguous, depends on omitted context, or may contain unsampled rapid motion, omit moment. Never use ASR to infer motion. "peak" is optional: only name an observed visual highlight at an actual supplied frame, never an interpolated impact or a guessed exact landing time. A static image needs no action moment. The application expands the protected interval to account for sampling uncertainty and preserves the entire candidate when timing is unsupported. Other finding fields and source intervals remain unchanged.`

// The existing per-source image budget is retained. Short candidates gain a
// denser sequence; long collections remain sparse and abstain from action trims.
func storyVisualMomentSampleFrames(asset story.Asset) []int {
	if !finite(asset.Duration) || asset.Duration <= 0 {
		return nil
	}
	last := storyLastObservedFrame(asset)
	total := 0.0
	for _, c := range asset.Candidates {
		if finite(c.In) && finite(c.Out) && c.In >= 0 && c.Out > c.In && c.Out <= asset.Duration+.001 {
			total += c.Out - c.In
		}
	}
	var frames []int
	for _, c := range asset.Candidates {
		if !finite(c.In) || !finite(c.Out) || c.In < 0 || c.Out <= c.In || c.Out > asset.Duration+.001 {
			continue
		}
		start := int(math.Ceil(c.In * 30))
		end := min(last, int(math.Ceil(c.Out*30))-1)
		if end >= start {
			count := min(24, max(3, int(math.Floor(24*(c.Out-c.In)/total))))
			for i := 0; i < count; i++ {
				frames = append(frames, start+i*(end-start)/(count-1))
			}
		}
	}
	sort.Ints(frames)
	unique := frames[:0]
	for _, frame := range frames {
		if len(unique) == 0 || unique[len(unique)-1] != frame {
			unique = append(unique, frame)
		}
	}
	if len(unique) <= 24 {
		return unique
	}
	selected := make([]int, 24)
	for i := range selected {
		selected[i] = unique[i*(len(unique)-1)/(len(selected)-1)]
	}
	return selected
}

// Plan a bounded sample grid from known timing metadata. Container duration may
// still include a longer audio tail; extraction checks the actual video frame
// count before producing timestamp-labelled observations.
func storyLastObservedFrame(asset story.Asset) int {
	duration := asset.Duration
	if finite(asset.Mapping.Duration) && asset.Mapping.Duration > 0 {
		duration = min(duration, asset.Mapping.Duration)
	}
	return max(0, int(math.Ceil(duration*30-.0001))-1)
}

func cloneStoryVisualMoment(moment *story.VisualMoment) *story.VisualMoment {
	if moment == nil {
		return nil
	}
	copy := *moment
	if moment.Peak != nil {
		peak := *moment.Peak
		copy.Peak = &peak
	}
	return &copy
}

// Only observed frames can anchor an action. Expand by a neighboring sample on
// both sides rather than treating a model's frame label as a precise boundary.
// A wide sampling gap cannot establish safe handles, even at high model confidence.
func validatedStoryVisualMoment(candidate story.Candidate, proposed *story.VisualMoment, samples []float64, confidence float64) *story.VisualMoment {
	if proposed == nil || !finite(confidence) || confidence < .85 || confidence > 1 ||
		!finite(proposed.In) || !finite(proposed.Out) || proposed.In < candidate.In || proposed.Out > candidate.Out || proposed.Out <= proposed.In ||
		!finite(proposed.Confidence) || proposed.Confidence < .85 || proposed.Confidence > 1 ||
		len(strings.TrimSpace(proposed.Evidence)) < 24 || len(proposed.Evidence) > 1200 || len(samples) < 3 {
		return nil
	}
	for i, at := range samples {
		if !finite(at) || at < candidate.In || at >= candidate.Out || i > 0 && at <= samples[i-1] {
			return nil
		}
		if i > 0 && at-samples[i-1] > .500001 {
			return nil
		}
	}
	// Dense observations only around the proposed action say nothing about
	// unseen handles. Require the first/last source frame as well as the entire
	// intervening sequence before granting permission to trim either side. Allow
	// two output frames at the end: source packet duration and CFR conversion can
	// each contribute one frame after the final timestamped image (e.g. 24→30fps).
	if samples[0]-candidate.In > 1.0/30+.00051 || candidate.Out-samples[len(samples)-1] > 2.0/30+.00051 {
		return nil
	}
	observedIndex := func(at float64) int {
		for i, sample := range samples {
			// Image labels have three decimal places; no sub-frame interpolation.
			if math.Abs(sample-at) <= .00051 {
				return i
			}
		}
		return -1
	}
	first, last := observedIndex(proposed.In), observedIndex(proposed.Out)
	if first < 0 || last < first+2 {
		return nil
	}
	left, right := max(0, first-1), min(len(samples)-1, last+1)
	moment := cloneStoryVisualMoment(proposed)
	moment.In, moment.Out = samples[left], samples[right]
	if first == 0 {
		moment.In = candidate.In
	}
	if last == len(samples)-1 {
		moment.Out = candidate.Out
	}
	moment.Confidence = min(confidence, proposed.Confidence)
	if proposed.Peak != nil {
		peak := observedIndex(*proposed.Peak)
		if !finite(*proposed.Peak) || peak < first || peak > last {
			return nil
		}
		*moment.Peak = samples[peak]
	}
	return moment
}
