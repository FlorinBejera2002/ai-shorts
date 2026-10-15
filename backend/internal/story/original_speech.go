package story

import (
	"crypto/sha256"
	"fmt"
	"math"
	"regexp"
	"sort"
	"strings"
)

func normalizedBrief(text string) string {
	return strings.NewReplacer("ă", "a", "â", "a", "î", "i", "ș", "s", "ş", "s", "ț", "t", "ţ", "t", "’", "'").Replace(strings.ToLower(text))
}

// These are explicit preservation instructions, not caption choices or a
// general classifier of intent. Other wording remains available to review.
var preserveSpeechDirective = regexp.MustCompile(`(?:^|[.!?;,\n]|\b(?:and|si|please|te rog)\s+)\s*(?:(?:preserve|keep|retain|include)\s+(?:(?:all|the entire|the complete)\s+(?:of\s+)?(?:the\s+)?(?:original\s+)?(?:speech|dialogue|voice|audio)|(?:the\s+)?original\s+(?:speech|dialogue|voice|audio)\s+(?:in full|in its entirety))|(?:pastreaza|pastrati|mentine|include)\s+(?:(?:tot|intreg)\s+(?:dialogul|continutul vorbit)|(?:toata|intreaga)\s+(?:vorbirea|vocea)(?:\s+originala)?|(?:vocea|vorbirea|dialogul|sunetul)\s+original[a-z]*\s+(?:integral[a-z]*|complet[a-z]*|in intregime)))\b`)

// PreserveOriginalSpeech deliberately does not infer this contract from
// "captions: all", required uploads, or the default source-faithful policy.
func PreserveOriginalSpeech(options Options) bool {
	return options.PreserveOriginalSpeech || preserveSpeechDirective.MatchString(normalizedBrief(options.Brief))
}

func speechCandidateID(source string, span Interval) string {
	sum := sha256.Sum256([]byte(fmt.Sprintf("%.9f:%.9f", span.In, span.Out)))
	return fmt.Sprintf("%s-original-speech-%x", source, sum[:8])
}

func originalSpeechRanges(asset Asset) ([]Interval, error) {
	if asset.Include == "excluded" || !asset.HasAudio {
		return nil, nil
	}
	var spans []Interval
	add := func(span Interval) error {
		if span.SourceID != asset.ID || !finite(asset.Duration) || asset.Duration <= 0 || !finite(span.In) || !finite(span.Out) || span.In < 0 || span.Out <= span.In || span.Out > asset.Duration+.001 {
			return fmt.Errorf("original speech evidence is outside source %s", asset.ID)
		}
		spans = append(spans, span)
		return nil
	}
	for _, span := range asset.VoiceIntervals {
		if err := add(span); err != nil {
			return nil, err
		}
	}
	for _, candidate := range asset.Candidates {
		if strings.HasPrefix(candidate.ID, asset.ID+"-original-speech-") || (strings.TrimSpace(candidate.Text) == "" && len(candidate.Words) == 0) {
			continue
		}
		if err := add(Interval{asset.ID, candidate.In, candidate.Out}); err != nil {
			return nil, err
		}
	}
	// Uncertain lexical/timing evidence cannot authorize captions, but it must
	// not remove the recorded audio inside its valid, source-backed envelope.
	for _, proposal := range asset.TranscriptProposals {
		if err := add(Interval{asset.ID, proposal.In, proposal.Out}); err != nil {
			return nil, err
		}
	}
	return mergeSpeechRanges(spans), nil
}

func mergeSpeechRanges(spans []Interval) []Interval {
	spans = append([]Interval(nil), spans...)
	sort.SliceStable(spans, func(i, j int) bool {
		if spans[i].In != spans[j].In {
			return spans[i].In < spans[j].In
		}
		return spans[i].Out < spans[j].Out
	})
	var merged []Interval
	for _, span := range spans {
		if len(merged) > 0 && span.In <= merged[len(merged)-1].Out+.001 {
			merged[len(merged)-1].Out = max(merged[len(merged)-1].Out, span.Out)
		} else {
			merged = append(merged, span)
		}
	}
	return merged
}

func speechRangeCandidate(asset Asset, span Interval) Candidate {
	var exact Candidate
	for _, candidate := range asset.Candidates {
		if math.Abs(candidate.In-span.In) >= .000001 || math.Abs(candidate.Out-span.Out) >= .000001 {
			continue
		}
		completeWords := true
		for _, original := range asset.Candidates {
			if strings.HasPrefix(original.ID, asset.ID+"-original-speech-") || original.In < span.In-.001 || original.Out > span.Out+.001 {
				continue
			}
			for _, word := range original.Words {
				found := false
				for _, retained := range candidate.Words {
					found = found || retained == word
				}
				completeWords = completeWords && found
			}
		}
		if completeWords && (exact.ID == "" || len(candidate.Words) > len(exact.Words)) {
			exact = candidate
		}
	}
	return exact
}

// PrepareOriginalSpeech adds source-backed unions when padded phrases overlap
// or voice has no caption candidate. Originals stay available for provenance,
// locks and review. Only already verified candidate words enter these unions.
func PrepareOriginalSpeech(assets []Asset, options Options) error {
	if !PreserveOriginalSpeech(options) || options.Narration {
		return nil
	}
	for i := range assets {
		asset := &assets[i]
		spans, err := originalSpeechRanges(*asset)
		if err != nil {
			return err
		}
		for _, span := range spans {
			if speechRangeCandidate(*asset, span).ID != "" {
				continue
			}
			candidate := Candidate{ID: speechCandidateID(asset.ID, span), SourceID: asset.ID, In: span.In, Out: span.Out, Role: "a_roll", Reason: "Complete original audio retained under the explicit preserve-all-speech instruction."}
			var words []Word
			for _, original := range asset.Candidates {
				if strings.HasPrefix(original.ID, asset.ID+"-original-speech-") || original.In < span.In-.001 || original.Out > span.Out+.001 {
					continue
				}
				words = append(words, original.Words...)
				if len(original.Words) > 0 {
					if len(words) == len(original.Words) {
						candidate.Confidence, candidate.Language, candidate.Speaker = original.Confidence, original.Language, original.Speaker
					} else {
						candidate.Confidence = min(candidate.Confidence, original.Confidence)
						if candidate.Language != original.Language {
							candidate.Language = ""
						}
						if candidate.Speaker != original.Speaker {
							candidate.Speaker = "unknown"
						}
					}
				}
				candidate.AudioScore = max(candidate.AudioScore, original.AudioScore)
				candidate.VisualScore = max(candidate.VisualScore, original.VisualScore)
				for _, dependency := range original.Dependencies {
					candidate.Dependencies = appendUnique(candidate.Dependencies, dependency)
				}
			}
			sort.SliceStable(words, func(i, j int) bool { return words[i].Start < words[j].Start })
			for _, word := range words {
				if len(candidate.Words) > 0 {
					previous := candidate.Words[len(candidate.Words)-1]
					if word == previous {
						continue
					}
					if word.Start < previous.End-.001 {
						return fmt.Errorf("overlapping verified words in original source %s require transcript review", asset.ID)
					}
				}
				candidate.Words = append(candidate.Words, word)
			}
			var text []string
			for _, word := range candidate.Words {
				text = append(text, word.Text)
			}
			candidate.Text = strings.Join(text, " ")
			replaced := false
			for j := range asset.Candidates {
				if asset.Candidates[j].ID == candidate.ID {
					asset.Candidates[j] = candidate
					replaced = true
					break
				}
			}
			if !replaced {
				asset.Candidates = append(asset.Candidates, candidate)
			}
		}
	}
	// Map complete prerequisites to their covering union. Requirements within
	// the same continuous source interval are already present in original order.
	all := indexCandidates(assets)
	canonical := make(map[string]string)
	requiredIDs := make(map[string]bool)
	for _, asset := range assets {
		spans, _ := originalSpeechRanges(asset)
		for _, span := range spans {
			id := speechRangeCandidate(asset, span).ID
			requiredIDs[id] = true
			for _, candidate := range asset.Candidates {
				if candidate.In >= span.In-.001 && candidate.Out <= span.Out+.001 {
					canonical[candidate.ID] = id
				}
			}
		}
	}
	for i := range assets {
		for j := range assets[i].Candidates {
			candidate := &assets[i].Candidates[j]
			if !requiredIDs[candidate.ID] {
				continue
			}
			var dependencies []string
			for _, id := range candidate.Dependencies {
				if _, exists := all[id]; !exists {
					return fmt.Errorf("unknown original speech context candidate %s", id)
				}
				if replacement := canonical[id]; replacement != "" {
					id = replacement
				}
				if id != candidate.ID {
					dependencies = appendUnique(dependencies, id)
				}
			}
			candidate.Dependencies = dependencies
		}
	}
	return nil
}

// CompleteOriginalSpeech restores every known omission together, before the
// independent review. Required voice is not truncated to the soft duration
// target, and uncertain words are never promoted into captions.
func CompleteOriginalSpeech(plan Plan, assets []Asset, options Options) (Plan, error) {
	if !PreserveOriginalSpeech(options) || options.Narration {
		return plan, nil
	}
	all := indexCandidates(assets)
	var required []Candidate
	orders := make(map[string]int)
	for _, asset := range assets {
		orders[asset.ID] = asset.Order
		spans, err := originalSpeechRanges(asset)
		if err != nil {
			return Plan{}, err
		}
		for _, span := range spans {
			candidate := speechRangeCandidate(asset, span)
			if candidate.ID == "" {
				return Plan{}, fmt.Errorf("original speech coverage was not prepared for source %s", asset.ID)
			}
			required = append(required, candidate)
		}
	}
	result := clonePlan(plan)
	result.Blocks = nil
	selected, usedIDs := make(map[string]bool), make(map[string]bool)
	for _, block := range plan.Blocks {
		usedIDs[block.ID] = true
		candidate, exists := all[block.CandidateID]
		if !exists {
			return Plan{}, fmt.Errorf("unknown source candidate %q", block.CandidateID)
		}
		var overlaps []Candidate
		for _, needed := range required {
			if needed.SourceID == candidate.SourceID && candidate.In < needed.Out-.001 && candidate.Out > needed.In+.001 {
				overlaps = append(overlaps, needed)
			}
		}
		if len(overlaps) == 0 {
			result.Blocks = append(result.Blocks, block)
			selected[block.CandidateID] = true
			continue
		}
		if len(overlaps) == 1 && overlaps[0].ID == candidate.ID && block.Pace == nil {
			if !selected[block.CandidateID] {
				result.Blocks = append(result.Blocks, block)
			}
			selected[block.CandidateID] = true
			continue
		}
		if block.Locked || block.LockText || block.LockOrder || block.LockCrop {
			return Plan{}, fmt.Errorf("preserving all original speech would change locked block %s; the saved edit was retained", block.ID)
		}
		if block.IdentityReferenceID != "" {
			return Plan{}, fmt.Errorf("preserving all original speech would replace the identity comparison for block %s; the saved edit was retained", block.ID)
		}
		for _, needed := range overlaps {
			if !selected[needed.ID] {
				updated := block
				updated.CandidateID, updated.Reason = needed.ID, "Complete original speech restored before review."
				updated.Pace, updated.Visual = nil, nil
				updated.Alternatives = eligibleAlternatives(needed, assets)
				if visual, exists := all[updated.BRollID]; updated.BRollID != "" && (!exists || len(overlaps) > 1 || visual.Out-visual.In+.001 < needed.Out-needed.In) {
					result.Gaps = appendUnique(result.Gaps, fmt.Sprintf("Supporting visual for block %q cannot cover its complete original speech; the original source shot was retained.", block.ID))
					updated.BRollID = ""
				}
				if len(overlaps) > 1 {
					updated.ID = newSpeechBlockID(needed.ID, usedIDs)
				}
				result.Blocks = append(result.Blocks, updated)
				selected[needed.ID] = true
			}
		}
	}
	for _, needed := range required {
		if !selected[needed.ID] {
			result.Blocks = append(result.Blocks, Block{ID: newSpeechBlockID(needed.ID, usedIDs), CandidateID: needed.ID, Role: "context", Crop: "fit", Reason: "Complete original speech restored before review."})
			selected[needed.ID] = true
		}
	}
	if options.PreserveOrder {
		sort.SliceStable(result.Blocks, func(i, j int) bool {
			a, b := all[result.Blocks[i].CandidateID], all[result.Blocks[j].CandidateID]
			if orders[a.SourceID] != orders[b.SourceID] {
				return orders[a.SourceID] < orders[b.SourceID]
			}
			return a.In < b.In
		})
	}
	for i, old := range plan.Blocks {
		if old.Locked || old.LockOrder {
			if i >= len(result.Blocks) || result.Blocks[i].ID != old.ID {
				return Plan{}, fmt.Errorf("preserving all original speech would move locked block %s; the saved edit was retained", old.ID)
			}
		}
	}
	if entries, err := BuildTimeline(result, assets); err == nil && options.TargetSeconds > 0 && timelineDuration(entries) > float64(options.TargetSeconds) {
		const explanation = "Complete original speech takes precedence over the approximate target duration."
		if !strings.Contains(result.Summary, explanation) {
			result.Summary = strings.TrimSpace(result.Summary + " " + explanation)
		}
	}
	return result, nil
}

func newSpeechBlockID(candidateID string, used map[string]bool) string {
	for suffix := 0; ; suffix++ {
		id := fmt.Sprintf("speech-%s-%d", candidateID, suffix)
		if !used[id] {
			used[id] = true
			return id
		}
	}
}

// OriginalSpeechCoverage checks the actual audio source windows. Displaying a
// source as B-roll cannot satisfy a requirement to retain its original voice.
func OriginalSpeechCoverage(assets []Asset, timeline []Entry) []Issue {
	var issues []Issue
	for _, asset := range assets {
		required, err := originalSpeechRanges(asset)
		if err != nil {
			issues = append(issues, Issue{ID: "speech-evidence-" + asset.ID, Type: "original_speech", Severity: "critical", SourceIDs: []string{asset.ID}, Evidence: err.Error(), Confidence: 1})
			continue
		}
		var audio []Interval
		for _, entry := range timeline {
			if entry.Audio != nil && entry.Audio.SourceID == asset.ID && finite(entry.Audio.In) && finite(entry.Audio.Out) && entry.Audio.Out > entry.Audio.In {
				audio = append(audio, *entry.Audio)
			}
		}
		audio = mergeSpeechRanges(audio)
		for _, span := range required {
			covered := false
			for _, actual := range audio {
				if actual.In <= span.In+.001 && actual.Out >= span.Out-.001 {
					covered = true
					break
				}
			}
			if !covered {
				issues = append(issues, Issue{ID: "missing-" + speechCandidateID(asset.ID, span), Type: "original_speech", Severity: "critical", SourceIDs: []string{asset.ID}, Evidence: fmt.Sprintf("The explicit preserve-all-speech instruction requires original audio from source %s at %.3f–%.3fs; the audio timeline does not cover it completely.", asset.ID, span.In, span.Out), Confidence: 1})
			}
		}
	}
	return issues
}
