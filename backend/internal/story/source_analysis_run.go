package story

import (
	"context"
	"fmt"
	"sync"
)

// analyzeSources runs the media adapter once per distinct original and saves
// each result as soon as it is ready, so the owner sees sources complete one by
// one. Up to limits.AnalysisWorkers distinct originals are analyzed at once;
// exact duplicate uploads then reuse a fresh result in the stable source order.
func (s *runState) analyzeSources(ctx context.Context) error {
	pinned := acceptedSourceReferences(s.req)
	order := sourceAnalysisOrder(s.req.Assets)
	leaders, followers := duplicateLeaders(s.req.Assets, order)
	// Duplicate identity belongs to the uploaded originals, not to results
	// that may gain review proposals during analysis.
	keys := make([]duplicateSourceKey, len(s.req.Assets))
	eligible := make([]bool, len(s.req.Assets))
	for i, asset := range s.req.Assets {
		keys[i], eligible[i] = duplicateKey(asset)
	}
	fresh := make([]*Asset, len(s.req.Assets))
	var saving sync.Mutex
	finish := func(i int, analyzed Asset, isFresh bool) error {
		original := s.req.Assets[i]
		protectSourceIdentity(&analyzed, original)
		if isFresh {
			// Keep the adapter result before any accepted catalog is pinned.
			// Another upload must not inherit an obsolete model snapshot.
			copied := cloneAssets([]Asset{analyzed})[0]
			fresh[i] = &copied
		}
		analyzed = s.pinAcceptedCatalog(original, analyzed, pinned[original.ID])
		saving.Lock()
		defer saving.Unlock()
		s.req.Assets[i] = analyzed
		return s.checkpoints.SaveAsset(ctx, analyzed)
	}
	analyze := func(ctx context.Context, i int) error {
		original := s.req.Assets[i]
		analyzed, err := s.builder.media.Analyze(ctx, s.req.ID, cloneAssets([]Asset{original})[0], s.req.Options)
		if err != nil {
			return fmt.Errorf("analyze source %s: %w", original.ID, err)
		}
		return finish(i, analyzed, eligible[i])
	}
	// An exact duplicate reuses the earliest fresh result of the same original
	// that accepts it; otherwise it is analyzed on its own.
	duplicate := func(ctx context.Context, i int) error {
		original := s.req.Assets[i]
		for _, j := range order {
			if fresh[j] == nil || !eligible[j] || keys[j] != keys[i] {
				continue
			}
			if analyzed, reused := reuseDuplicateAnalysis(*fresh[j], original); reused {
				return finish(i, analyzed, false)
			}
		}
		return analyze(ctx, i)
	}
	if s.builder.limits.AnalysisWorkers <= 1 {
		follower := make(map[int]bool, len(followers))
		for _, i := range followers {
			follower[i] = true
		}
		for _, i := range order {
			if err := ctx.Err(); err != nil {
				return err
			}
			step := analyze
			if follower[i] {
				step = duplicate
			}
			if err := step(ctx, i); err != nil {
				return err
			}
		}
		return nil
	}
	if err := runBounded(ctx, leaders, s.builder.limits.AnalysisWorkers, analyze); err != nil {
		return err
	}
	for _, i := range followers {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := duplicate(ctx, i); err != nil {
			return err
		}
	}
	return nil
}

// duplicateLeaders splits the stable order into the first upload of every
// distinct original (analyzed by the adapter) and later exact duplicates.
func duplicateLeaders(assets []Asset, order []int) (leaders, followers []int) {
	seen := make(map[duplicateSourceKey]bool)
	for _, i := range order {
		key, eligible := duplicateKey(assets[i])
		if eligible && seen[key] {
			followers = append(followers, i)
			continue
		}
		if eligible {
			seen[key] = true
		}
		leaders = append(leaders, i)
	}
	return leaders, followers
}

// A processing adapter may add proxies and evidence, but cannot replace the
// owner-approved original file or its user inclusion settings.
func protectSourceIdentity(analyzed *Asset, original Asset) {
	analyzed.ID, analyzed.Key, analyzed.Hash, analyzed.Size = original.ID, original.Key, original.Hash, original.Size
	analyzed.Order, analyzed.Role, analyzed.Include = original.Order, original.Role, original.Include
	analyzed.Kind = original.Kind
}

func (s *runState) pinAcceptedCatalog(original, analyzed Asset, pinned bool) Asset {
	if !pinned {
		return analyzed
	}
	if sourceCatalogChanged(original, analyzed) && !(s.req.Action == "improve_flow" && safeVisualCatalogUpgrade(original, analyzed)) {
		// Candidate IDs are not immutable across model/segmentation upgrades.
		// Keep the complete saved catalog so the accepted version's blocks,
		// captions, alternate choices and identity references retain meaning.
		proposals, voiceIntervals := analyzed.TranscriptProposals, analyzed.VoiceIntervals
		analyzed = original
		// Suggestions are not executable captions, so a pinned legacy catalog
		// can expose new evidence without rewriting its accepted source cuts.
		analyzed.TranscriptProposals = proposals
		analyzed.VoiceIntervals = append([]Interval(nil), voiceIntervals...)
		analyzed.Warnings = appendUnique(analyzed.Warnings, pinnedSourceWarning)
		return analyzed
	}
	// Local cache files may precede semantic context enrichment. Preserve
	// known requirements even when refreshed immutable evidence is equal.
	previous := indexCandidates([]Asset{original})
	for j := range analyzed.Candidates {
		for _, dependency := range previous[analyzed.Candidates[j].ID].Dependencies {
			analyzed.Candidates[j].Dependencies = appendUnique(analyzed.Candidates[j].Dependencies, dependency)
		}
	}
	return analyzed
}

// runBounded calls work for every index with at most `workers` calls in
// flight, in the given order. The first failure cancels the remaining calls
// and is returned; one worker keeps strictly sequential behavior.
func runBounded(parent context.Context, indexes []int, workers int, work func(context.Context, int) error) error {
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	workers = max(1, min(workers, len(indexes)))
	jobs := make(chan int)
	var (
		wait  sync.WaitGroup
		once  sync.Once
		first error
	)
	for range workers {
		wait.Add(1)
		go func() {
			defer wait.Done()
			for i := range jobs {
				if err := work(ctx, i); err != nil {
					once.Do(func() { first = err; cancel() })
				}
			}
		}()
	}
feed:
	for _, i := range indexes {
		select {
		case jobs <- i:
		case <-ctx.Done():
			break feed
		}
	}
	close(jobs)
	wait.Wait()
	if first != nil {
		return first
	}
	return parent.Err()
}
