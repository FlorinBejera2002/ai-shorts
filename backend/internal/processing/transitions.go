package processing

import (
	"math"
	"strings"
)

// BoundaryDecision records the evidence behind an edit, in source seconds.
// Natural editing never overlaps spoken audio. Captions use the adjusted bounds.
type BoundaryDecision struct {
	Index            int     `json:"index"`
	Strategy         string  `json:"strategy"`
	Score            float64 `json:"score"`
	Outgoing         float64 `json:"outgoing"`
	Incoming         float64 `json:"incoming"`
	SpeechSafe       bool    `json:"speech_safe"`
	VisualSimilarity float64 `json:"visual_similarity"`
	Motion           float64 `json:"motion"`
	CameraMotion     float64 `json:"camera_motion"`
	Reason           string  `json:"reason"`
}

// safeBoundary only adds a small amount of source context. It never discards
// a selected word to obtain a visually convenient cut.
func safeBoundary(at, limit float64, outgoing bool, words []Word) float64 {
	result := at
	for _, word := range words {
		if word.Start < at && word.End > at {
			if outgoing && word.End <= limit && word.End-at <= .5 {
				result = math.Max(result, word.End)
			} else if !outgoing && word.Start >= limit && at-word.Start <= .5 {
				result = math.Min(result, word.Start)
			}
		}
	}
	return result
}

func speechSafe(at float64, words []Word) bool {
	for _, word := range words {
		if word.Start+.001 < at && at < word.End-.001 {
			return false
		}
	}
	return true
}

func sentenceEnd(at float64, words []Word) bool {
	for _, word := range words {
		text := strings.TrimSpace(word.Text)
		if math.Abs(word.End-at) < .15 && (strings.HasSuffix(text, ".") || strings.HasSuffix(text, "!") || strings.HasSuffix(text, "?")) {
			return true
		}
	}
	return false
}

// PlanNaturalCuts protects speech before considering visual evidence. The
// caller can refine safe boundaries with sampled motion and framing signals.
func PlanNaturalCuts(segments []Segment, transcript Transcript, duration float64) ([]Segment, []BoundaryDecision) {
	result := append([]Segment(nil), segments...)
	decisions := make([]BoundaryDecision, 0, max(0, len(result)-1))
	for i := 0; i+1 < len(result); i++ {
		left, right := &result[i], &result[i+1]
		endLimit, startLimit := duration, 0.0
		if right.Start >= left.End {
			// A gap inside a single word should be closed, not pronounced as
			// two clipped syllables. Keep that word entirely on the left.
			for _, word := range transcript.Words {
				if word.Start < left.End && word.End > right.Start && word.End < right.End && word.End-left.End <= .5 {
					left.End, right.Start = word.End, word.End
					break
				}
			}
			endLimit = right.Start
		}
		left.End = safeBoundary(left.End, endLimit, true, transcript.Words)
		if right.Start >= left.End {
			startLimit = left.End
		}
		right.Start = safeBoundary(right.Start, startLimit, false, transcript.Words)
		safe := speechSafe(left.End, transcript.Words) && speechSafe(right.Start, transcript.Words)
		score := .65
		if safe {
			score = .85
		}
		if sentenceEnd(left.End, transcript.Words) {
			score += .1
		}
		decisions = append(decisions, BoundaryDecision{Index: i, Strategy: "cut", Score: score, Outgoing: left.End, Incoming: right.Start, SpeechSafe: safe, Reason: "Natural cut; preserve selected speech"})
	}
	return result, decisions
}
