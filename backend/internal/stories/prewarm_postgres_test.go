package stories

import (
	"context"
	"io"
	"log/slog"
	"slices"
	"sync"
	"testing"
	"time"

	"sneepcut/backend-go/internal/story"
)

type prewarmAnalyzer struct {
	mu      sync.Mutex
	calls   []string
	block   bool
	started chan struct{}
}

func (a *prewarmAnalyzer) Analyze(ctx context.Context, project string, asset story.Asset, _ story.Options) (story.Asset, error) {
	a.mu.Lock()
	a.calls = append(a.calls, project+"/"+asset.ID)
	a.mu.Unlock()
	if a.block {
		close(a.started)
		<-ctx.Done()
		return asset, ctx.Err()
	}
	return asset, nil
}

func testPrewarmer(r *Repository, analyzer SourceAnalyzer) *Prewarmer {
	return &Prewarmer{Repo: r, Analyzer: analyzer, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
}

func TestPrewarmAnalyzesEachDraftSourceOnce(t *testing.T) {
	r, _, id, ids := fixture(t, 2)
	analyzer := &prewarmAnalyzer{}
	p := testPrewarmer(r, analyzer)
	ctx := context.Background()
	for range 2 {
		if worked, err := p.Once(ctx); err != nil || !worked {
			t.Fatalf("draft source was not prewarmed: %v %v", worked, err)
		}
	}
	if worked, err := p.Once(ctx); err != nil || worked {
		t.Fatalf("a finished source was analyzed again: %v %v", worked, err)
	}
	want := []string{id + "/" + ids[0], id + "/" + ids[1]}
	got := slices.Clone(analyzer.calls)
	slices.Sort(got)
	slices.Sort(want)
	if !slices.Equal(got, want) {
		t.Fatalf("prewarmed %v, want %v", got, want)
	}
}

func TestPrewarmSkipsProjectsThatLeftDraft(t *testing.T) {
	r, user, id, ids := fixture(t, 1)
	if err := r.Queue(context.Background(), user, id, Generate{RequestID: newID(), AssetIDs: ids}); err != nil {
		t.Fatal(err)
	}
	analyzer := &prewarmAnalyzer{}
	if worked, err := testPrewarmer(r, analyzer).Once(context.Background()); err != nil || worked || len(analyzer.calls) != 0 {
		t.Fatalf("queued project was prewarmed: %v %v %v", worked, err, analyzer.calls)
	}
}

func TestRunnerYieldStopsThePrewarmOfItsProject(t *testing.T) {
	r, _, id, _ := fixture(t, 1)
	analyzer := &prewarmAnalyzer{block: true, started: make(chan struct{})}
	p := testPrewarmer(r, analyzer)
	result := make(chan error, 1)
	go func() {
		_, err := p.Once(context.Background())
		result <- err
	}()
	select {
	case <-analyzer.started:
	case <-time.After(10 * time.Second):
		t.Fatal("prewarm did not start")
	}
	p.Yield(newID()) // another project's run must not interrupt it
	select {
	case err := <-result:
		t.Fatalf("prewarm stopped for another project: %v", err)
	default:
	}
	p.Yield(id)
	p.mu.Lock()
	running := p.running
	p.mu.Unlock()
	if running != nil {
		t.Fatal("Yield returned before the prewarm stopped")
	}
	select {
	case err := <-result:
		if err != nil {
			t.Fatalf("yield was reported as a failure: %v", err)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("prewarm did not finish after yielding")
	}
}
