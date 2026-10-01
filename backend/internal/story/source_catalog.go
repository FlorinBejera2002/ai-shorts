package story

import (
	"slices"
	"sort"
	"strings"
)

const pinnedSourceWarning = "Newer source analysis changed candidate words, identities, or timing. This source keeps the catalog used by the accepted story; updated analysis is available only in a new draft or project."

// An accepted story binds its source catalog, not just ordinal candidate IDs.
// Include references needed by later edits and speaker checks, even when those
// candidates are not currently present in the rendered timeline.
func acceptedSourceReferences(req Request) map[string]bool {
	sources := make(map[string]bool)
	if req.Base == nil || !req.Base.Accepted {
		return sources
	}
	for _, entry := range req.Base.Timeline {
		sources[entry.Video.SourceID] = true
		if entry.Audio != nil {
			sources[entry.Audio.SourceID] = true
		}
	}
	all := indexCandidates(req.Assets)
	seen := make(map[string]bool)
	var include func(string)
	include = func(id string) {
		if id == "" || seen[id] {
			return
		}
		seen[id] = true
		candidate, found := all[id]
		if !found {
			return
		}
		sources[candidate.SourceID] = true
		for _, dependency := range candidate.Dependencies {
			include(dependency)
		}
	}
	for _, block := range req.Base.Plan.Blocks {
		include(block.CandidateID)
		include(block.IdentityReferenceID)
		include(block.BRollID)
		for _, alternative := range block.Alternatives {
			include(alternative)
		}
	}
	return sources
}

func sourceCatalogChanged(before, after Asset) bool {
	if before.Duration != after.Duration || before.HasAudio != after.HasAudio || before.Mapping != after.Mapping || len(before.Candidates) != len(after.Candidates) {
		return true
	}
	updated := make(map[string]Candidate, len(after.Candidates))
	for _, candidate := range after.Candidates {
		if _, duplicate := updated[candidate.ID]; duplicate {
			return true
		}
		updated[candidate.ID] = candidate
	}
	for _, previous := range before.Candidates {
		next, found := updated[previous.ID]
		if !found || previous.SourceID != next.SourceID || previous.In != next.In || previous.Out != next.Out || previous.Text != next.Text || previous.Speaker != next.Speaker || previous.Language != next.Language || !slices.Equal(previous.Words, next.Words) {
			return true
		}
	}
	return false
}

// safeVisualCatalogUpgrade permits a new flow draft to withdraw captions that
// a stricter evidence policy no longer trusts. It cannot add or change speech:
// every new candidate must be visual-only, and every former spoken interval
// must remain completely covered by explicitly withheld visual windows.
func safeVisualCatalogUpgrade(before, after Asset) bool {
	if before.ID != after.ID || before.Hash != after.Hash || before.Duration != after.Duration || before.HasAudio != after.HasAudio || before.Mapping != after.Mapping {
		return false
	}
	for _, candidate := range after.Candidates {
		if strings.TrimSpace(candidate.Text) != "" || len(candidate.Words) != 0 {
			return false
		}
	}
	for _, previous := range before.Candidates {
		if strings.TrimSpace(previous.Text) == "" && len(previous.Words) == 0 {
			continue
		}
		var windows []Candidate
		for _, candidate := range after.Candidates {
			if candidate.SourceID == previous.SourceID && candidate.In >= previous.In-.001 && candidate.Out <= previous.Out+.001 && strings.Contains(candidate.Reason, "Automatic phrase transcription withheld") {
				windows = append(windows, candidate)
			}
		}
		sort.SliceStable(windows, func(i, j int) bool { return windows[i].In < windows[j].In })
		clock := previous.In
		for _, window := range windows {
			if window.In > clock+.001 || window.In < clock-.001 || window.Out <= window.In {
				return false
			}
			clock = window.Out
		}
		if len(windows) == 0 || clock < previous.Out-.001 {
			return false
		}
	}
	return true
}
