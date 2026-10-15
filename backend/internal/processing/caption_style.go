package processing

import (
	"math"
	"strings"

	"sneepcut/backend-go/internal/captions"
)

// RemapCaptionPhrases is a static fallback from measured transcript segments.
// A cut through a phrase cannot safely caption its complete text, so it is withheld.
// Word animation remains disabled: no word-level alignment is synthesized.
func RemapCaptionPhrases(phrases []TranscriptSegment, segments []Segment, transition string, overlap float64) []captions.Cue {
	var cues []captions.Cue
	for _, phrase := range phrases {
		if strings.TrimSpace(phrase.Text) == "" || phrase.End <= phrase.Start || math.IsNaN(phrase.Start) || math.IsNaN(phrase.End) || math.IsInf(phrase.Start, 0) || math.IsInf(phrase.End, 0) {
			continue
		}
		for _, mapped := range RemapWords([]Word{{Text: phrase.Text, Start: phrase.Start, End: phrase.End}}, segments, transition, overlap) {
			if math.Abs((mapped.End-mapped.Start)-(phrase.End-phrase.Start)) > .002 {
				continue
			}
			cues = append(cues, captions.Cue{Text: phrase.Text, Start: mapped.Start, End: mapped.End})
		}
	}
	return cues
}

// Silence in a selected cut is not an alignment error merely because another
// part of the source has a transcript. Only selected text needs timing recovery.
func captionTimingUnavailable(transcript Transcript, segments []Segment) bool {
	if len(transcript.Segments) == 0 && len(transcript.Words) == 0 {
		return strings.TrimSpace(transcript.Text) != ""
	}
	for _, clip := range segments {
		for _, phrase := range transcript.Segments {
			if strings.TrimSpace(phrase.Text) != "" && phrase.Start < clip.End && phrase.End > clip.Start {
				return true
			}
		}
		for _, word := range transcript.Words {
			if strings.TrimSpace(word.Text) != "" && word.Start >= clip.Start && word.Start < clip.End && word.End <= word.Start {
				return true
			}
		}
	}
	return false
}
