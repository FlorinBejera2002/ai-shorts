package story

import (
	"fmt"
	"reflect"
	"sort"
	"strings"
)

type repairOperation struct {
	name        string
	blockID     string
	candidateID string
}

func (op repairOperation) key() string {
	return strings.Join([]string{op.name, op.blockID, op.candidateID}, "|")
}

func operationFor(issue Issue, plan Plan, assets []Asset, tried map[string]bool, maxAlternatives int) (repairOperation, bool) {
	if issue.Type == "caption_text" || issue.Type == "transcription" {
		return repairOperation{}, false
	}
	var block Block
	found := false
	for _, b := range plan.Blocks {
		if b.ID == issue.BlockID {
			block = b
			found = true
			break
		}
	}
	if !found || block.Locked {
		return repairOperation{}, false
	}
	op := repairOperation{name: issue.Operation, blockID: block.ID, candidateID: issue.CandidateID}
	switch op.name {
	case "use_alternative":
		options := append([]string(nil), block.Alternatives...)
		if op.candidateID != "" {
			options = append([]string{op.candidateID}, options...)
		}
		all := indexCandidates(assets)
		count := 0
		seen := make(map[string]bool)
		for _, id := range options {
			if seen[id] {
				continue
			}
			seen[id] = true
			if !CompatibleTake(all[block.CandidateID], all[id]) {
				continue
			}
			count++
			if count > maxAlternatives {
				break
			}
			op.candidateID = id
			if !tried[op.key()] {
				return op, true
			}
		}
		return repairOperation{}, false
	case "retime_captions":
		if issue.Type != "caption_timing" || tried[op.key()] {
			return repairOperation{}, false
		}
		return op, true
	case "restore_context", "fit_crop", "remove_b_roll", "remove_transition":
		if tried[op.key()] {
			return repairOperation{}, false
		}
		return op, true
	default:
		return repairOperation{}, false
	}
}

func applyOperation(plan Plan, op repairOperation, assets []Asset) (Plan, error) {
	updated := clonePlan(plan)
	all := indexCandidates(assets)
	for i := range updated.Blocks {
		block := &updated.Blocks[i]
		if block.ID != op.blockID {
			continue
		}
		if block.Locked {
			return Plan{}, fmt.Errorf("block %s is locked", block.ID)
		}
		switch op.name {
		case "use_alternative":
			candidate, ok := all[op.candidateID]
			if !ok || !CompatibleTake(all[block.CandidateID], candidate) {
				return Plan{}, fmt.Errorf("the proposed take changes source meaning or speaker")
			}
			previous := all[block.CandidateID]
			if block.IdentityReferenceID == "" && NeedsSourceIdentity(previous, candidate) {
				block.IdentityReferenceID = previous.ID
			}
			if block.IdentityReferenceID == candidate.ID {
				block.IdentityReferenceID = ""
			}
			block.CandidateID = candidate.ID
			block.Alternatives = eligibleAlternatives(candidate, assets)
			block.Reason = "Selected an equivalent complete take after review."
			if block.IdentityReferenceID != "" {
				block.Reason = "Selected complete words from another source; original and replacement speaker identity must be checked against media."
			}
		case "restore_context":
			return restoreSourceContext(updated, op, assets)
		case "fit_crop":
			if block.LockCrop {
				return Plan{}, fmt.Errorf("the crop is locked")
			}
			if block.Crop == "fit" {
				return Plan{}, fmt.Errorf("the crop already preserves the entire frame")
			}
			block.Crop = "fit"
		case "remove_b_roll":
			if block.BRollID == "" {
				return Plan{}, fmt.Errorf("there is no B-roll to remove")
			}
			block.BRollID = ""
		case "remove_transition", "retime_captions":
			// A timeline is freshly derived, so caption positions cannot retain old
			// clocks after a duration change. Transition overrides are applied only
			// to this candidate version by applyTimelineOperation.
		default:
			return Plan{}, fmt.Errorf("unsupported repair operation")
		}
		return updated, nil
	}
	return Plan{}, fmt.Errorf("unknown target block")
}

func applyTimelineOperation(entries []Entry, op repairOperation) {
	if op.name == "remove_transition" {
		for i := range entries {
			if entries[i].BlockID == op.blockID {
				entries[i].Transition = "cut"
			}
		}
	}
}

// Caption retiming has no authority to replace words or alter source edits. A
// genuine clock correction changes only the target block's existing word times.
func captionTimingOnlyChanged(before, after []Entry, blockID string) bool {
	if len(before) != len(after) {
		return false
	}
	changed := false
	for i, previous := range before {
		next := after[i]
		if previous.BlockID != blockID {
			if !reflect.DeepEqual(previous, next) {
				return false
			}
			continue
		}
		if len(previous.Words) != len(next.Words) {
			return false
		}
		for j, word := range previous.Words {
			if word.Text != next.Words[j].Text {
				return false
			}
			changed = changed || word.Start != next.Words[j].Start || word.End != next.Words[j].End
		}
		next.Words = previous.Words
		if !reflect.DeepEqual(previous, next) {
			return false
		}
	}
	return changed
}

// RepairScope includes the changed block, its cut neighbors, semantic dependents,
// and every downstream timing dependency. It never means reanalyzing sources.
func RepairScope(plan Plan, assets []Asset, blockID string) []string {
	index := -1
	for i, b := range plan.Blocks {
		if b.ID == blockID {
			index = i
			break
		}
	}
	if index < 0 {
		return nil
	}
	start := max(0, index-1)
	scope := make([]string, 0, len(plan.Blocks)-start)
	for i := start; i < len(plan.Blocks); i++ {
		scope = append(scope, plan.Blocks[i].ID)
	}
	all := indexCandidates(assets)
	changed := plan.Blocks[index].CandidateID
	for _, b := range plan.Blocks[:start] {
		for _, dep := range all[b.CandidateID].Dependencies {
			if dep == changed {
				scope = appendUnique(scope, b.ID)
			}
		}
	}
	return scope
}

func editPlan(req Request) (Plan, error) {
	if req.Base == nil {
		return Plan{}, fmt.Errorf("a previous timeline version is required")
	}
	plan := clonePlan(req.Base.Plan)
	if req.Action == "resume" || req.Action == "improve_transitions" {
		return plan, nil
	}
	all := indexCandidates(req.Assets)
	if req.BlockID == "" && (req.Action == "faster" || req.Action == "make_faster") {
		var bestReduction float64
		for _, block := range plan.Blocks {
			if block.Locked {
				continue
			}
			current := all[block.CandidateID]
			for _, id := range eligibleAlternatives(current, req.Assets) {
				candidate := all[id]
				reduction := current.Out - current.In - (candidate.Out - candidate.In)
				if reduction > bestReduction+.05 {
					bestReduction = reduction
					req.BlockID = block.ID
					req.CandidateID = id
				}
			}
		}
		if req.BlockID == "" {
			return Plan{}, fmt.Errorf("no shorter equivalent take is available for unlocked sections; record a more concise complete take")
		}
	}
	for _, block := range plan.Blocks {
		if block.ID != req.BlockID {
			continue
		}
		if block.Locked {
			return Plan{}, fmt.Errorf("unlock this block before changing its take")
		}
		candidateID := req.CandidateID
		switch req.Action {
		case "alternate", "use_alternative", "use_another_take":
			if candidateID == "" {
				return Plan{}, fmt.Errorf("choose an alternative take")
			}
		case "regenerate_section", "faster", "make_faster":
			options := eligibleAlternatives(all[block.CandidateID], req.Assets)
			if req.Action != "regenerate_section" {
				sort.SliceStable(options, func(i, j int) bool {
					return all[options[i]].Out-all[options[i]].In < all[options[j]].Out-all[options[j]].In
				})
			}
			for _, id := range options {
				c := all[id]
				if req.Action == "regenerate_section" || c.Out-c.In < all[block.CandidateID].Out-all[block.CandidateID].In-.05 {
					candidateID = id
					break
				}
			}
			if candidateID == "" {
				return Plan{}, fmt.Errorf("no suitable equivalent source take is available; record another complete take")
			}
		default:
			return Plan{}, fmt.Errorf("unsupported story edit")
		}
		return applyOperation(plan, repairOperation{"use_alternative", block.ID, candidateID}, req.Assets)
	}
	return Plan{}, fmt.Errorf("choose an existing story block")
}

// ValidateEdit checks source availability and user locks without invoking AI or
// charging work. API callers use the same rules as the worker before queuing.
func ValidateEdit(req Request) error {
	if req.Action == "restyle" {
		if req.Base == nil || !req.Base.Accepted || req.Base.Output.Key == "" || len(req.Base.Timeline) == 0 || req.BlockID != "" || req.CandidateID != "" {
			return fmt.Errorf("restyling requires an accepted rendered story")
		}
		return ValidateBrandOptions(req.Options)
	}
	if req.Options.Narration {
		_, err := editNarrationPlan(req)
		return err
	}
	if req.Base == nil || len(req.Base.Plan.Blocks) == 0 {
		return fmt.Errorf("generate a story before editing its sections")
	}
	if req.Action == "improve_flow" {
		for _, block := range req.Base.Plan.Blocks {
			if !block.Locked {
				return nil
			}
		}
		return fmt.Errorf("all story sections are locked; unlock a section before improving the flow")
	}
	plan, err := editPlan(req)
	if err != nil {
		return err
	}
	before := ValidatePlan(req.Base.Plan, req.Assets, req.Options, req.Base)
	after := ValidatePlan(plan, req.Assets, req.Options, req.Base)
	if introducesRegression(Report{Issues: before}, Report{Issues: after}) {
		for _, issue := range after {
			if isBlocking(issue) {
				return fmt.Errorf("%s", issue.Evidence)
			}
		}
	}
	if hasCritical(after) {
		for _, issue := range after {
			if issue.Severity == "critical" {
				return fmt.Errorf("%s", issue.Evidence)
			}
		}
	}
	return nil
}
