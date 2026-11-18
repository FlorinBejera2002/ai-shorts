package story

import (
	"fmt"
	"slices"
	"strings"
)

const ownerTranscriptTiming = "owner"

// Owner timing is separate evidence from ASR timing. Keep the original proposal
// snapshot so a cache refresh can restore the review only to that exact source.
func ApproveTranscriptTiming(asset Asset, proposalID string, words []Word, confirmed bool) (Asset, error) {
	asset = cloneAssets([]Asset{asset})[0]
	if !confirmed {
		return asset, fmt.Errorf("confirm that both text and word timing were checked against the recording")
	}
	for i, proposal := range asset.TranscriptProposals {
		if proposal.ID != proposalID {
			continue
		}
		evidence := proposal
		if proposal.TimingSource == ownerTranscriptTiming {
			found := false
			for _, previous := range asset.TranscriptReviews {
				if ownerTimingReviewMatches(asset, proposal, previous) {
					evidence, found = *previous.TimingEvidence, true
					break
				}
			}
			if !found {
				return asset, fmt.Errorf("the original timing evidence changed; reload the story before reviewing")
			}
		} else if TranscriptProposalID(asset, proposal) != proposal.ID {
			return asset, fmt.Errorf("the transcript evidence changed; reload the story before reviewing")
		}
		words = slices.Clone(words)
		for j := range words {
			words[j].Text = strings.TrimSpace(words[j].Text)
		}
		if !validOwnerTimingWords(asset, evidence, words) {
			return asset, fmt.Errorf("enter 1 to 500 words with valid text and ordered, non-overlapping start/end times inside this passage")
		}
		evidence.Words = slices.Clone(evidence.Words)
		proposal.Words, proposal.TimingVerified, proposal.TimingSource = words, true, ownerTranscriptTiming
		proposal.ID = TranscriptProposalID(asset, proposal)
		asset.TranscriptProposals[i] = proposal
		review := TranscriptReview{ProposalID: proposal.ID, SourceHash: asset.Hash, Words: slices.Clone(words), TimingSource: ownerTranscriptTiming, TimingEvidence: &evidence}
		asset.TranscriptReviews = slices.DeleteFunc(asset.TranscriptReviews, func(old TranscriptReview) bool {
			return old.ProposalID == proposalID || old.ProposalID == evidence.ID ||
				(old.TimingEvidence != nil && old.TimingEvidence.ID == evidence.ID)
		})
		asset.TranscriptReviews = append(asset.TranscriptReviews, review)
		return ApplyTranscriptReviews(asset), nil
	}
	return asset, fmt.Errorf("transcript proposal changed; reload the story before reviewing")
}

func validOwnerTimingWords(asset Asset, evidence TranscriptProposal, words []Word) bool {
	if !finite(asset.Duration) || asset.Duration <= 0 || !finite(evidence.In) || !finite(evidence.Out) ||
		evidence.In < 0 || evidence.Out > asset.Duration || evidence.Out <= evidence.In || len(words) < 1 || len(words) > 500 {
		return false
	}
	last := evidence.In
	for _, word := range words {
		if !validReviewedText(word.Text) || !finite(word.Start) || !finite(word.End) ||
			word.Start < last || word.End <= word.Start || word.End > evidence.Out {
			return false
		}
		last = word.End
	}
	return true
}

func ownerTimingReviewMatches(asset Asset, proposal TranscriptProposal, review TranscriptReview) bool {
	evidence := review.TimingEvidence
	if review.TimingSource != ownerTranscriptTiming || review.SourceHash != asset.Hash || evidence == nil ||
		evidence.TimingSource != "" || evidence.ID != TranscriptProposalID(asset, *evidence) ||
		proposal.CandidateID != evidence.CandidateID || proposal.In != evidence.In || proposal.Out != evidence.Out ||
		!validOwnerTimingWords(asset, *evidence, review.Words) {
		return false
	}
	corrected := *evidence
	corrected.Words, corrected.TimingVerified = review.Words, true
	if review.ProposalID != TranscriptProposalID(asset, corrected) {
		return false
	}
	// Either fresh original ASR evidence or the previously corrected checkpoint.
	if proposal.TimingSource == "" {
		return proposal.ID == evidence.ID && TranscriptProposalID(asset, proposal) == evidence.ID
	}
	return proposal.TimingSource == ownerTranscriptTiming && proposal.TimingVerified &&
		proposal.ID == review.ProposalID && TranscriptProposalID(asset, proposal) == review.ProposalID
}
