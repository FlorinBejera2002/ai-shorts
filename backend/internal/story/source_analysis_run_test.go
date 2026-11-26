package story

import (
	"context"
	"errors"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"
)

// parallelAnalysisMedia holds each analysis until two are in flight, proving
// that distinct sources overlap instead of running one after another.
type parallelAnalysisMedia struct {
	fakeMedia
	mu       sync.Mutex
	inFlight int
	peak     int
	calls    []string
	both     chan struct{}
	once     sync.Once
	fail     string
}

func (m *parallelAnalysisMedia) Analyze(ctx context.Context, _ string, asset Asset, _ Options) (Asset, error) {
	m.mu.Lock()
	m.inFlight++
	m.peak = max(m.peak, m.inFlight)
	m.calls = append(m.calls, asset.ID)
	if m.inFlight == 2 {
		m.once.Do(func() { close(m.both) })
	}
	m.mu.Unlock()
	defer func() {
		m.mu.Lock()
		m.inFlight--
		m.mu.Unlock()
	}()
	select {
	case <-m.both:
	case <-time.After(5 * time.Second):
	case <-ctx.Done():
		return asset, ctx.Err()
	}
	if asset.ID == m.fail {
		return asset, errors.New("decoder failed")
	}
	asset.Candidates = duplicateRecording(asset.ID).Candidates
	asset.AnalysisVersion, asset.SemanticAnalysisVersion = "analysis-parallel", ""
	asset.Mapping = TimeMap{Rate: 1, Duration: asset.Duration, Method: "original"}
	asset.ProxyKey, asset.ThumbnailKey = "proxy/"+asset.ID, "thumbnail/"+asset.ID
	return asset, nil
}

func parallelState(media Media, assets ...Asset) (runState, *memoryCheckpoints) {
	req := fixtureRequest()
	req.Assets = assets
	limits := DefaultLimits()
	limits.AnalysisWorkers = 2
	checkpoints := &memoryCheckpoints{}
	return runState{builder: New(media, nil, limits), req: req, checkpoints: checkpoints, budget: &runBudget{max: 12}}, checkpoints
}

func TestDistinctSourcesAreAnalyzedTogetherAndDuplicatesStillReuseWork(t *testing.T) {
	a, b, c := duplicateRecording("source-a"), duplicateRecording("source-b"), duplicateRecording("source-c")
	c.Hash = strings.Repeat("b", 64)
	media := &parallelAnalysisMedia{both: make(chan struct{})}
	state, checkpoints := parallelState(media, b, c, a)
	if err := state.analyze(context.Background()); err != nil {
		t.Fatal(err)
	}
	if media.peak != 2 {
		t.Fatalf("distinct sources were not analyzed concurrently: peak %d", media.peak)
	}
	calls := slices.Clone(media.calls)
	slices.Sort(calls)
	if !slices.Equal(calls, []string{"source-a", "source-c"}) {
		t.Fatalf("duplicate upload was analyzed again: %v", media.calls)
	}
	gotB, gotC, gotA := state.req.Assets[0], state.req.Assets[1], state.req.Assets[2]
	if gotB.ID != "source-b" || gotC.ID != "source-c" || gotA.ID != "source-a" {
		t.Fatal("parallel analysis reordered the owner's sources")
	}
	if gotB.ProxyKey != gotA.ProxyKey || gotB.Candidates[0].SourceID != "source-b" || gotC.ProxyKey != "proxy/source-c" {
		t.Fatalf("duplicate reuse lost its own provenance: %+v", gotB.Candidates[0])
	}
	saved := map[string]bool{}
	for _, asset := range checkpoints.assets {
		saved[asset.ID] = saved[asset.ID] || asset.AnalysisVersion != ""
	}
	if len(saved) != 3 || !saved["source-a"] || !saved["source-b"] || !saved["source-c"] {
		t.Fatalf("every analyzed source must be checkpointed for progress: %v", saved)
	}
}

func TestParallelSourceFailureStopsTheRunWithThatSource(t *testing.T) {
	a, c := duplicateRecording("source-a"), duplicateRecording("source-c")
	c.Hash = strings.Repeat("b", 64)
	media := &parallelAnalysisMedia{both: make(chan struct{}), fail: "source-c"}
	state, _ := parallelState(media, a, c)
	err := state.analyze(context.Background())
	if err == nil || !strings.Contains(err.Error(), "analyze source source-c") {
		t.Fatalf("failed source was not reported: %v", err)
	}
}

func TestRunBoundedKeepsOneWorkerSequential(t *testing.T) {
	var order []int
	err := runBounded(context.Background(), []int{3, 1, 2}, 1, func(_ context.Context, i int) error {
		order = append(order, i)
		return nil
	})
	if err != nil || !slices.Equal(order, []int{3, 1, 2}) {
		t.Fatalf("one worker changed the order: %v %v", order, err)
	}
}

func TestAnalysisWorkersAreBoundedByLimits(t *testing.T) {
	limits := DefaultLimits()
	limits.AnalysisWorkers = 40
	if got := NormalizeLimits(limits).AnalysisWorkers; got != 8 {
		t.Fatalf("analysis workers not capped: %d", got)
	}
	limits.AnalysisWorkers = 0
	if got := NormalizeLimits(limits).AnalysisWorkers; got != 1 {
		t.Fatalf("analysis workers default: %d", got)
	}
	env, err := LimitsFromEnv(func(string) string { return "" })
	if err != nil || env.AnalysisWorkers != 2 {
		t.Fatalf("worker default: %d %v", env.AnalysisWorkers, err)
	}
	if _, err = LimitsFromEnv(func(name string) string {
		if name == "STORY_ANALYSIS_WORKERS" {
			return "9"
		}
		return ""
	}); err == nil {
		t.Fatal("out-of-range STORY_ANALYSIS_WORKERS accepted")
	}
}
