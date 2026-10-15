package processing

import (
	"fmt"
	"math"
	"strings"

	"sneepcut/backend-go/internal/story"
)

const (
	storySpeechPolicyVersion       = "speech-confidence-4-reviewed-proposals-whole-phrases"
	storyMinimumLexicalProbability = .55
	storyMaximumVisualShotSeconds  = 4.0
	storyNoSpeechWarning           = "No confident speech transcript. This source remains available as a supporting visual; audio needs human review."
	storySpeechTimingWarning       = "Speech timestamps are estimates; the rendered audio is reviewed before the story is marked Ready."
	storySpeechLanguageWarning     = "Detected language is outside the Romanian/English evaluation set; review language and transcription."
	storyNarrationVisualWarning    = "Narration mode: original video audio is muted; visual windows require source-backed matching to the narration."
	storyNarrationSpeechWarning    = "Narration words are automatic transcription estimates; original voice stays continuous and final audio/captions require independent review."
	storySpeechWithheldPrefix      = "Automatic captions withheld for source interval "
)

// This policy operates on immutable ASR analysis after loading its cache. A
// threshold/policy change must not decode or transcribe the same source again.
// Only the returned catalog version changes, so semantic caches refresh once.
func applyStorySpeechPolicy(asset story.Asset, options story.Options) (story.Asset, error) {
	missingVAD := false
	for _, warning := range asset.Warnings {
		missingVAD = missingVAD || warning == storyMissingVADWarning
	}
	resetStoryAnalysisWarnings(&asset)
	if missingVAD {
		asset.Warnings = appendStoryWarning(asset.Warnings, storyMissingVADWarning)
	}
	input := append([]story.Candidate(nil), asset.Candidates...)
	asset.Candidates = nil
	asset.TranscriptProposals = nil
	for i := range input {
		candidate := &input[i]
		// Spoken candidates receive Confidence only from actual lexical token
		// probabilities. Zero is also the older "unavailable" default; the
		// raw-ASR evidence note distinguishes a measured zero from no evidence.
		measured := candidate.Confidence > 0 || strings.HasPrefix(candidate.Reason, "Complete aligned phrase; lowest lexical-token ASR probability ")
		if len(candidate.Words) == 0 || !measured || !finite(candidate.Confidence) || candidate.Confidence >= storyMinimumLexicalProbability {
			asset.Candidates = append(asset.Candidates, splitStoryVisualCandidate(*candidate)...)
			continue
		}
		if asset.Kind == "narration" {
			return asset, fmt.Errorf("narration words at %.2f–%.2f seconds need manual transcript review or a clearer recording (lowest lexical probability %.3f); the original voice has not been changed", candidate.In, candidate.Out, candidate.Confidence)
		}
		asset.TranscriptProposals = append(asset.TranscriptProposals, story.TranscriptProposal{
			CandidateID: candidate.ID, In: candidate.In, Out: candidate.Out,
			Words: append([]story.Word(nil), candidate.Words...), Confidence: candidate.Confidence,
			Reason: "Automatic text needs owner review because a word has low recognition confidence. Listen, correct the suggested text, and approve it before rendering captions.",
		})
		// Withhold the complete phrase, including any weak negation/number.
		// Never make the remaining words imply a different statement. Preserve
		// the source interval, quality evidence and original audible soundtrack.
		candidate.Text, candidate.Words, candidate.Role = "", nil, "b_roll"
		candidate.Idea, candidate.Dependencies, candidate.TakeGroup = "", nil, ""
		candidate.Reason = fmt.Sprintf("Automatic phrase transcription withheld: lowest measured lexical-token probability %.3f is below %.2f. Original source audio is unchanged; use this interval only as an unverified supporting visual pending manual transcript review.", candidate.Confidence, storyMinimumLexicalProbability)
		// A low lexical score does not make a spoken phrase a safe montage cut.
		// Preserve its complete detected interval even while captions are withheld.
		asset.Candidates = append(asset.Candidates, *candidate)
		asset.Warnings = appendStoryWarning(asset.Warnings, fmt.Sprintf("%s%.2f–%.2f seconds: lowest lexical probability %.3f is below %.2f. The complete phrase needs manual transcript review; original audio is unchanged.", storySpeechWithheldPrefix, candidate.In, candidate.Out, candidate.Confidence, storyMinimumLexicalProbability))
	}
	if asset.Kind == "narration" {
		asset.Warnings = appendStoryWarning(asset.Warnings, storyNarrationSpeechWarning)
	} else if options.Narration {
		asset.Warnings = appendStoryWarning(asset.Warnings, storyNarrationVisualWarning)
	} else {
		hasSpeech, otherLanguage, visual := false, false, 0.0
		for _, candidate := range asset.Candidates {
			visual = max(visual, candidate.VisualScore)
			if len(candidate.Words) > 0 {
				hasSpeech = true
				otherLanguage = otherLanguage || (candidate.Language != "ro" && candidate.Language != "en")
			}
		}
		if hasSpeech {
			asset.Warnings = appendStoryWarning(asset.Warnings, storySpeechTimingWarning)
			if otherLanguage {
				asset.Warnings = appendStoryWarning(asset.Warnings, storySpeechLanguageWarning)
			}
		} else {
			asset.Warnings = appendStoryWarning(asset.Warnings, storyNoSpeechWarning)
		}
		// Per-gap audio quality was not measured in older ASR caches. Zero is
		// explicitly unknown; the source audio itself stays available unchanged.
		asset.Candidates = storyCandidatesWithVisualGaps(asset, asset.Candidates, 0, visual)
	}
	asset.AnalysisVersion = storyDigest([]any{asset.AnalysisVersion, storySpeechPolicyVersion})
	return asset, nil
}

// Long unverified visual intervals make a fallback look like an unedited source
// clip. Split them deterministically so planning can build a varied montage
// without inventing cuts inside trusted spoken phrases.
func splitStoryVisualCandidate(candidate story.Candidate) []story.Candidate {
	if candidate.Text != "" || len(candidate.Words) != 0 || candidate.Out-candidate.In <= storyMaximumVisualShotSeconds {
		return []story.Candidate{candidate}
	}
	duration := candidate.Out - candidate.In
	count := int(math.Ceil(duration / storyMaximumVisualShotSeconds))
	result := make([]story.Candidate, 0, count)
	for i := 0; i < count; i++ {
		part := candidate
		part.ID = fmt.Sprintf("%s-cut%d", candidate.ID, i+1)
		part.In = candidate.In + duration*float64(i)/float64(count)
		part.Out = candidate.In + duration*float64(i+1)/float64(count)
		if i == count-1 {
			part.Out = candidate.Out
		}
		part.Reason = fmt.Sprintf("%s Visual montage window %d of %d; no speech or captions are asserted.", candidate.Reason, i+1, count)
		result = append(result, part)
	}
	return result
}

// Analysis-specific status is recomputed rather than accumulated across model
// changes, language overrides or policy refreshes. Unrelated source warnings
// survive, with duplicates removed.
func resetStoryAnalysisWarnings(asset *story.Asset) {
	warnings := make([]string, 0, len(asset.Warnings))
	for _, warning := range asset.Warnings {
		if storyAnalysisWarning(warning) {
			continue
		}
		warnings = appendStoryWarning(warnings, warning)
	}
	asset.Warnings = warnings
}

func storyAnalysisWarning(warning string) bool {
	switch warning {
	case storyMissingVADWarning, storyNoSpeechWarning, storySpeechTimingWarning, storySpeechLanguageWarning, storyNarrationVisualWarning, storyNarrationSpeechWarning:
		return true
	}
	return strings.HasPrefix(warning, storySpeechWithheldPrefix) || strings.HasPrefix(warning, storyVoiceAlignmentWarning)
}
