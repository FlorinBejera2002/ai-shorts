package story

import (
	"fmt"
	"strings"
)

// Restore the complete verified prerequisite chain as one bounded intervention.
// Reordering preserves whole existing blocks; it never rewrites speech, source
// intervals, crop/identity metadata, or satisfies context with a similar take.
func restoreSourceContext(plan Plan, op repairOperation, assets []Asset) (Plan, error) {
	updated := clonePlan(plan)
	all := indexCandidates(assets)
	sources := make(map[string]Asset, len(assets))
	for _, source := range assets {
		sources[source.ID] = source
	}
	position := func(id string) int {
		for i, block := range updated.Blocks {
			if block.ID == id {
				return i
			}
		}
		return -1
	}
	candidatePosition := func(id string) int {
		for i, block := range updated.Blocks {
			if block.CandidateID == id {
				return i
			}
		}
		return -1
	}
	target := position(op.blockID)
	if target < 0 {
		return Plan{}, fmt.Errorf("unknown context target block %.160q", op.blockID)
	}
	dependent := all[updated.Blocks[target].CandidateID]
	active, finished := map[string]bool{dependent.ID: true}, make(map[string]bool)
	var ensureBefore func(string, string, Candidate) error
	ensureBefore = func(id, anchorID string, parent Candidate) error {
		candidate, found := all[id]
		if !found {
			return fmt.Errorf("missing source prerequisite %.160q", id)
		}
		if source, exists := sources[candidate.SourceID]; !exists || source.Include == "excluded" {
			return fmt.Errorf("source prerequisite %.160q is unavailable or excluded", id)
		}
		if active[id] {
			return fmt.Errorf("cyclic source context at candidate %.160q", id)
		}
		if overlappingContextText(candidate, parent) {
			return fmt.Errorf("source prerequisite %.160q repeats wording already contained in %.160q; compare the original recordings before restoring this uncertain dependency", id, parent.ID)
		}
		index, anchor := candidatePosition(id), position(anchorID)
		if anchor < 0 {
			return fmt.Errorf("missing context anchor %.160q", anchorID)
		}
		if index >= 0 && index < anchor && finished[id] {
			return nil
		}
		active[id] = true
		// An already selected prerequisite keeps its original position. Its own
		// missing context is restored before that block, not after it.
		prerequisiteAnchor := anchorID
		if index >= 0 && index < anchor {
			prerequisiteAnchor = updated.Blocks[index].ID
		}
		for _, prerequisite := range candidate.Dependencies {
			if err := ensureBefore(prerequisite, prerequisiteAnchor, candidate); err != nil {
				return err
			}
		}
		active[id] = false
		finished[id] = true
		index, anchor = candidatePosition(id), position(anchorID)
		if index >= 0 && index < anchor {
			return nil
		}
		block := Block{ID: "context-" + id, CandidateID: id, Role: "context", Reason: "Restores the complete source-backed prerequisite chain.", Crop: "fit", Alternatives: eligibleAlternatives(candidate, assets)}
		if index >= 0 {
			block = updated.Blocks[index]
			if block.Locked || block.LockOrder {
				return fmt.Errorf("source prerequisite block %.160q has locked order", block.ID)
			}
			updated.Blocks = append(updated.Blocks[:index], updated.Blocks[index+1:]...)
			anchor = position(anchorID)
		} else {
			for suffix := 1; position(block.ID) >= 0; suffix++ {
				block.ID = fmt.Sprintf("context-%s-%d", id, suffix)
			}
		}
		updated.Blocks = append(updated.Blocks, Block{})
		copy(updated.Blocks[anchor+1:], updated.Blocks[anchor:])
		updated.Blocks[anchor] = block
		return nil
	}
	if err := ensureBefore(op.candidateID, op.blockID, dependent); err != nil {
		return Plan{}, err
	}
	for before, block := range plan.Blocks {
		if (block.Locked || block.LockOrder) && position(block.ID) != before {
			return Plan{}, fmt.Errorf("context restoration would move locked block %.160q", block.ID)
		}
	}
	return updated, nil
}

// This is a repetition warning, never proof of equivalent takes or identity.
// Exact multiword containment is sufficient to require review before inserting
// the same words as context, including overlapping uploads of one recording.
func overlappingContextText(context, dependent Candidate) bool {
	phraseTokens := func(text string) []string {
		words := strings.Fields(lexical(text))
		for i := range words {
			words[i] = strings.Trim(words[i], ".,")
		}
		return words
	}
	needle, haystack := phraseTokens(context.Text), phraseTokens(dependent.Text)
	if len(needle) < 4 || len(needle) > len(haystack) {
		return false
	}
	for start := 0; start+len(needle) <= len(haystack); start++ {
		match := true
		for i, word := range needle {
			if word != haystack[start+i] {
				match = false
				break
			}
		}
		if match {
			return true
		}
	}
	return false
}
