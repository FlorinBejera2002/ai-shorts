package processing

import (
	"math"
	"slices"
	"strings"
	"unicode/utf8"

	"sneepcut/backend-go/internal/story"
)

// The standalone Whisper VAD adds this padding before reporting its
// centisecond clock. Store the contract beside measured intervals: an old or
// externally supplied interval list alone does not establish padding.
type storyVoicePadding struct {
	Method      string `json:"method"`
	SpeechPadMS int    `json:"speech_pad_ms"`
	ClockTickMS int    `json:"clock_tick_ms"`
}

const storyProposalPaddingReason = "A punctuation tail ending in measured VAD padding was shortened to the preceding voice boundary; the original recording and suggested text are unchanged."

func configuredStoryVoicePadding(arguments []string) *storyVoicePadding {
	count := 0
	for i, argument := range arguments {
		if argument != "--vad-speech-pad-ms" {
			continue
		}
		if i+1 >= len(arguments) || arguments[i+1] != "150" {
			return nil
		}
		count++
	}
	if count != 1 {
		return nil
	}
	return &storyVoicePadding{Method: "whisper.cpp-speech-padding-v1", SpeechPadMS: 150, ClockTickMS: 10}
}

func (padding *storyVoicePadding) valid() bool {
	return padding != nil && padding.Method == "whisper.cpp-speech-padding-v1" && padding.SpeechPadMS == 150 && padding.ClockTickMS == 10
}

// normalizeStoryProposalPadding handles only a punctuation tail whose apparent
// second speech overlap is entirely detector padding. The following word must
// independently anchor the second region. This prepares an unreviewed proposal;
// the ordinary strict voice gate still decides whether the whole phrase is safe.
func normalizeStoryProposalPadding(words []story.Word, intervals []Segment, duration float64, padding *storyVoicePadding) ([]story.Word, bool) {
	if !padding.valid() || !validStoryVoiceIntervals(intervals, duration) {
		return words, false
	}
	regions := storyCaptionVoiceRegions(intervals)
	cores := make([]Segment, len(regions))
	pad, tick := float64(padding.SpeechPadMS)/1000, float64(padding.ClockTickMS)/1000
	for i, region := range regions {
		cores[i] = Segment{Start: math.Round((region.Start+pad)*1000) / 1000, End: math.Round((region.End-pad)*1000) / 1000}
		if cores[i].End <= cores[i].Start {
			return words, false
		}
	}
	var normalized []story.Word
	for i := 0; i+1 < len(words); i++ {
		word, next := words[i], words[i+1]
		tail, _ := utf8.DecodeLastRuneInString(strings.TrimSpace(word.Text))
		if !strings.ContainsRune(",.;:!?…", tail) || !validStoryPaddingWord(word) || !validStoryPaddingWord(next) {
			continue
		}
		windows := storyWordVoiceOverlaps(word, regions)
		if len(windows) != 2 || windows[1] != windows[0]+1 {
			continue
		}
		first, second := windows[0], windows[1]
		wordCores := storyWordVoiceOverlaps(word, cores)
		nextCores := storyWordVoiceOverlaps(next, cores)
		nextWindows := storyWordVoiceOverlaps(next, regions)
		if len(wordCores) != 1 || wordCores[0] != first || word.Start < cores[first].Start || word.Start >= cores[first].End ||
			word.End > cores[second].Start+tick || math.Abs(next.Start-word.End) > tick ||
			next.Start < cores[second].Start-tick || next.Start >= cores[second].End ||
			len(nextCores) != 1 || nextCores[0] != second || len(nextWindows) != 1 || nextWindows[0] != second {
			continue
		}
		if normalized == nil {
			normalized = slices.Clone(words)
		}
		normalized[i].End = regions[first].End
	}
	if normalized == nil {
		return words, false
	}
	return normalized, true
}

func validStoryPaddingWord(word story.Word) bool {
	return finite(word.Start) && finite(word.End) && word.Start >= 0 && word.End > word.Start
}

func storyWordVoiceOverlaps(word story.Word, intervals []Segment) []int {
	var matches []int
	for i, interval := range intervals {
		if min(word.End, interval.End) > max(word.Start, interval.Start) {
			matches = append(matches, i)
		}
	}
	return matches
}
