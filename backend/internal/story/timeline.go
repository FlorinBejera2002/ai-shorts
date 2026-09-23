package story

import (
	"fmt"
	"math"
	"strings"
)

// BuildTimeline derives every output clock from immutable original intervals.
// No model-proposed output timestamp or filename is ever executable.
func BuildTimeline(plan Plan, assets []Asset) ([]Entry, error) {
	all := indexCandidates(assets)
	sources := make(map[string]Asset, len(assets))
	for _, a := range assets {
		sources[a.ID] = a
	}
	entries := make([]Entry, 0, len(plan.Blocks))
	clock := 0.0
	for _, b := range plan.Blocks {
		c, ok := all[b.CandidateID]
		if !ok {
			return nil, fmt.Errorf("unknown candidate %q", b.CandidateID)
		}
		duration := c.Out - c.In
		if !finite(duration) || duration <= 0 {
			return nil, fmt.Errorf("invalid candidate interval")
		}
		e := Entry{BlockID: b.ID, CandidateID: c.ID, OutputIn: clock, OutputOut: clock + duration, Video: Interval{c.SourceID, c.In, c.Out}, Crop: b.Crop, Transition: "natural"}
		if e.Crop == "" {
			e.Crop = "fit"
		}
		if sources[c.SourceID].HasAudio {
			e.Audio = &Interval{c.SourceID, c.In, c.Out}
		}
		if b.BRollID != "" {
			visual, found := all[b.BRollID]
			if !found || visual.Out-visual.In+.001 < duration {
				return nil, fmt.Errorf("supporting footage is shorter than its spoken block")
			}
			e.Video = Interval{visual.SourceID, visual.In, visual.In + duration}
		}
		for _, word := range c.Words {
			e.Words = append(e.Words, Word{word.Text, clock + word.Start - c.In, clock + word.End - c.In})
		}
		entries = append(entries, e)
		clock += duration
	}
	return entries, nil
}

// ValidatePlan is the deterministic safety boundary between suggestions and
// executable edits. Semantic review supplements, never overrides, these checks.
func ValidatePlan(plan Plan, assets []Asset, options Options, base *Version) []Issue {
	all := indexCandidates(assets)
	sources := make(map[string]Asset, len(assets))
	for _, a := range assets {
		sources[a.ID] = a
	}
	var issues []Issue
	add := func(kind, severity string, b Block, evidence string) {
		c := all[b.CandidateID]
		issues = append(issues, Issue{ID: fmt.Sprintf("plan-%s-%s", kind, b.ID), Type: kind, Severity: severity, BlockID: b.ID, SourceIDs: []string{c.SourceID}, Evidence: evidence, Confidence: 1})
	}
	if len(plan.Blocks) == 0 {
		add("empty", "critical", Block{}, "No source-backed narrative was selected.")
		return issues
	}
	selected := make(map[string]int)
	ids := make(map[string]bool)
	includedSources := make(map[string]bool)
	var lastSourceOrder int
	var lastIn float64
	var lastSource string
	for index, b := range plan.Blocks {
		c, ok := all[b.CandidateID]
		if b.ID == "" || ids[b.ID] {
			add("block_id", "critical", b, "Block IDs must be nonempty and unique.")
		}
		ids[b.ID] = true
		if !ok {
			add("source", "critical", b, "The selected candidate does not belong to these source assets.")
			continue
		}
		if b.IdentityReferenceID != "" {
			reference, exists := all[b.IdentityReferenceID]
			if !exists || !CompatibleTake(reference, c) {
				add("identity_reference", "critical", b, "The provisional alternate has no compatible original identity reference.")
			}
		}
		source := sources[c.SourceID]
		if source.Include == "excluded" {
			add("excluded", "critical", b, "An explicitly excluded source was selected.")
		}
		if b.Crop != "" && b.Crop != "fit" && b.Crop != "track" {
			add("crop", "major", b, "Unsupported crop mode.")
		}
		if _, duplicate := selected[c.ID]; duplicate {
			add("duplicate", "major", b, "A source phrase occurs twice without an explicit editorial repetition decision.")
		}
		selected[c.ID] = index
		includedSources[c.SourceID] = true
		if options.PreserveOrder && index > 0 && (source.Order < lastSourceOrder || (lastSource == c.SourceID && c.In < lastIn)) {
			add("order", "critical", b, "The selected order contradicts Preserve source order.")
		}
		lastSourceOrder, lastSource, lastIn = source.Order, c.SourceID, c.In
		if needsContext(c.Text) && len(c.Dependencies) == 0 {
			add("context", "major", b, "This phrase refers to preceding context which could not be established from the sources.")
		}
		for _, id := range b.Alternatives {
			alternative, exists := all[id]
			if !exists || !CompatibleTake(c, alternative) || sources[alternative.SourceID].Include == "excluded" {
				add("alternative", "critical", b, "An alternate take changes words, speaker, language, or source eligibility.")
			}
		}
		if b.BRollID != "" {
			visual, exists := all[b.BRollID]
			if !exists || sources[visual.SourceID].Include == "excluded" || visual.Out-visual.In+.001 < c.Out-c.In {
				add("b_roll", "major", b, "Supporting visual is unavailable, excluded, or shorter than its audio.")
			} else if visual.Role != "b_roll" && visual.Role != "supporting" && visual.Role != "supporting_visual" && visual.Role != "transition" {
				add("b_roll_role", "major", b, "Supporting visual is not classified as B-roll or supporting footage.")
			} else {
				includedSources[visual.SourceID] = true
			}
		}
	}
	for _, b := range plan.Blocks {
		c := all[b.CandidateID]
		for _, dependency := range c.Dependencies {
			position, exists := selected[dependency]
			if !exists || position >= selected[c.ID] {
				add("dependency", "major", b, "Required preceding context is missing or occurs after its dependent phrase.")
				issues[len(issues)-1].Operation = "restore_context"
				issues[len(issues)-1].CandidateID = dependency
			} else if overlappingContextText(all[dependency], c) {
				add("context_overlap", "major", b, fmt.Sprintf("Selected prerequisite %q repeats wording contained in %q; original media must establish whether this repetition is intentional context.", dependency, c.ID))
				issues[len(issues)-1].CandidateID = dependency
				issues[len(issues)-1].SourceIDs = appendUnique(issues[len(issues)-1].SourceIDs, all[dependency].SourceID)
			}
		}
	}
	for _, source := range assets {
		if source.Include == "required" && !includedSources[source.ID] {
			add("required_source", "critical", Block{}, "An explicitly required source has no selected segment: "+source.ID)
		}
	}
	if base != nil {
		for oldIndex, old := range base.Plan.Blocks {
			newIndex := -1
			var updated Block
			for i, b := range plan.Blocks {
				if b.ID == old.ID {
					newIndex = i
					updated = b
					break
				}
			}
			if newIndex < 0 {
				if old.Locked || old.LockText || old.LockOrder || old.LockCrop {
					add("lock", "critical", old, "A locked block was removed.")
				}
				continue
			}
			if old.Locked && (old.CandidateID != updated.CandidateID || old.BRollID != updated.BRollID || old.Crop != updated.Crop || old.IdentityReferenceID != updated.IdentityReferenceID || newIndex != oldIndex) {
				add("lock", "critical", old, "A locked block was modified.")
			}
			if old.LockText && lexical(all[old.CandidateID].Text) != lexical(all[updated.CandidateID].Text) {
				add("text_lock", "critical", old, "The words in a text-locked block changed.")
			}
			if old.LockOrder && oldIndex != newIndex {
				add("order_lock", "critical", old, "An order-locked block moved.")
			}
			if old.LockCrop && old.Crop != updated.Crop {
				add("crop_lock", "critical", old, "The crop of a crop-locked block changed.")
			}
			if old.IdentityReferenceID != "" && updated.CandidateID != old.IdentityReferenceID && updated.IdentityReferenceID != old.IdentityReferenceID {
				add("identity_reference", "critical", old, "The original identity comparison requirement was removed.")
			}
		}
	}
	return issues
}

func timelineDuration(entries []Entry) float64 {
	if len(entries) == 0 {
		return 0
	}
	return entries[len(entries)-1].OutputOut
}

func annotateIssueIntervals(issues []Issue, timeline []Entry) {
	for i := range issues {
		if issues[i].BlockID != "" {
			for _, e := range timeline {
				if e.BlockID == issues[i].BlockID {
					issues[i].Start, issues[i].End = e.OutputIn, e.OutputOut
					break
				}
			}
		}
	}
}

func checkTimeline(entries []Entry, output Output) []Issue {
	if output.Key == "" || output.Size <= 0 || !finite(output.Duration) || output.Duration <= 0 {
		return []Issue{{ID: "render-integrity", Type: "file", Severity: "critical", Evidence: "The renderer did not return a complete playable output.", Confidence: 1}}
	}
	if math.Abs(timelineDuration(entries)-output.Duration) > .25 {
		return []Issue{{ID: "render-duration", Type: "duration", Severity: "critical", End: output.Duration, Evidence: "The output duration differs from the source-backed timeline.", Confidence: 1}}
	}
	return nil
}

func isBlocking(issue Issue) bool {
	return !issue.Resolved && (issue.Severity == "critical" || issue.Severity == "major")
}
func hasBlocking(issues []Issue) bool {
	for _, issue := range issues {
		if isBlocking(issue) {
			return true
		}
	}
	return false
}
func issueKey(issue Issue) string {
	return strings.Join([]string{issue.Type, issue.BlockID, issue.Severity}, "|")
}
