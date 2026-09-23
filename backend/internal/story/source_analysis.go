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
	annotated, err := analyzer.AnalyzeStorySources(budgetContext, cloneAssets(s.req.Assets), s.req.Options)
	if ctx.Err() != nil {
		return ctx.Err()
	}
	var merged []Asset
	if err == nil {
		merged, err = mergeSourceMeaning(s.req.Assets, annotated)
	}
	if err != nil {
		// Local transcripts remain available when optional semantic enrichment
		// is unavailable. The independent actual-output review still gates Ready.
		for i := range s.req.Assets {
			s.req.Assets[i].Warnings = appendUnique(s.req.Assets[i].Warnings, "Source semantic analysis was unavailable: "+err.Error())
		}
		return nil
	}
	s.req.Assets = merged
	return nil
}

func cloneAssets(assets []Asset) []Asset {
	cloned := slices.Clone(assets)
	for i := range cloned {
		cloned[i].Warnings = slices.Clone(assets[i].Warnings)
		cloned[i].Candidates = slices.Clone(assets[i].Candidates)
		for j := range cloned[i].Candidates {
			cloned[i].Candidates[j].Words = slices.Clone(assets[i].Candidates[j].Words)
			cloned[i].Candidates[j].Dependencies = slices.Clone(assets[i].Candidates[j].Dependencies)
		}
	}
	return cloned
}

// Merge only descriptive metadata. The semantic model cannot supply executable
// intervals, captions, identities, speech, owner settings, or media paths.
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
			if !found || !reflect.DeepEqual(c, immutable) {
				return nil, fmt.Errorf("semantic analysis changed immutable transcript or provenance for candidate %s", c.ID)
			}
			if !validRole(next.Role) || utf8.RuneCountInString(next.Idea) > 4000 || utf8.RuneCountInString(next.Reason) > 4000 {
				return nil, fmt.Errorf("semantic analysis returned invalid descriptive metadata for %s", c.ID)
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
