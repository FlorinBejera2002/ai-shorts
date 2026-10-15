package story

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"slices"
	"strings"
	"unicode"
	"unicode/utf8"
)

// A proposal is never executable speech until its timing is measured and its
// text is explicitly confirmed by the owner. IDs bind the immutable evidence.
type TranscriptProposal struct {
	ID             string  `json:"id"`
	CandidateID    string  `json:"candidate_id"`
	In             float64 `json:"in"`
	Out            float64 `json:"out"`
	Words          []Word  `json:"words"`
	Confidence     float64 `json:"confidence"`
	Reason         string  `json:"reason"`
	TimingVerified bool    `json:"timing_verified"`
	Reviewed       bool    `json:"reviewed"`
}

type TranscriptReview struct {
	ProposalID string `json:"proposal_id"`
	SourceHash string `json:"source_hash"`
	Words      []Word `json:"words"`
}

func TranscriptProposalID(asset Asset, proposal TranscriptProposal) string {
	raw, _ := json.Marshal([]any{asset.ID, asset.Hash, proposal.CandidateID, proposal.In, proposal.Out, proposal.Words, proposal.TimingVerified})
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:])
}

func validProposalWords(asset Asset, proposal TranscriptProposal) bool {
	if !proposal.TimingVerified || !finite(proposal.In) || !finite(proposal.Out) || proposal.In < 0 || proposal.Out > asset.Duration+.001 || proposal.Out <= proposal.In || len(proposal.Words) == 0 || len(proposal.Words) > 500 {
		return false
	}
	last := proposal.In
	for _, word := range proposal.Words {
		if !finite(word.Start) || !finite(word.End) || word.Start < last-.001 || word.End <= word.Start || word.End > proposal.Out+.001 {
			return false
		}
		last = word.End
	}
	return true
}

func validReviewedText(text string) bool {
	if !utf8.ValidString(text) || strings.TrimSpace(text) == "" || utf8.RuneCountInString(text) > 256 {
		return false
	}
	for _, char := range text {
		if unicode.IsControl(char) {
			return false
		}
	}
	return true
}

// ApproveTranscript accepts text only; a caller cannot invent source clocks,
// add word slots, switch source identity, or promote an unmeasured proposal.
func ApproveTranscript(asset Asset, proposalID string, text []string) (Asset, error) {
	asset = cloneAssets([]Asset{asset})[0]
	for _, proposal := range asset.TranscriptProposals {
		if proposal.ID != proposalID {
			continue
		}
		if !validProposalWords(asset, proposal) || len(text) != len(proposal.Words) {
			return asset, fmt.Errorf("this transcript needs verified timing and one text value for each suggested word")
		}
		review := TranscriptReview{ProposalID: proposal.ID, SourceHash: asset.Hash, Words: slices.Clone(proposal.Words)}
		for i, value := range text {
			value = strings.TrimSpace(value)
			if !validReviewedText(value) {
				return asset, fmt.Errorf("each reviewed word must contain valid text of at most 256 characters")
			}
			review.Words[i].Text = value
		}
		asset.TranscriptReviews = slices.DeleteFunc(asset.TranscriptReviews, func(old TranscriptReview) bool { return old.ProposalID == proposal.ID })
		asset.TranscriptReviews = append(asset.TranscriptReviews, review)
		return ApplyTranscriptReviews(asset), nil
	}
	return asset, fmt.Errorf("transcript proposal changed; reload the story before reviewing")
}

// Reapply only an exact evidence match after loading an immutable ASR cache.
func ApplyTranscriptReviews(asset Asset) Asset {
	asset = cloneAssets([]Asset{asset})[0]
	for i := range asset.TranscriptProposals {
		proposal := &asset.TranscriptProposals[i]
		proposal.Reviewed = false
		if !validProposalWords(asset, *proposal) {
			continue
		}
		for _, review := range asset.TranscriptReviews {
			if review.ProposalID != proposal.ID || review.SourceHash != asset.Hash || len(review.Words) != len(proposal.Words) {
				continue
			}
			valid := true
			for j, word := range review.Words {
				valid = valid && validReviewedText(word.Text) && word.Start == proposal.Words[j].Start && word.End == proposal.Words[j].End
			}
			if !valid {
				continue
			}
			proposal.Words, proposal.Reviewed = slices.Clone(review.Words), true
			proposal.Reason = "Text explicitly reviewed by the owner; measured source timing is unchanged."
			warningPrefix := fmt.Sprintf("Automatic captions withheld for source interval %.2f–%.2f seconds:", proposal.In, proposal.Out)
			asset.Warnings = slices.DeleteFunc(asset.Warnings, func(warning string) bool {
				return strings.HasPrefix(warning, warningPrefix) || strings.HasPrefix(warning, "No confident speech transcript.")
			})
			for j := range asset.Candidates {
				candidate := &asset.Candidates[j]
				if candidate.ID != proposal.CandidateID && !strings.HasPrefix(candidate.ID, proposal.CandidateID+"-cut") {
					continue
				}
				candidate.Words = wordsWithin(review.Words, candidate.In, candidate.Out)
				if len(candidate.Words) == 0 {
					continue
				}
				var text []string
				for _, word := range candidate.Words {
					text = append(text, word.Text)
				}
				candidate.Text, candidate.Role = strings.Join(text, " "), "a_roll"
				candidate.Reason = "Transcript explicitly reviewed by the owner; source timing is measured and unchanged."
			}
		}
	}
	return asset
}

func wordsWithin(words []Word, start, end float64) []Word {
	var result []Word
	for _, word := range words {
		// Do not display a complete word over a cut that contains only part of it.
		if word.Start >= start-.001 && word.End <= end+.001 {
			result = append(result, word)
		}
	}
	return result
}

func reviewedTimeline(base []Entry, assets []Asset) ([]Entry, error) {
	result := slices.Clone(base)
	for i := range result {
		entry := &result[i]
		entry.Words = slices.Clone(entry.Words)
		if entry.Audio == nil {
			continue
		}
		for _, asset := range assets {
			if asset.ID != entry.Audio.SourceID {
				continue
			}
			for _, proposal := range asset.TranscriptProposals {
				if !proposal.Reviewed || !validProposalWords(asset, proposal) || proposal.Out <= entry.Audio.In || proposal.In >= entry.Audio.Out {
					continue
				}
				start, end := entry.OutputIn+proposal.In-entry.Audio.In, entry.OutputIn+proposal.Out-entry.Audio.In
				entry.Words = slices.DeleteFunc(entry.Words, func(word Word) bool { return word.End > start && word.Start < end })
				for _, word := range wordsWithin(proposal.Words, entry.Audio.In, entry.Audio.Out) {
					word.Start += entry.OutputIn - entry.Audio.In
					word.End += entry.OutputIn - entry.Audio.In
					if word.Start < entry.OutputIn-.001 || word.End > entry.OutputOut+.001 {
						return nil, fmt.Errorf("reviewed transcript does not fit the selected audio interval")
					}
					entry.Words = append(entry.Words, word)
				}
			}
		}
		slices.SortFunc(entry.Words, func(a, b Word) int {
			if a.Start < b.Start {
				return -1
			}
			if a.Start > b.Start {
				return 1
			}
			return 0
		})
	}
	return result, nil
}

// RebuildTranscriptCaptions preserves the chosen video/audio intervals and their
// source identities. Only owner-confirmed words can replace caption slots.
func RebuildTranscriptCaptions(base Version, assets []Asset) (Version, error) {
	assets = cloneAssets(assets)
	for i := range assets {
		assets[i] = ApplyTranscriptReviews(assets[i])
	}
	raw, err := json.Marshal(base)
	if err != nil {
		return Version{}, err
	}
	var version Version
	if err = json.Unmarshal(raw, &version); err != nil {
		return Version{}, err
	}
	version.Timeline, err = reviewedTimeline(base.Timeline, assets)
	if err != nil {
		return Version{}, err
	}
	version.Parent, version.Number, version.Accepted = base.Number, base.Number+1, false
	version.Output, version.Report = Output{}, Report{}
	return version, nil
}
