package story

import (
	"encoding/hex"
	"reflect"
	"slices"
	"sort"
	"strings"
)

// Reuse is confined to this request and to ingestion-verified identical bytes.
// Upload records, original keys and source IDs remain independent. Missing or
// malformed hashes are never evidence that two recordings are identical.
type duplicateSourceKey struct {
	hash          string
	size          int64
	duration      float64
	width, height int
	hasAudio      bool
}

func duplicateKey(asset Asset) (duplicateSourceKey, bool) {
	// Human review belongs to this upload identity, never another identical file.
	if len(asset.TranscriptReviews) > 0 || len(asset.TranscriptProposals) > 0 {
		return duplicateSourceKey{}, false
	}
	if asset.Kind != "" && asset.Kind != "video" || len(asset.Hash) != 64 || asset.Size <= 0 {
		return duplicateSourceKey{}, false
	}
	if _, err := hex.DecodeString(asset.Hash); err != nil {
		return duplicateSourceKey{}, false
	}
	return duplicateSourceKey{strings.ToLower(asset.Hash), asset.Size, asset.Duration, asset.Width, asset.Height, asset.HasAudio}, true
}

// A stable representative avoids changing cache namespaces when upload order
// changes. Results are still checkpointed in the original source records.
func sourceAnalysisOrder(assets []Asset) []int {
	order := make([]int, len(assets))
	for i := range order {
		order[i] = i
	}
	sort.SliceStable(order, func(i, j int) bool { return assets[order[i]].ID < assets[order[j]].ID })
	return order
}

// Only source-scoped candidate IDs can be rebound without changing their
// meaning or inventing a migration for older/custom catalogs.
func duplicateCandidateIDs(from, to Asset) (map[string]string, bool) {
	ids := make(map[string]string, len(from.Candidates))
	for _, candidate := range from.Candidates {
		suffix, scoped := strings.CutPrefix(candidate.ID, from.ID+"-")
		if !scoped || suffix == "" || candidate.SourceID != from.ID {
			return nil, false
		}
		if _, exists := ids[candidate.ID]; exists {
			return nil, false
		}
		ids[candidate.ID] = to.ID + "-" + suffix
	}
	return ids, true
}

func reuseDuplicateAnalysis(analyzed, original Asset) (Asset, bool) {
	// A first analysis can discover review proposals after duplicateKey was
	// computed from raw uploads. Their IDs and review authority remain local.
	if len(analyzed.TranscriptProposals) > 0 || len(analyzed.TranscriptReviews) > 0 || len(original.TranscriptReviews) > 0 {
		return Asset{}, false
	}
	ids, ok := duplicateCandidateIDs(analyzed, original)
	if !ok || analyzed.AnalysisVersion == "" {
		return Asset{}, false
	}
	reused := cloneAssets([]Asset{analyzed})[0]
	reused.ID, reused.Name, reused.Key, reused.Hash, reused.Size = original.ID, original.Name, original.Key, original.Hash, original.Size
	reused.Order, reused.Role, reused.Include, reused.Kind = original.Order, original.Role, original.Include, original.Kind
	// This marker covers the entire semantic batch, including its source IDs.
	// The optional semantic adapter must validate it again after expansion.
	reused.SemanticAnalysisVersion = ""
	for i := range reused.VoiceIntervals {
		if reused.VoiceIntervals[i].SourceID != analyzed.ID {
			return Asset{}, false
		}
		reused.VoiceIntervals[i].SourceID = original.ID
	}
	for i := range reused.Candidates {
		candidate := &reused.Candidates[i]
		candidate.ID, candidate.SourceID = ids[candidate.ID], original.ID
		for j, dependency := range candidate.Dependencies {
			if mapped, local := ids[dependency]; local {
				candidate.Dependencies[j] = mapped
			}
			if candidate.Dependencies[j] == candidate.ID {
				return Asset{}, false
			}
		}
		if analyzed.Role != original.Role && analyzed.Role != "" && analyzed.Role != "auto" {
			// A representative's user override is not analysis of the other upload.
			candidate.Role = "b_roll"
			if candidate.Text != "" {
				candidate.Role = "a_roll"
			}
		}
	}
	if original.AnalysisVersion == reused.AnalysisVersion && !sourceCatalogChanged(original, reused) {
		// Mirror adapter cache behavior: retain each source's own previously
		// validated meaning and prerequisites, never another upload's edits.
		previous := indexCandidates([]Asset{original})
		for i := range reused.Candidates {
			candidate := &reused.Candidates[i]
			old := previous[candidate.ID]
			candidate.Role, candidate.Idea, candidate.Reason = old.Role, old.Idea, old.Reason
			candidate.Dependencies = slices.Clone(old.Dependencies)
		}
		reused.SemanticAnalysisVersion = original.SemanticAnalysisVersion
	}
	for _, warning := range original.Warnings {
		reused.Warnings = appendUnique(reused.Warnings, warning)
	}
	return reused, true
}

type semanticSourceBatch struct {
	original        []Asset
	assets          []Asset
	representatives []int
	canonicalIDs    map[string]string
}

// Identical uploads need one set of contact frames and candidate descriptions.
// Conflicting saved evidence/metadata stays separate; no semantic equivalence
// is inferred merely from matching text, filenames or nearby source intervals.
func duplicateSemanticBatch(assets []Asset) semanticSourceBatch {
	batch := semanticSourceBatch{original: assets, representatives: make([]int, len(assets)), canonicalIDs: make(map[string]string)}
	groups := make(map[duplicateSourceKey][]int)
	for _, i := range sourceAnalysisOrder(assets) {
		asset := assets[i]
		batch.representatives[i] = i
		key, eligible := duplicateKey(asset)
		if eligible {
			for _, representative := range groups[key] {
				if sameSemanticCatalog(assets[representative], asset) {
					batch.representatives[i] = representative
					break
				}
			}
			if batch.representatives[i] == i {
				groups[key] = append(groups[key], i)
			}
		}
		representative := assets[batch.representatives[i]]
		ids, _ := duplicateCandidateIDs(asset, representative)
		for _, candidate := range asset.Candidates {
			canonical := ids[candidate.ID]
			if canonical == "" || batch.representatives[i] == i {
				canonical = candidate.ID
			}
			batch.canonicalIDs[candidate.ID] = canonical
		}
	}
	for i, asset := range assets {
		if batch.representatives[i] == i {
			batch.assets = append(batch.assets, cloneAssets([]Asset{asset})[0])
		}
	}
	for i := range batch.assets {
		for j := range batch.assets[i].Candidates {
			candidate := &batch.assets[i].Candidates[j]
			var dependencies []string
			for _, dependency := range candidate.Dependencies {
				canonical := batch.canonicalIDs[dependency]
				if canonical == "" || canonical == candidate.ID {
					// Collapsing this catalog would invalidate an existing context
					// constraint. Keep all sources and let normal validation apply.
					return fullSemanticBatch(assets)
				}
				dependencies = appendUnique(dependencies, canonical)
			}
			candidate.Dependencies = dependencies
		}
	}
	// Collapsing equivalent nodes may expose a context cycle. Do not alter the
	// catalog to make the optimization fit; use the original batch instead.
	if _, err := mergeSourceMeaning(batch.assets, batch.assets); err != nil {
		return fullSemanticBatch(assets)
	}
	return batch
}

func fullSemanticBatch(assets []Asset) semanticSourceBatch {
	batch := semanticSourceBatch{original: assets, assets: cloneAssets(assets), representatives: make([]int, len(assets)), canonicalIDs: make(map[string]string)}
	for i, asset := range assets {
		batch.representatives[i] = i
		for _, candidate := range asset.Candidates {
			batch.canonicalIDs[candidate.ID] = candidate.ID
		}
	}
	return batch
}

func sameSemanticCatalog(a, b Asset) bool {
	if a.AnalysisVersion == "" || a.AnalysisVersion != b.AnalysisVersion || a.Role != b.Role || a.Include != b.Include {
		return false
	}
	ids, ok := duplicateCandidateIDs(a, b)
	if !ok {
		return false
	}
	rebound := cloneAssets([]Asset{a})[0]
	for i := range rebound.VoiceIntervals {
		if rebound.VoiceIntervals[i].SourceID != a.ID {
			return false
		}
		rebound.VoiceIntervals[i].SourceID = b.ID
	}
	if !slices.Equal(rebound.VoiceIntervals, b.VoiceIntervals) {
		return false
	}
	for i := range rebound.Candidates {
		c := &rebound.Candidates[i]
		c.ID, c.SourceID = ids[c.ID], b.ID
		for j, dependency := range c.Dependencies {
			if mapped, local := ids[dependency]; local {
				c.Dependencies[j] = mapped
			}
		}
	}
	if sourceCatalogChanged(b, rebound) {
		return false
	}
	other := indexCandidates([]Asset{b})
	for _, candidate := range rebound.Candidates {
		next := other[candidate.ID]
		// TakeGroup is recomputed from the actual source ID after analysis.
		candidate.TakeGroup, next.TakeGroup = "", ""
		if !reflect.DeepEqual(candidate, next) {
			return false
		}
	}
	return true
}

func (batch semanticSourceBatch) expand(annotated []Asset) ([]Asset, error) {
	validated, err := mergeSourceMeaning(batch.assets, annotated)
	if err != nil {
		return nil, err
	}
	updated := indexCandidates(validated)
	input := indexCandidates(batch.assets)
	bySource := make(map[string]Asset, len(validated))
	for _, asset := range validated {
		bySource[asset.ID] = asset
	}
	result := cloneAssets(batch.original)
	for i := range result {
		asset := &result[i]
		representative := batch.original[batch.representatives[i]]
		localIDs, _ := duplicateCandidateIDs(representative, *asset)
		for j := range asset.Candidates {
			candidate := &asset.Candidates[j]
			canonical := batch.canonicalIDs[candidate.ID]
			next := updated[canonical]
			candidate.Role, candidate.Idea, candidate.Reason = next.Role, next.Idea, next.Reason
			for _, dependency := range next.Dependencies {
				// Existing requirements keep their exact source attribution; only
				// new model findings need expansion from the representative.
				if slices.Contains(input[canonical].Dependencies, dependency) {
					continue
				}
				if mapped, local := localIDs[dependency]; local {
					dependency = mapped
				}
				candidate.Dependencies = appendUnique(candidate.Dependencies, dependency)
			}
		}
		metadata := bySource[representative.ID]
		asset.SemanticAnalysisVersion = metadata.SemanticAnalysisVersion
		for _, warning := range metadata.Warnings {
			asset.Warnings = appendUnique(asset.Warnings, warning)
		}
	}
	return mergeSourceMeaning(batch.original, result)
}
