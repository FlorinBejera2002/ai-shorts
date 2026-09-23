package story

import "fmt"

func semanticSourceCatalog(assets []Asset) ([]string, map[string]string, map[string]bool) {
	sources := make([]string, 0, len(assets))
	for _, asset := range assets {
		sources = appendUnique(sources, asset.ID)
	}
	mapping, ambiguous, seen := make(map[string]string), make(map[string]bool), make(map[string]bool)
	for _, asset := range assets {
		for _, candidate := range asset.Candidates {
			// A candidate belongs to the containing original asset. Never derive
			// an association by splitting IDs or trusting a mismatched SourceID.
			if seen[candidate.ID] || candidate.ID == "" || candidate.SourceID != asset.ID {
				ambiguous[candidate.ID] = true
				delete(mapping, candidate.ID)
			} else {
				mapping[candidate.ID] = asset.ID
			}
			seen[candidate.ID] = true
		}
	}
	return sources, mapping, ambiguous
}

// Recover only an exact, unique candidate/source namespace mix-up. Unknown IDs
// and ambiguous catalog entries still invalidate the review; no fuzzy matching,
// filename inference, prefix stripping, or model-authored mapping is trusted.
func normalizeSemanticSourceIDs(issues []Issue, assets []Asset) error {
	ids, mapping, ambiguous := semanticSourceCatalog(assets)
	sources := make(map[string]bool, len(ids))
	for _, id := range ids {
		sources[id] = true
	}
	for i := range issues {
		var normalized []string
		for _, id := range issues[i].SourceIDs {
			source := id
			if !sources[source] {
				if ambiguous[id] {
					return fmt.Errorf("issues[%d].source_ids contains ambiguous candidate %.160q", i, id)
				}
				var found bool
				source, found = mapping[id]
				if !found || !sources[source] {
					return fmt.Errorf("issues[%d].source_ids contains unknown source %.160q", i, id)
				}
			}
			normalized = appendUnique(normalized, source)
		}
		issues[i].SourceIDs = normalized
	}
	return nil
}
