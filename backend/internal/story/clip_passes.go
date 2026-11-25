package story

import (
	"context"
	"fmt"
)

// addClipOutputs renders the remaining clips of a multi-clip story after the
// primary edit is accepted. Each extra clip is planned from footage its
// predecessors did not use, then rendered and stored in the same version.
func (s *runState) addClipOutputs(ctx context.Context) error {
	best := &s.result.Best
	if best.Output.Key == "" || best.Output.StudioManualEdits {
		return nil
	}
	if s.req.Base != nil && s.req.Action != "resume" {
		// Edits operate on the single selected clip; the saved version keeps its outputs.
		return nil
	}
	count := ResolvedClipCount(s.req.Options, s.req.Assets)
	if count <= 1 {
		return nil
	}
	used := timelineCandidateIDs(best.Timeline)
	outputs := []ClipOutput{primaryClipOutput(*best)}
	for index := 1; index < count; index++ {
		clip, clipUsed, budgetCalls, err := s.renderExtraClip(ctx, index, best.Number, used)
		s.budget.calls += budgetCalls
		if err != nil {
			if ctxErr := ctx.Err(); ctxErr != nil {
				return ctxErr
			}
			// Automatic counts stop once the footage cannot support another distinct clip.
			if s.req.Options.ClipCount == 0 {
				best.Report.Coverage.Incomplete = appendUnique(best.Report.Coverage.Incomplete, fmt.Sprintf("Auto stopped at %d clips: the footage did not support more distinct edits.", len(outputs)))
				break
			}
			return fmt.Errorf("render clip %d of %d: %w", index+1, count, err)
		}
		for id := range clipUsed {
			used[id] = true
		}
		outputs = append(outputs, clip)
	}
	best.Outputs = outputs
	return s.checkpoints.SaveVersion(ctx, *best)
}

// renderExtraClip plans and renders one additional clip with its own AI budget.
// It returns the clip's candidate IDs so later clips avoid the same moments.
func (s *runState) renderExtraClip(ctx context.Context, index, number int, used map[string]bool) (ClipOutput, map[string]bool, int, error) {
	extra := &runState{
		builder:     s.builder,
		checkpoints: catalogPreservingCheckpoints{Checkpoints: s.checkpoints, catalogs: fullCatalogs(s.req.Assets)},
		budget:      &runBudget{max: s.builder.limits.MaxAICalls},
		next:        number,
		tried:       make(map[string]bool),
	}
	extra.req = s.req
	extra.req.Assets = withoutCandidates(s.req.Assets, used)
	plan, err := s.builder.plan(ctx, extra.req, extra.budget)
	if err != nil {
		return ClipOutput{}, nil, extra.budget.calls, err
	}
	plan, err = CompleteOriginalSpeech(plan, extra.req.Assets, extra.req.Options)
	if err != nil {
		return ClipOutput{}, nil, extra.budget.calls, err
	}
	version, err := extra.version(plan, nil, repairOperation{})
	if err != nil {
		return ClipOutput{}, nil, extra.budget.calls, err
	}
	if timelineDuration(version.Timeline) > s.builder.limits.MaxTotalSeconds {
		return ClipOutput{}, nil, extra.budget.calls, fmt.Errorf("clip %d exceeds the configured duration limit", index+1)
	}
	pre := s.builder.preReview(ctx, extra.req, version, extra.budget)
	if hasCritical(pre.Issues) {
		return ClipOutput{}, nil, extra.budget.calls, fmt.Errorf("clip %d failed source, lock, or semantic checks", index+1)
	}
	version, err = extra.renderAndReview(ctx, version, pre)
	if err != nil {
		return ClipOutput{}, nil, extra.budget.calls, err
	}
	if invalidRenderedFile(version) {
		return ClipOutput{}, nil, extra.budget.calls, fmt.Errorf("clip %d failed rendered file integrity checks", index+1)
	}
	clip := primaryClipOutput(version)
	clip.ID = clipOutputID(number, index)
	clip.Index = index
	return clip, timelineCandidateIDs(version.Timeline), extra.budget.calls, nil
}

func timelineCandidateIDs(timeline []Entry) map[string]bool {
	ids := make(map[string]bool, len(timeline))
	for _, entry := range timeline {
		ids[entry.CandidateID] = true
	}
	return ids
}

// withoutCandidates returns a copy of assets whose candidates exclude used IDs.
func withoutCandidates(assets []Asset, used map[string]bool) []Asset {
	filtered := cloneAssets(assets)
	for i := range filtered {
		kept := filtered[i].Candidates[:0]
		for _, candidate := range filtered[i].Candidates {
			if !used[candidate.ID] {
				kept = append(kept, candidate)
			}
		}
		filtered[i].Candidates = kept
	}
	return filtered
}

// catalogPreservingCheckpoints persists assets with their complete candidate
// catalogs. Extra clips plan from filtered candidates only in memory; any asset
// saved during their render (for example cleanup) must not drop the moments
// that the primary and later clips still need.
type catalogPreservingCheckpoints struct {
	Checkpoints
	catalogs map[string][]Candidate
}

func (c catalogPreservingCheckpoints) SaveAsset(ctx context.Context, asset Asset) error {
	asset.Candidates = c.catalogs[asset.ID]
	return c.Checkpoints.SaveAsset(ctx, asset)
}

func fullCatalogs(assets []Asset) map[string][]Candidate {
	catalogs := make(map[string][]Candidate, len(assets))
	for _, asset := range assets {
		catalogs[asset.ID] = asset.Candidates
	}
	return catalogs
}
