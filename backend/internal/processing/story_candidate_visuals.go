package processing

import (
	"fmt"
	"math"
	"slices"
	"sort"

	"sneepcut/backend-go/internal/story"
)

const (
	storyVisualGapMinimum = 2.0
	storyVisualGapMaximum = storyMaximumVisualShotSeconds
)

// Speech is only one part of a source's visual catalog. Retain meaningful
// uncovered intervals as visual options, without inventing a transcript or
// asserting that untranscribed audio is silent. Existing speech padding and
// abstained/visual candidates all reserve their complete source intervals.
func storyCandidatesWithVisualGaps(asset story.Asset, existing []story.Candidate, audio, visual float64) []story.Candidate {
	// The duration bound matches the domain's maximum configurable source
	// length and keeps malformed input from creating an unbounded allocation.
	if asset.Kind == "narration" || asset.ID == "" || !finite(asset.Duration) || asset.Duration <= 0 || asset.Duration > 86400 {
		return existing
	}
	occupied := slices.Clone(existing)
	usedIDs := make(map[string]bool, len(existing))
	for _, candidate := range occupied {
		if candidate.SourceID != asset.ID || !finite(candidate.In) || !finite(candidate.Out) || candidate.In < 0 || candidate.Out <= candidate.In || candidate.Out > asset.Duration+.001 {
			// Do not cover up a malformed source catalog with apparently usable
			// visual options; the normal validator must reject it unchanged.
			return existing
		}
		usedIDs[candidate.ID] = true
	}
	sort.SliceStable(occupied, func(i, j int) bool { return occupied[i].In < occupied[j].In })
	result := slices.Clone(existing)
	sequence := 0
	addGap := func(start, end float64) {
		duration := end - start
		if duration < storyVisualGapMinimum {
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
	clock := 0.0
	for _, candidate := range occupied {
		addGap(clock, candidate.In)
		clock = max(clock, min(asset.Duration, candidate.Out))
	}
	addGap(clock, asset.Duration)
	return result
}
