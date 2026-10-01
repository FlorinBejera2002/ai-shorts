package story

import (
	"fmt"
	"strings"
)

// Restore verified context and its prerequisite chain as one bounded intervention.
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
	dependent, found := all[updated.Blocks[target].CandidateID]
	if !found {
		return Plan{}, fmt.Errorf("unknown source candidate for context target %.160q", op.blockID)
	}
	requested, found := all[op.candidateID]
	if !found {
		return Plan{}, fmt.Errorf("missing source prerequisite %.160q", op.candidateID)
	}
	// A media reviewer can request the following part of a cut-off utterance.
	// Source clocks establish this direction only within the same recording.
	// Explicit prerequisite relations still require their original before-order.
	following := requested.SourceID == dependent.SourceID && requested.In >= dependent.Out-.001 && !requiresCandidate(dependent.ID, requested.ID, all)
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
		if err := validateContextInterval(candidate, sources); err != nil {
			return err
		}
		if overlappingContextIntervals(candidate, parent) {
			return fmt.Errorf("source context %.160q [%.3f, %.3f] overlaps %.160q [%.3f, %.3f]; whole intervals cannot be restored without repeating original audio", id, candidate.In, candidate.Out, parent.ID, parent.In, parent.Out)
		}
		if following {
			if candidate.SourceID == parent.SourceID && candidate.In >= parent.Out-.001 {
				return fmt.Errorf("source prerequisite %.160q follows %.160q in the original recording; placing it before that phrase would reverse source chronology", id, parent.ID)
			}
			if candidate.ID != dependent.ID && overlappingContextIntervals(candidate, dependent) {
				return fmt.Errorf("source prerequisite %.160q overlaps the original context anchor %.160q", id, dependent.ID)
			}
			// Earlier/cross-source setup belongs before the original anchor,
			// never between that anchor and its following speech continuation.
			if candidate.SourceID != dependent.SourceID || candidate.Out <= dependent.In+.001 {
				if position(anchorID) > position(op.blockID) {
					anchorID = op.blockID
				}
			}
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
	if following {
		if err := validateContextInterval(dependent, sources); err != nil {
			return Plan{}, err
		}
		if err := validateContextInterval(requested, sources); err != nil {
			return Plan{}, err
		}
		if overlappingContextText(requested, dependent) {
			return Plan{}, fmt.Errorf("following source context %.160q repeats wording already contained in %.160q; compare the original recordings before restoring this uncertain continuation", requested.ID, dependent.ID)
		}
		index := candidatePosition(requested.ID)
		block := Block{ID: "context-" + requested.ID, CandidateID: requested.ID, Role: "context", Reason: "Restores the following source-backed continuation in original audio order.", Crop: "fit", Alternatives: eligibleAlternatives(requested, assets)}
		if index >= 0 {
			block = updated.Blocks[index]
			if index != target+1 && (block.Locked || block.LockOrder) {
				return Plan{}, fmt.Errorf("following context block %.160q has locked order", block.ID)
			}
		} else {
			for suffix := 1; position(block.ID) >= 0; suffix++ {
				block.ID = fmt.Sprintf("context-%s-%d", requested.ID, suffix)
			}
		}
		if index != target+1 {
			if index >= 0 {
				updated.Blocks = append(updated.Blocks[:index], updated.Blocks[index+1:]...)
				target = position(op.blockID)
			}
			insert := target + 1
			updated.Blocks = append(updated.Blocks, Block{})
			copy(updated.Blocks[insert+1:], updated.Blocks[insert:])
			updated.Blocks[insert] = block
		}
		active = map[string]bool{requested.ID: true}
		for _, prerequisite := range requested.Dependencies {
			if err := ensureBefore(prerequisite, block.ID, requested); err != nil {
				return Plan{}, err
			}
		}
	} else {
		if err := ensureBefore(op.candidateID, op.blockID, dependent); err != nil {
			return Plan{}, err
		}
	}
	if following {
		var previous Candidate
		for _, block := range updated.Blocks {
			candidate := all[block.CandidateID]
			if candidate.SourceID != dependent.SourceID {
				continue
			}
			if previous.ID != "" && candidate.In < previous.Out-.001 {
				return Plan{}, fmt.Errorf("following context would reverse or overlap original audio: %.160q [%.3f, %.3f] would precede %.160q [%.3f, %.3f]", previous.ID, previous.In, previous.Out, candidate.ID, candidate.In, candidate.Out)
			}
			previous = candidate
		}
	}
	for before, block := range plan.Blocks {
		if (block.Locked || block.LockOrder) && position(block.ID) != before {
			return Plan{}, fmt.Errorf("context restoration would move locked block %.160q", block.ID)
		}
	}
	return updated, nil
}

func validateContextInterval(candidate Candidate, sources map[string]Asset) error {
	source, found := sources[candidate.SourceID]
	if !found || source.Include == "excluded" {
		return fmt.Errorf("source prerequisite %.160q is unavailable or excluded", candidate.ID)
	}
	if !finite(candidate.In) || !finite(candidate.Out) || candidate.In < 0 || candidate.Out <= candidate.In || !finite(source.Duration) || source.Duration <= 0 || candidate.Out > source.Duration+.001 {
		return fmt.Errorf("source context %.160q [%.3f, %.3f] is outside original source %.160q [0, %.3f]", candidate.ID, candidate.In, candidate.Out, candidate.SourceID, source.Duration)
	}
	return nil
}

func overlappingContextIntervals(a, b Candidate) bool {
	return a.ID != b.ID && a.SourceID == b.SourceID && a.In < b.Out-.001 && b.In < a.Out-.001
}

func requiresCandidate(dependent, prerequisite string, all map[string]Candidate) bool {
	seen := make(map[string]bool)
	var visit func(string) bool
	visit = func(id string) bool {
		if seen[id] {
			return false
		}
		seen[id] = true
		for _, dependency := range all[id].Dependencies {
			if dependency == prerequisite || visit(dependency) {
				return true
			}
		}
		return false
	}
	return visit(dependent)
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
