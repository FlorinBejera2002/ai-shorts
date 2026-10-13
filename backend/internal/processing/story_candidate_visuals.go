package processing

import (
	"fmt"
	"math"
	"slices"
	"sort"

	"sneepcut/backend-go/internal/story"
)

const (
	storyVisualGapMinimum = .5
	storyVisualGapMaximum = storyMaximumVisualShotSeconds
)

// Speech is only one part of a source's visual catalog. Retain meaningful
// uncovered intervals as visual options, without inventing a transcript or
// asserting that untranscribed audio is silent. Existing speech padding and
// abstained/visual candidates reserve their complete source intervals. Short
// gaps attach to an adjacent phrase rather than becoming flashing shots; the
// catalog must not make original pauses/tails impossible for a plan to retain.
func storyCandidatesWithVisualGaps(asset story.Asset, existing []story.Candidate, audio, visual float64) []story.Candidate {
	// The duration bound matches the domain's maximum configurable source
	// length and keeps malformed input from creating an unbounded allocation.
	if asset.Kind == "narration" || asset.ID == "" || !finite(asset.Duration) || asset.Duration <= 0 || asset.Duration > 86400 {
		return existing
	}
	occupied := slices.Clone(existing)
	usedIDs := make(map[string]bool, len(existing))
	positions := make(map[string]int, len(existing))
	for i, candidate := range occupied {
		if candidate.SourceID != asset.ID || !finite(candidate.In) || !finite(candidate.Out) || candidate.In < 0 || candidate.Out <= candidate.In || candidate.Out > asset.Duration+.001 {
			// Do not cover up a malformed source catalog with apparently usable
			// visual options; the normal validator must reject it unchanged.
			return existing
		}
		usedIDs[candidate.ID] = true
		positions[candidate.ID] = i
	}
	sort.SliceStable(occupied, func(i, j int) bool { return occupied[i].In < occupied[j].In })
	result := slices.Clone(existing)
	sequence := 0
	addGap := func(start, end float64) {
		duration := end - start
		if duration <= .000001 {
			return
		}
		// Equal windows cover the entire useful gap without a tiny leftover
		// shot. Their clocks are derived exclusively from original bounds.
		count := int(math.Ceil(duration / storyVisualGapMaximum))
		for i := 0; i < count; i++ {
			var id string
			for id == "" || usedIDs[id] {
				sequence++
				id = fmt.Sprintf("%s-g%d", asset.ID, sequence)
			}
			usedIDs[id] = true
			in := start + duration*float64(i)/float64(count)
			out := start + duration*float64(i+1)/float64(count)
			if i == count-1 {
				out = end
			}
			result = append(result, story.Candidate{
				ID: id, SourceID: asset.ID, In: in, Out: out, Words: []story.Word{}, Role: "b_roll",
				AudioScore: audio, VisualScore: visual,
				Reason: "Original visual interval outside retained phrase/candidate bounds; no aligned speech or captions are asserted here. Original audio and visual relevance remain unverified until actual media review.",
			})
		}
	}
	retainGap := func(start, end float64, before, after int) {
		if end <= start {
			return
		}
		if end-start < storyVisualGapMinimum {
			if before >= 0 {
				result[before].Out = end
				return
			}
			if after >= 0 {
				result[after].In = start
				return
			}
		}
		addGap(start, end)
	}
	clock := 0.0
	previous := -1
	for _, candidate := range occupied {
		position := positions[candidate.ID]
		retainGap(clock, candidate.In, previous, position)
		if candidate.Out > clock {
			clock = min(asset.Duration, candidate.Out)
			previous = position
		}
	}
	retainGap(clock, asset.Duration, previous, -1)
	return result
}
