package processing

import (
	"encoding/json"
	"errors"
	"strings"
	"unicode"

	"sneepcut/backend-go/internal/story"
)

const storyTranscriptAlignmentVersion = "original-clock-dtw-1"
const storyTranscriptAlignmentReason = "Fresh transcript aligned to original audio with DTW and measured voice regions. The text may differ from the earlier suggestion; listen and confirm every word before using these captions."

type storyDTWToken struct {
	Text        string   `json:"text"`
	Time        *float64 `json:"t_dtw"`
	Probability *float64 `json:"p"`
}

type storyDTWDocument struct {
	Transcription []struct {
		Text   string          `json:"text"`
		Tokens []storyDTWToken `json:"tokens"`
	} `json:"transcription"`
}

// The pinned Whisper CLI exports DTW token-row transition times in
// centiseconds. Word boundaries use those transitions, following Whisper's
// timing.py find_alignment algorithm, rather than the unrelated ASR offsets.
// Punctuation is retained in text but cannot anchor a word in a voice region.
// https://github.com/openai/whisper/blob/v20250625/whisper/timing.py#L209
// https://github.com/ggml-org/whisper.cpp/blob/v1.8.3/src/whisper.cpp#L8156
func alignedStoryTranscript(raw []byte, intervals []Segment, duration float64) ([]story.Word, float64, error) {
	invalid := errors.New("independent transcript alignment is incomplete")
	if len(raw) > 8<<20 || !validStoryVoiceIntervals(intervals, duration) {
		return nil, 0, invalid
	}
	var doc storyDTWDocument
	if json.Unmarshal(raw, &doc) != nil {
		return nil, 0, invalid
	}
	type wordAnchor struct {
		text        string
		first, last float64
		region      int
		boundary    float64
	}
	regions := storyCaptionVoiceRegions(intervals)
	var anchors []wordAnchor
	lastClock, confidence := -1.0, 1.0
	for _, segment := range doc.Transcription {
		text := strings.TrimSpace(segment.Text)
		if !spokenTranscriptText(text) {
			continue
		}
		if len(strings.Fields(text)) != 1 {
			return nil, 0, invalid
		}
		anchor := wordAnchor{text: text, first: -1, region: -1, boundary: -1}
		var tokenText strings.Builder
		for _, token := range segment.Tokens {
			if strings.HasPrefix(token.Text, "[_") {
				continue
			}
			tokenText.WriteString(token.Text)
			lexical := strings.ContainsFunc(token.Text, func(r rune) bool { return unicode.IsLetter(r) || unicode.IsNumber(r) })
			if token.Time == nil || !finite(*token.Time) || *token.Time < 0 || *token.Time/100 > duration {
				return nil, 0, invalid
			}
			clock := *token.Time / 100
			if clock < lastClock {
				return nil, 0, invalid
			}
			lastClock = clock
			if !lexical {
				if anchor.first >= 0 && anchor.boundary < 0 {
					anchor.boundary = clock
				}
				continue
			}
			region := -1
			for j, bounds := range regions {
				if clock >= bounds.Start && clock < bounds.End {
					region = j
					break
				}
			}
			if region < 0 || (anchor.region >= 0 && anchor.region != region) || token.Probability == nil || !finite(*token.Probability) || *token.Probability < 0 || *token.Probability > 1 {
				return nil, 0, invalid
			}
			if anchor.first < 0 {
				anchor.first = clock
				anchor.region = region
			}
			anchor.last, anchor.boundary = clock, -1
			confidence = min(confidence, *token.Probability)
		}
		if anchor.first < 0 || strings.TrimSpace(tokenText.String()) != text {
			return nil, 0, invalid
		}
		anchors = append(anchors, anchor)
	}
	if len(anchors) == 0 || len(anchors) > 500 {
		return nil, 0, invalid
	}
	words := make([]story.Word, 0, len(anchors))
	for i, anchor := range anchors {
		end := anchor.boundary
		if end < 0 && i+1 < len(anchors) {
			end = anchors[i+1].first
		}
		if end < 0 {
			return nil, 0, invalid
		}
		// Every lexical subtoken independently belongs to this measured
		// region. Only its trailing display interval can lose unvoiced time.
		end = min(end, regions[anchor.region].End)
		if end <= anchor.first || end < anchor.last {
			return nil, 0, invalid
		}
		words = append(words, story.Word{Text: anchor.text, Start: anchor.first, End: end})
	}
	probe := story.Asset{Duration: duration, Candidates: []story.Candidate{{In: 0, Out: duration, Words: words}}}
	bounded, err := boundStorySpeechToVoice(probe, intervals, true)
	if err != nil || len(bounded.Candidates[0].Words) != len(words) {
		return nil, 0, invalid
	}
	return bounded.Candidates[0].Words, confidence, nil
}

func applyStoryTranscriptAlignment(asset story.Asset, words []story.Word, confidence float64, intervals []Segment) story.Asset {
	for i := range asset.TranscriptProposals {
		proposal := &asset.TranscriptProposals[i]
		if proposal.TimingVerified || proposal.Reviewed {
			continue
		}
		var selected []story.Word
		valid := true
		for _, word := range words {
			if word.End <= proposal.In || word.Start >= proposal.Out {
				continue
			}
			if word.Start < proposal.In || word.End > proposal.Out {
				valid = false
				break
			}
			selected = append(selected, word)
		}
		if !valid || len(selected) == 0 {
			continue
		}
		// A new transcript must represent every voice region in this passage;
		// a partial reanalysis must not silently erase a spoken phrase.
		for _, region := range storyCaptionVoiceRegions(intervals) {
			if min(region.End, proposal.Out) <= max(region.Start, proposal.In) {
				continue
			}
			covered := false
			for _, word := range selected {
				covered = covered || (word.Start >= region.Start && word.End <= region.End)
			}
			valid = valid && covered
		}
		probe := story.Asset{Duration: asset.Duration, Candidates: []story.Candidate{{In: proposal.In, Out: proposal.Out, Words: selected}}}
		bounded, err := boundStorySpeechToVoice(probe, intervals, true)
		if !valid || err != nil || len(bounded.Candidates[0].Words) != len(selected) {
			continue
		}
		proposal.Words, proposal.Confidence = bounded.Candidates[0].Words, confidence
		proposal.TimingVerified, proposal.Reviewed = true, false
		proposal.Reason = storyTranscriptAlignmentReason
		proposal.ID = story.TranscriptProposalID(asset, *proposal)
	}
	return asset
}
