package story

import (
	"context"
	"fmt"
	"reflect"
)

func (s *runState) narrationVersion(plan Plan, parent *Version) (Version, error) {
	timeline, err := BuildNarrationTimeline(plan, s.req.Assets)
	version := Version{Number: s.next, Plan: plan, Timeline: timeline}
	s.next++
	if parent != nil {
		version.Parent = parent.Number
	}
	return version, err
}

func (s *runState) runNarration(ctx context.Context) (Result, error) {
	finish := func(err error) (Result, error) { s.result.AICalls = s.budget.calls; return s.result, err }
	if s.req.Base != nil {
		s.result.Best = *s.req.Base
	}
	if err := s.checkpoints.Progress(ctx, "building_story", "Matching original video moments to the complete recorded narration"); err != nil {
		return finish(err)
	}
	var plan Plan
	var err error
	if s.req.Base != nil && s.req.Action == "improve_flow" {
		if _, err = editNarrationPlan(s.req); err != nil {
			return finish(err)
		}
	}
	if s.req.Base != nil && s.req.Action != "improve_flow" {
		plan, err = editNarrationPlan(s.req)
	} else {
		plan, err = s.planNarration(ctx)
	}
	if err != nil {
		return finish(err)
	}
	version, timelineErr := s.narrationVersion(plan, s.req.Base)
	version.Report = s.reviewNarrationPlan(ctx, version)
	if timelineErr != nil && len(version.Report.Issues) == 0 {
		version.Report.Issues = []Issue{{ID: "narration-coverage", Type: "narration_coverage", Severity: "critical", Evidence: timelineErr.Error(), Confidence: 1}}
	}
	if err = s.checkpoints.SaveVersion(ctx, version); err != nil {
		return finish(err)
	}
	for timelineErr == nil && hasBlocking(version.Report.Issues) && s.cycles < s.builder.limits.MaxRepairCycles {
		candidate, issue, op, ok := s.nextNarrationRepair(version)
		if !ok {
			break
		}
		s.cycles++
		if err = s.reserveAttempt(ctx, version, candidate, issue, op); err != nil {
			return finish(err)
		}
		if err = s.checkpoints.Progress(ctx, "improving", "Improving visual matching before rendering the complete recorded voice"); err != nil {
			return finish(err)
		}
		candidate.Report = s.reviewNarrationPlan(ctx, candidate)
		accepted := repairImproves(version.Report, candidate.Report, issue, version.Timeline, candidate.Timeline)
		attempt := s.attempt(version, candidate, issue, op, accepted, "Visual matching did not improve in pre-render review.")
		if accepted {
			attempt.Reason = "Improved source-backed visual matching before rendering; recorded voice remains complete."
		}
		if err = s.saveCandidate(ctx, candidate, attempt); err != nil {
			return finish(err)
		}
		if accepted {
			version = candidate
		}
	}
	if timelineErr != nil || hasCritical(version.Report.Issues) {
		if s.req.Base == nil {
			s.result.Best = version
		}
		return finish(nil)
	}
	version, err = s.renderAndReview(ctx, version, version.Report)
	if err != nil {
		return finish(err)
	}
	if invalidRenderedFile(version) {
		if err = s.checkpoints.SaveVersion(ctx, version); err != nil {
			return finish(err)
		}
		return finish(fmt.Errorf("narrated montage failed rendered file integrity checks; prior version retained"))
	}
	version.Accepted = true
	if s.req.Base != nil && introducesRegression(s.req.Base.Report, version.Report, s.req.Base.Timeline, version.Timeline) {
		version.Accepted = false
	}
	if err = s.checkpoints.SaveVersion(ctx, version); err != nil {
		return finish(err)
	}
	if !version.Accepted {
		return finish(nil)
	}
	s.result.Best = version
	for s.result.Best.Report.Status != "ready" && s.cycles < s.builder.limits.MaxRepairCycles {
		best := s.result.Best
		candidate, issue, op, ok := s.nextNarrationRepair(best)
		if !ok {
			break
		}
		s.cycles++
		if err = s.reserveAttempt(ctx, best, candidate, issue, op); err != nil {
			return finish(err)
		}
		if err = s.checkpoints.Progress(ctx, "improving", "Improving visual matching while preserving the complete recorded voice"); err != nil {
			return finish(err)
		}
		candidate.Report = s.reviewNarrationPlan(ctx, candidate)
		if !hasCritical(candidate.Report.Issues) {
			candidate, err = s.renderAndReview(ctx, candidate, candidate.Report)
		}
		if err != nil {
			if ctx.Err() != nil {
				return finish(ctx.Err())
			}
			candidate.Report.Coverage.Incomplete = append(candidate.Report.Coverage.Incomplete, "Visual repair could not render: "+err.Error())
			candidate.Report.Status = "needs_review"
		}
		accepted := candidate.Output.Key != "" && repairImproves(best.Report, candidate.Report, issue, best.Timeline, candidate.Timeline)
		candidate.Accepted = accepted
		attempt := s.attempt(best, candidate, issue, op, accepted, "Visual repair rejected: matching did not improve or introduced a blocking regression.")
		if accepted {
			attempt.Reason = "Improved source-backed visuals; complete original narration and actual output rechecked."
		}
		if err = s.saveCandidate(ctx, candidate, attempt); err != nil {
			return finish(err)
		}
		if accepted {
			s.result.Best = candidate
		}
	}
	return finish(nil)
}

func (s *runState) nextNarrationRepair(base Version) (Version, Issue, repairOperation, bool) {
	for _, issue := range base.Report.Issues {
		if issue.Resolved || issue.Type == "transcription" || issue.Type == "caption_text" {
			continue
		}
		switch issue.Type {
		case "visual_match", "continuity", "unsupported_claim", "b_roll", "crop", "framing", "visual", "visual_cut", "transition":
		default:
			continue
		}
		var block Block
		for _, b := range base.Plan.Blocks {
			if b.ID == issue.BlockID {
				block = b
				break
			}
		}
		if block.ID == "" || block.Locked {
			continue
		}
		var operations []repairOperation
		operation := issue.Operation
		if operation == "" && issue.Type == "visual_match" {
			operation = "use_alternative"
		}
		switch operation {
		case "fit_crop":
			if !block.LockCrop && block.Crop != "fit" {
				operations = append(operations, repairOperation{"fit_crop", block.ID, ""})
			}
		case "use_alternative":
			ids := append([]string(nil), block.Alternatives...)
			if issue.CandidateID != "" {
				ids = append([]string{issue.CandidateID}, ids...)
			}
			seen := make(map[string]bool)
			for _, id := range ids {
				if id == block.CandidateID || seen[id] {
					continue
				}
				seen[id] = true
				if len(operations) >= s.builder.limits.MaxAlternatives {
					break
				}
				operations = append(operations, repairOperation{"use_alternative", block.ID, id})
			}
		}
		for _, op := range operations {
			if s.tried[op.key()] {
				continue
			}
			s.tried[op.key()] = true
			plan := clonePlan(base.Plan)
			if op.name == "fit_crop" {
				for i := range plan.Blocks {
					if plan.Blocks[i].ID == block.ID {
						plan.Blocks[i].Crop = "fit"
					}
				}
			} else {
				req := s.req
				req.Base = &base
				req.Action = "alternate"
				req.BlockID = block.ID
				req.CandidateID = op.candidateID
				var err error
				plan, err = editNarrationPlan(req)
				if err != nil {
					continue
				}
			}
			if err := validateNarrationPlan(s.req, plan); err != nil {
				continue
			}
			setNarrationAlternatives(&plan, s.req.Assets)
			candidate, err := s.narrationVersion(plan, &base)
			if err != nil {
				continue
			}
			if reflect.DeepEqual(candidate.Timeline, base.Timeline) {
				s.next--
				continue
			}
			return candidate, issue, op, true
		}
	}
	return Version{}, Issue{}, repairOperation{}, false
}
