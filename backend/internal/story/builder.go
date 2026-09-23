package story

import (
	"context"
	"errors"
	"fmt"
	"reflect"

	"sneepcut/backend-go/internal/aiprovider"
)

type Builder struct {
	media  Media
	ai     aiprovider.Generator
	limits Limits
}

func New(media Media, ai aiprovider.Generator, limits Limits) *Builder {
	return &Builder{media: media, ai: ai, limits: NormalizeLimits(limits)}
}

// Run operates on one confirmed source set. Checkpoints persist complete versions
// before replacing the selected version, so a worker restart or rejected repair
// cannot destroy the last usable result.
func (b *Builder) Run(parent context.Context, req Request, checkpoints Checkpoints) (Result, error) {
	if b.media == nil || checkpoints == nil {
		return Result{}, errors.New("story media and durable checkpoints are required")
	}
	options, err := NormalizeOptions(req.Options)
	if err != nil {
		return Result{}, err
	}
	req.Options = options
	if err = ValidateAssets(req.Assets, b.limits); err != nil {
		return Result{}, err
	}
	if err = ValidateNarrationAssets(req.Assets, req.Options); err != nil {
		return Result{}, err
	}
	ctx, cancel := context.WithTimeout(parent, b.limits.Timeout)
	defer cancel()
	state := runState{builder: b, req: req, checkpoints: checkpoints, budget: &runBudget{max: b.limits.MaxAICalls}, next: max(1, req.VersionStart), tried: make(map[string]bool)}
	for _, attempt := range req.PreviousAttempts {
		operation := repairOperation{attempt.Operation, attempt.BlockID, attempt.CandidateID}
		if !state.tried[operation.key()] {
			state.cycles++
			state.tried[operation.key()] = true
		}
		state.result.Attempts = append(state.result.Attempts, attempt)
	}
	if req.Action == "restyle" {
		return state.runRestyle(ctx)
	}
	if err = state.analyze(ctx); err != nil {
		return state.result, err
	}
	req = state.req
	if req.Options.Narration {
		return state.runNarration(ctx)
	}
	if err = checkpoints.Progress(ctx, "building_story", "Selecting complete source phrases across all uploads"); err != nil {
		return state.result, err
	}
	var plan Plan
	if req.Base != nil && req.Action != "" && req.Action != "improve_flow" {
		plan, err = editPlan(req)
	} else {
		plan, err = b.plan(ctx, req, state.budget)
		if req.Base != nil {
			preserveBlockIdentity(&plan, req.Base.Plan)
		}
	}
	if err != nil {
		return state.result, err
	}
	version, err := state.version(plan, req.Base, repairOperation{})
	if err != nil {
		return state.result, err
	}
	pre := b.preReview(ctx, req, version, state.budget)
	version.Report = pre
	if err = checkpoints.SaveVersion(ctx, version); err != nil {
		return state.result, err
	}
	// Context restoration and source constraints are repaired before spending on
	// a render. Previews without enough source material remain explicitly drafts.
	for hasBlocking(pre.Issues) && state.cycles < b.limits.MaxRepairCycles {
		candidate, issue, operation, ok := state.nextRepair(version)
		if !ok {
			break
		}
		state.cycles++
		if err = state.reserveAttempt(ctx, version, candidate, issue, operation); err != nil {
			return state.result, err
		}
		if err = checkpoints.Progress(ctx, "improving", "Repairing source context before rendering"); err != nil {
			return state.result, err
		}
		candidate.Report = b.preReview(ctx, req, candidate, state.budget)
		accepted := repairImproves(pre, candidate.Report, issue, version.Timeline, candidate.Timeline)
		attempt := state.attempt(version, candidate, issue, operation, accepted, "Pre-render source and semantic checks did not improve.")
		if accepted {
			attempt.Reason = "Restored source-backed context before rendering."
		}
		if err = state.saveCandidate(ctx, candidate, attempt); err != nil {
			return state.result, err
		}
		if accepted {
			version = candidate
			pre = candidate.Report
		}
	}
	if err = ctx.Err(); err != nil {
		return state.result, err
	}
	if hasCritical(pre.Issues) {
		if err = checkpoints.SaveVersion(ctx, version); err != nil {
			return state.result, err
		}
		return state.result, fmt.Errorf("story plan failed source or lock safety checks")
	}
	version, err = state.renderAndReview(ctx, version, pre)
	if err != nil {
		return state.result, err
	}
	if invalidRenderedFile(version) {
		if err = checkpoints.SaveVersion(ctx, version); err != nil {
			return state.result, err
		}
		return state.result, fmt.Errorf("rendered story failed file integrity checks; the previous version was retained")
	}
	// The first usable source-backed draft is retained even when review finds
	// defects. It is never advertised as Ready until all coverage gates pass.
	version.Accepted = true
	if req.Base != nil && req.Action != "resume" && introducesRegression(req.Base.Report, version.Report, req.Base.Timeline, version.Timeline) {
		version.Accepted = false
		state.result.Best = *req.Base
		if err = checkpoints.SaveVersion(ctx, version); err != nil {
			return state.result, err
		}
		state.result.AICalls = state.budget.calls
		return state.result, nil
	}
	if err = checkpoints.SaveVersion(ctx, version); err != nil {
		return state.result, err
	}
	state.result.Best = version
	for state.result.Best.Report.Status != "ready" && state.cycles < b.limits.MaxRepairCycles {
		best := state.result.Best
		candidate, issue, operation, ok := state.nextRepair(best)
		if !ok {
			break
		}
		state.cycles++
		if err = state.reserveAttempt(ctx, best, candidate, issue, operation); err != nil {
			return state.result, err
		}
		if err = checkpoints.Progress(ctx, "improving", "Repairing one issue and rechecking the complete story"); err != nil {
			return state.result, err
		}
		candidatePre := b.preReview(ctx, req, candidate, state.budget)
		candidate.Report = candidatePre
		if !hasBlocking(candidatePre.Issues) {
			candidate, err = state.renderAndReview(ctx, candidate, candidatePre)
			if err != nil {
				if ctx.Err() != nil {
					return state.result, ctx.Err()
				}
				candidate.Report.Coverage.Incomplete = append(candidate.Report.Coverage.Incomplete, "Repair candidate failed to render: "+err.Error())
				candidate.Report.Status = "needs_review"
			}
		}
		accepted := candidate.Output.Key != "" && repairImproves(best.Report, candidate.Report, issue, best.Timeline, candidate.Timeline)
		candidate.Accepted = accepted
		attempt := state.attempt(best, candidate, issue, operation, accepted, "Candidate rejected: target persists, coverage is incomplete, or a blocking regression was introduced.")
		if accepted {
			attempt.Reason = "Target issue resolved with no new blocking issue; complete story rechecked."
		}
		if err = state.saveCandidate(ctx, candidate, attempt); err != nil {
			return state.result, err
		}
		if accepted {
			state.result.Best = candidate
		}
	}
	state.result.AICalls = state.budget.calls
	if state.repairNotesChanged {
		if err = checkpoints.SaveVersion(ctx, state.result.Best); err != nil {
			return state.result, err
		}
	}
	return state.result, nil
}

type runState struct {
	builder            *Builder
	req                Request
	checkpoints        Checkpoints
	budget             *runBudget
	next               int
	cycles             int
	tried              map[string]bool
	result             Result
	repairNotesChanged bool
}

func (s *runState) analyze(ctx context.Context) error {
	if err := s.checkpoints.Progress(ctx, "analyzing", "Analyzing original sources and word timing"); err != nil {
		return err
	}
	// Copy source slices so analysis cannot mutate the caller's saved request.
	s.req.Assets = cloneAssets(s.req.Assets)
	pinnedSources := acceptedSourceReferences(s.req)
	for i, original := range s.req.Assets {
		if err := ctx.Err(); err != nil {
			return err
		}
		// The adapter owns content/model/settings cache validation. Even a saved
		// candidate set must pass that cheap check once per run, never per repair.
		analyzed, err := s.builder.media.Analyze(ctx, s.req.ID, cloneAssets([]Asset{original})[0], s.req.Options)
		if err != nil {
			return fmt.Errorf("analyze source %s: %w", original.ID, err)
		}
		// A processing adapter may add proxies and evidence, but cannot replace
		// the owner-approved original file or its user inclusion settings.
		analyzed.ID, analyzed.Key, analyzed.Hash, analyzed.Size = original.ID, original.Key, original.Hash, original.Size
		analyzed.Order, analyzed.Role, analyzed.Include = original.Order, original.Role, original.Include
		analyzed.Kind = original.Kind
		if pinnedSources[original.ID] && sourceCatalogChanged(original, analyzed) {
			// Candidate IDs are not immutable across model/segmentation upgrades.
			// Keep the complete saved catalog so the accepted version's blocks,
			// captions, alternate choices and identity references retain meaning.
			analyzed = original
			analyzed.Warnings = appendUnique(analyzed.Warnings, pinnedSourceWarning)
		} else if pinnedSources[original.ID] {
			// Local cache files may precede semantic context enrichment. Preserve
			// known requirements even when refreshed immutable evidence is equal.
			previous := indexCandidates([]Asset{original})
			for j := range analyzed.Candidates {
				for _, dependency := range previous[analyzed.Candidates[j].ID].Dependencies {
					analyzed.Candidates[j].Dependencies = appendUnique(analyzed.Candidates[j].Dependencies, dependency)
				}
			}
		}
		s.req.Assets[i] = analyzed
		if err = s.checkpoints.SaveAsset(ctx, analyzed); err != nil {
			return err
		}
	}
	if err := ValidateAssets(s.req.Assets, s.builder.limits); err != nil {
		return err
	}
	if err := s.analyzeSourceMeaning(ctx); err != nil {
		return err
	}
	if err := prepareCandidates(s.req.Assets); err != nil {
		return err
	}
	for _, asset := range s.req.Assets {
		if err := s.checkpoints.SaveAsset(ctx, asset); err != nil {
			return err
		}
	}
	return nil
}

func (s *runState) version(plan Plan, parent *Version, operation repairOperation) (Version, error) {
	timeline, err := BuildTimeline(plan, s.req.Assets)
	if err != nil {
		return Version{}, err
	}
	version := Version{Number: s.next, Plan: plan, Timeline: timeline}
	s.next++
	if parent != nil {
		version.Parent = parent.Number
		for i := range version.Timeline {
			for _, old := range parent.Timeline {
				if old.BlockID == version.Timeline[i].BlockID && old.CandidateID == version.Timeline[i].CandidateID && old.Transition == "cut" {
					version.Timeline[i].Transition = "cut"
				}
			}
		}
	}
	applyTimelineOperation(version.Timeline, operation)
	return version, nil
}

func (s *runState) renderAndReview(ctx context.Context, version Version, pre Report) (Version, error) {
	if err := s.checkpoints.Progress(ctx, "editing", "Assembling the source-backed timeline"); err != nil {
		return version, err
	}
	output, err := s.builder.media.RenderStory(ctx, s.req, version)
	if err != nil {
		return version, err
	}
	version.Output = output
	options := s.req.Options
	version.RenderOptions = &options
	if err = s.checkpoints.Progress(ctx, "reviewing", "Reviewing actual output audio, images, captions and story"); err != nil {
		return version, err
	}
	version.Report = s.builder.postReview(ctx, s.req, version, pre, s.budget)
	if ctx.Err() != nil {
		return version, ctx.Err()
	}
	return version, nil
}

func (s *runState) nextRepair(base Version) (Version, Issue, repairOperation, bool) {
	for i, issue := range base.Report.Issues {
		if issue.Resolved {
			continue
		}
		note := func(reason string) {
			if base.Report.Issues[i].RepairNote != reason {
				base.Report.Issues[i].RepairNote = reason
				s.repairNotesChanged = true
			}
		}
		if issue.Type == "caption_text" || issue.Type == "transcription" {
			note("Transcript wording needs source-supported review; timing, crop, and equivalent-take operations cannot correct these words.")
			continue
		}
		if issue.Operation == "retime_captions" && issue.Type != "caption_timing" {
			note("Retiming cannot correct transcript wording; this finding needs source-supported transcript review.")
			continue
		}
		op, ok := operationFor(issue, base.Plan, s.req.Assets, s.tried, s.builder.limits.MaxAlternatives)
		if !ok {
			continue
		}
		s.tried[op.key()] = true
		plan, err := applyOperation(base.Plan, op, s.req.Assets)
		if err != nil {
			note("Automatic repair is not applicable: " + err.Error())
			continue
		}
		beforeSafety := Report{Issues: ValidatePlan(base.Plan, s.req.Assets, s.req.Options, s.req.Base)}
		afterSafety := Report{Issues: ValidatePlan(plan, s.req.Assets, s.req.Options, s.req.Base)}
		if regressions := blockingRegressions(beforeSafety, afterSafety); len(regressions) > 0 {
			constraint := regressions[0]
			note(fmt.Sprintf("Automatic repair would violate %s for block %.160q (candidate %.160q): %.600s", constraint.Type, constraint.BlockID, constraint.CandidateID, constraint.Evidence))
			continue
		}
		candidate, err := s.version(plan, &base, op)
		if err != nil {
			note("Automatic repair could not form a source-backed timeline: " + err.Error())
			continue
		}
		if timelineDuration(candidate.Timeline) > s.builder.limits.MaxTotalSeconds {
			s.next--
			note(fmt.Sprintf("Automatic repair would exceed the configured duration limit: %.2fs exceeds %.2fs.", timelineDuration(candidate.Timeline), s.builder.limits.MaxTotalSeconds))
			continue
		}
		if reflect.DeepEqual(base.Timeline, candidate.Timeline) {
			// Changes to explanations alone cannot change rendered evidence. Avoid
			// reserving an attempt, provider call, or render for an identical EDL.
			s.next--
			if op.name == "retime_captions" {
				note("Caption timing already matches source words; retiming would produce identical output and cannot correct transcript wording.")
			} else {
				note("Automatic repair would produce identical output; the finding remains unresolved.")
			}
			continue
		}
		if op.name == "retime_captions" && (!s.req.Options.Captions || !captionTimingOnlyChanged(base.Timeline, candidate.Timeline, op.blockID)) {
			s.next--
			note("Caption retiming requires enabled captions and may change only existing source-word clocks; this proposal needs another kind of review.")
			continue
		}
		return candidate, issue, op, true
	}
	return Version{}, Issue{}, repairOperation{}, false
}

func (s *runState) attempt(before, after Version, issue Issue, op repairOperation, accepted bool, reason string) Attempt {
	scope := RepairScope(before.Plan, s.req.Assets, op.blockID)
	for _, id := range RepairScope(after.Plan, s.req.Assets, op.blockID) {
		scope = appendUnique(scope, id)
	}
	return Attempt{IssueID: issue.ID, Operation: op.name, BlockID: op.blockID, CandidateID: op.candidateID, Scope: scope, Version: after.Number, Accepted: accepted, Reason: reason}
}

func (s *runState) reserveAttempt(ctx context.Context, before, after Version, issue Issue, op repairOperation) error {
	attempt := s.attempt(before, after, issue, op, false, "Repair candidate reserved; review pending.")
	if err := s.checkpoints.SaveAttempt(ctx, attempt); err != nil {
		return err
	}
	s.recordAttempt(attempt)
	return nil
}

func (s *runState) saveCandidate(ctx context.Context, version Version, attempt Attempt) error {
	if err := s.checkpoints.SaveVersion(ctx, version); err != nil {
		return err
	}
	if err := s.checkpoints.SaveAttempt(ctx, attempt); err != nil {
		return err
	}
	s.recordAttempt(attempt)
	return nil
}

func (s *runState) recordAttempt(attempt Attempt) {
	for i, previous := range s.result.Attempts {
		if previous.Version == attempt.Version && previous.Operation == attempt.Operation {
			s.result.Attempts[i] = attempt
			return
		}
	}
	s.result.Attempts = append(s.result.Attempts, attempt)
}

func hasCritical(issues []Issue) bool {
	for _, issue := range issues {
		if !issue.Resolved && issue.Severity == "critical" {
			return true
		}
	}
	return false
}

func invalidRenderedFile(version Version) bool {
	if len(checkTimeline(version.Timeline, version.Output)) > 0 {
		return true
	}
	for _, issue := range version.Report.Issues {
		if !issue.Resolved && issue.Severity == "critical" && (issue.Type == "file" || issue.Type == "invalid_file" || issue.Type == "file_integrity") {
			return true
		}
	}
	return false
}

func introducesRegression(before, after Report, timelines ...[]Entry) bool {
	if before.Status == "ready" && after.Status != "ready" {
		return true
	}
	return introducesBlockingRegression(before, after, timelines...)
}

func preserveBlockIdentity(plan *Plan, previous Plan) {
	reserved := make(map[string]bool)
	for _, old := range previous.Blocks {
		reserved[old.ID] = true
	}
	for i := range plan.Blocks {
		matched := false
		for _, old := range previous.Blocks {
			if old.CandidateID == plan.Blocks[i].CandidateID {
				matched = true
				if old.Locked {
					plan.Blocks[i] = old
					break
				}
				plan.Blocks[i].ID = old.ID
				plan.Blocks[i].Locked = old.Locked
				plan.Blocks[i].LockText = old.LockText
				plan.Blocks[i].LockOrder = old.LockOrder
				plan.Blocks[i].LockCrop = old.LockCrop
				plan.Blocks[i].IdentityReferenceID = old.IdentityReferenceID
				if old.LockCrop {
					plan.Blocks[i].Crop = old.Crop
				}
				break
			}
		}
		if !matched {
			for suffix := 1; ; suffix++ {
				id := fmt.Sprintf("new-block-%d-%d", i+1, suffix)
				if !reserved[id] {
					plan.Blocks[i].ID = id
					reserved[id] = true
					break
				}
			}
		}
	}
}
