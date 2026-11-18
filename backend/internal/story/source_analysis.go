package story

import (
	"context"
	"fmt"
	"reflect"
	"slices"
	"unicode/utf8"
)

func (s *runState) analyzeSourceMeaning(ctx context.Context) error {
	analyzer, ok := s.builder.media.(SourceAnalyzer)
	if !ok {
		return nil
	}
	// A saved edit binds the action evidence that authorized its source window.
	// Optional reanalysis may enrich other candidates, but cannot invalidate an
	// approved trim by withdrawing or moving its protected action afterward.
	defer pinStoryActionEvidence(&s.req)()
	// Both budgets charge actual provider calls, not cached analysis. Keep the
	// outer context in the closure so the durable reservation cannot recurse.
	budgetContext := WithAIBudget(ctx, func(callContext context.Context) error {
		if err := callContext.Err(); err != nil {
			return err
		}
		if err := s.budget.take(); err != nil {
			return err
		}
		return ReserveAICall(ctx)
	})
	batch := duplicateSemanticBatch(s.req.Assets)
	annotated, err := analyzer.AnalyzeStorySources(budgetContext, cloneAssets(batch.assets), s.req.Options)
	if ctx.Err() != nil {
		return ctx.Err()
	}
	var merged []Asset
	if err == nil {
		merged, err = batch.expand(annotated)
	}
	if err != nil {
		if s.req.Options.Music != nil && s.req.Options.Music.Sync && s.req.Options.Music.Volume > 0 {
			return fmt.Errorf("Music-guided source analysis could not finish: %w", err)
		}
		// Local transcripts remain available when optional semantic enrichment
		// is unavailable. The independent actual-output review still gates Ready.
		for i := range s.req.Assets {
			s.req.Assets[i].Warnings = appendUnique(s.req.Assets[i].Warnings, "Source semantic analysis was unavailable: "+err.Error())
			for j := range s.req.Assets[i].Candidates {
				s.req.Assets[i].Candidates[j].Moment = nil
			}
		}
		return nil
	}
	s.req.Assets = merged
	return nil
}

func pinStoryActionEvidence(req *Request) func() {
	type boundAction struct {
		candidate Candidate
		source    Asset
	}
	bound := map[string]boundAction{}
	if req.Base != nil {
		all := indexCandidates(req.Assets)
		sources := map[string]Asset{}
		for _, asset := range req.Assets {
			sources[asset.ID] = asset
		}
		for _, block := range req.Base.Plan.Blocks {
			candidate, found := all[block.CandidateID]
			window := block.MusicWindow
			if !found || !validVisualMoment(candidate) || window == nil || window.SourceID != candidate.SourceID ||
				!finite(window.In) || !finite(window.Out) || window.In < candidate.In || window.Out > candidate.Out ||
				window.In > candidate.Moment.In || window.Out < candidate.Moment.Out {
				continue
			}
			candidate.Moment = cloneVisualMoment(candidate.Moment)
			candidate.Words = slices.Clone(candidate.Words)
			bound[candidate.ID] = boundAction{candidate, sources[candidate.SourceID]}
		}
	}
	return func() {
		for ai := range req.Assets {
			asset := &req.Assets[ai]
			for ci := range asset.Candidates {
				candidate := &asset.Candidates[ci]
				previous, exists := bound[candidate.ID]
				old := previous.candidate
				if !exists || asset.Hash != previous.source.Hash || asset.Duration != previous.source.Duration || asset.Mapping != previous.source.Mapping || asset.HasAudio != previous.source.HasAudio ||
					candidate.SourceID != old.SourceID || candidate.In != old.In || candidate.Out != old.Out || candidate.Text != old.Text || candidate.Speaker != old.Speaker || candidate.Language != old.Language || !slices.Equal(candidate.Words, old.Words) {
					continue
				}
				candidate.Moment = cloneVisualMoment(old.Moment)
			}
		}
	}
}

func cloneAssets(assets []Asset) []Asset {
	cloned := slices.Clone(assets)
	for i := range cloned {
		cloned[i].Warnings = slices.Clone(assets[i].Warnings)
		cloned[i].VoiceIntervals = slices.Clone(assets[i].VoiceIntervals)
		cloned[i].Candidates = slices.Clone(assets[i].Candidates)
		cloned[i].TranscriptProposals = slices.Clone(assets[i].TranscriptProposals)
		for j := range cloned[i].TranscriptProposals {
			cloned[i].TranscriptProposals[j].Words = slices.Clone(assets[i].TranscriptProposals[j].Words)
		}
		cloned[i].TranscriptReviews = slices.Clone(assets[i].TranscriptReviews)
		for j := range cloned[i].TranscriptReviews {
			cloned[i].TranscriptReviews[j].Words = slices.Clone(assets[i].TranscriptReviews[j].Words)
			if evidence := assets[i].TranscriptReviews[j].TimingEvidence; evidence != nil {
				copied := *evidence
				copied.Words = slices.Clone(evidence.Words)
				cloned[i].TranscriptReviews[j].TimingEvidence = &copied
			}
		}
		for j := range cloned[i].Candidates {
			cloned[i].Candidates[j].Words = slices.Clone(assets[i].Candidates[j].Words)
			cloned[i].Candidates[j].Dependencies = slices.Clone(assets[i].Candidates[j].Dependencies)
			cloned[i].Candidates[j].Moment = cloneVisualMoment(assets[i].Candidates[j].Moment)
		}
	}
	return cloned
}

func cloneVisualMoment(moment *VisualMoment) *VisualMoment {
	if moment == nil {
		return nil
	}
	copy := *moment
	if moment.Peak != nil {
		peak := *moment.Peak
		copy.Peak = &peak
	}
	return &copy
}

// Merge descriptive metadata and optional protected action evidence. The model
// cannot replace source intervals, captions, identities, speech or media paths.
func mergeSourceMeaning(original, annotated []Asset) ([]Asset, error) {
	if len(original) != len(annotated) {
		return nil, fmt.Errorf("semantic analysis changed the source set")
	}
	bySource := make(map[string]Asset, len(annotated))
	for _, a := range annotated {
		if _, exists := bySource[a.ID]; exists {
			return nil, fmt.Errorf("semantic analysis duplicated source %s", a.ID)
		}
		bySource[a.ID] = a
	}
	result := cloneAssets(original)
	all := indexCandidates(original)
	for i, a := range original {
		updated, found := bySource[a.ID]
		if !found || len(a.Candidates) != len(updated.Candidates) {
			return nil, fmt.Errorf("semantic analysis changed candidate coverage for source %s", a.ID)
		}
		immutable := updated
		immutable.Candidates, immutable.Warnings, immutable.SemanticAnalysisVersion = a.Candidates, a.Warnings, a.SemanticAnalysisVersion
		if !reflect.DeepEqual(a, immutable) {
			return nil, fmt.Errorf("semantic analysis changed immutable source provenance for %s", a.ID)
		}
		candidates := make(map[string]Candidate, len(updated.Candidates))
		for _, c := range updated.Candidates {
			if _, exists := candidates[c.ID]; exists {
				return nil, fmt.Errorf("semantic analysis duplicated candidate %s", c.ID)
			}
			candidates[c.ID] = c
		}
		for j, c := range a.Candidates {
			next, found := candidates[c.ID]
			immutable := next
			immutable.Role, immutable.Idea, immutable.Reason, immutable.Dependencies = c.Role, c.Idea, c.Reason, c.Dependencies
			immutable.Moment = c.Moment
			if !found || !reflect.DeepEqual(c, immutable) {
				return nil, fmt.Errorf("semantic analysis changed immutable transcript or provenance for candidate %s", c.ID)
			}
			if !validRole(next.Role) || utf8.RuneCountInString(next.Idea) > 4000 || utf8.RuneCountInString(next.Reason) > 4000 {
				return nil, fmt.Errorf("semantic analysis returned invalid descriptive metadata for %s", c.ID)
			}
			if next.Moment != nil && (!validVisualMoment(next) || next.Moment.Confidence < .85 || len(next.Moment.Evidence) < 24 || len(next.Moment.Evidence) > 1200) {
				return nil, fmt.Errorf("semantic analysis returned invalid action evidence for %s", c.ID)
			}
			dependencies := append([]string(nil), c.Dependencies...)
			seen := make(map[string]bool)
			for _, id := range next.Dependencies {
				if _, exists := all[id]; !exists || id == c.ID || seen[id] {
					return nil, fmt.Errorf("semantic analysis returned invalid source context for %s", c.ID)
				}
				seen[id] = true
				dependencies = appendUnique(dependencies, id)
			}
			result[i].Candidates[j].Role = next.Role
			if a.Role != "" && a.Role != "auto" {
				result[i].Candidates[j].Role = a.Role
			}
			result[i].Candidates[j].Idea, result[i].Candidates[j].Reason, result[i].Candidates[j].Dependencies = next.Idea, next.Reason, dependencies
			result[i].Candidates[j].Moment = cloneVisualMoment(next.Moment)
		}
		if updated.SemanticAnalysisVersion != "" && updated.SemanticAnalysisVersion != a.SemanticAnalysisVersion {
			result[i].Warnings = WithoutSourceMeaningWarnings(result[i].Warnings)
		}
		for _, warning := range updated.Warnings {
			result[i].Warnings = appendUnique(result[i].Warnings, warning)
		}
		result[i].SemanticAnalysisVersion = updated.SemanticAnalysisVersion
	}
	// Cyclic context can never be satisfied by a linear story. Reject the
	// enrichment instead of destroying usable local source analysis.
	merged := indexCandidates(result)
	visited, active := make(map[string]bool), make(map[string]bool)
	var visit func(string) bool
	visit = func(id string) bool {
		if active[id] {
			return false
		}
		if visited[id] {
			return true
		}
		active[id] = true
		for _, dependency := range merged[id].Dependencies {
			if !visit(dependency) {
				return false
			}
		}
		active[id], visited[id] = false, true
		return true
	}
	for id := range merged {
		if !visit(id) {
			return nil, fmt.Errorf("semantic analysis introduced cyclic source context")
		}
	}
	return result, nil
}
