package story

import "slices"

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
