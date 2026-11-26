package stories

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log/slog"
	"sync"
	"time"

	"sneepcut/backend-go/internal/story"
)

// SourceAnalyzer is the part of the story media adapter the prewarmer uses.
// Its results are immutable, content-addressed artifacts, so analyzing an
// upload early only fills the cache the real run reads.
type SourceAnalyzer interface {
	Analyze(context.Context, string, story.Asset, story.Options) (story.Asset, error)
}

// PrefixDeleter removes artifacts the prewarmer wrote for a project that was
// deleted while it was analyzing.
type PrefixDeleter interface {
	DeletePrefix(context.Context, string) (int, error)
}

// Prewarmer analyzes the uploaded sources of draft projects while their owner
// is still choosing options. When the owner starts the run, Runner yields the
// project first, so a run never shares a source with an unfinished prewarm.
type Prewarmer struct {
	Repo     *Repository
	Analyzer SourceAnalyzer
	Storage  PrefixDeleter
	Logger   *slog.Logger
	// Interval between scans when there is nothing to prewarm.
	Interval time.Duration

	mu       sync.Mutex
	running  *prewarmRun
	finished map[string]time.Time
}

type prewarmRun struct {
	project string
	cancel  context.CancelFunc
	done    chan struct{}
}

type prewarmSource struct {
	project string
	options story.Options
	asset   story.Asset
}

// prewarmRetention bounds the in-memory record of finished sources. A later
// repeat only re-reads the cached analysis.
const prewarmRetention = 24 * time.Hour

// Run scans for unanalyzed draft sources until ctx ends, one source at a time.
func (p *Prewarmer) Run(ctx context.Context) {
	interval := p.Interval
	if interval <= 0 {
		interval = 3 * time.Second
	}
	for ctx.Err() == nil {
		worked, err := p.Once(ctx)
		if err != nil && ctx.Err() == nil {
			p.Logger.Warn("Story source prewarm", "error", err)
		}
		if worked {
			continue
		}
		select {
		case <-ctx.Done():
		case <-time.After(interval):
		}
	}
}

// Once prewarms the next pending draft source, if any.
func (p *Prewarmer) Once(ctx context.Context) (bool, error) {
	sources, err := p.Repo.prewarmCandidates(ctx)
	if err != nil {
		return false, err
	}
	for _, source := range sources {
		key := prewarmKey(source)
		if p.isFinished(key) {
			continue
		}
		return true, p.prewarm(ctx, source, key)
	}
	return false, nil
}

// Yield cancels any prewarm of project and waits until it has stopped.
func (p *Prewarmer) Yield(project string) {
	p.mu.Lock()
	run := p.running
	p.mu.Unlock()
	if run == nil || run.project != project {
		return
	}
	run.cancel()
	<-run.done
}

func (p *Prewarmer) prewarm(parent context.Context, source prewarmSource, key string) error {
	ctx, cancel := context.WithCancel(parent)
	run := &prewarmRun{project: source.project, cancel: cancel, done: make(chan struct{})}
	p.mu.Lock()
	p.running = run
	p.mu.Unlock()
	defer func() {
		cancel()
		p.mu.Lock()
		p.running = nil
		p.mu.Unlock()
		close(run.done)
	}()
	// Checked after publishing the run, so a claim either sees it in Yield or
	// has already taken the project out of draft here.
	if draft, err := p.Repo.isDraft(ctx, source.project); err != nil || !draft {
		return err
	}
	// A run claim or deletion takes the project out of draft. Stop promptly so
	// neither ever overlaps this source's artifact writes.
	go p.watchDraft(ctx, cancel, source.project)
	_, err := p.Analyzer.Analyze(ctx, source.project, source.asset, source.options)
	if err == nil {
		p.markFinished(key)
		p.Logger.Info("Story source prewarmed", "story_id", source.project, "source_id", source.asset.ID)
	}
	p.cleanupIfRemoved(parent, source)
	if err != nil && ctx.Err() != nil {
		// Yielded to the run, left draft or shutting down: not a failure.
		return nil
	}
	if err != nil {
		// The real run reports source problems to the owner; do not retry here.
		p.markFinished(key)
		return err
	}
	return nil
}

func (p *Prewarmer) watchDraft(ctx context.Context, cancel context.CancelFunc, project string) {
	tick := time.NewTicker(2 * time.Second)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			draft, err := p.Repo.isDraft(ctx, project)
			if err == nil && !draft {
				cancel()
				return
			}
		}
	}
}

// cleanupIfRemoved deletes this source's analysis artifacts when the project
// was deleted while they were being written.
func (p *Prewarmer) cleanupIfRemoved(ctx context.Context, source prewarmSource) {
	if p.Storage == nil {
		return
	}
	status, err := p.Repo.projectStatus(ctx, source.project)
	if err == nil && status != "deleting" || err != nil && !errors.Is(err, errProjectGone) {
		return
	}
	for _, prefix := range []string{"work/" + source.project + "/analysis/" + source.asset.ID + "/", "work/" + source.project + "/source-media/" + source.asset.ID + "/"} {
		if _, err := p.Storage.DeletePrefix(ctx, prefix); err != nil {
			p.Logger.Warn("Story prewarm cleanup", "story_id", source.project, "error", err)
		}
	}
}

func (p *Prewarmer) isFinished(key string) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	_, ok := p.finished[key]
	return ok
}

func (p *Prewarmer) markFinished(key string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.finished == nil {
		p.finished = make(map[string]time.Time)
	}
	now := time.Now()
	for old, at := range p.finished {
		if now.Sub(at) > prewarmRetention {
			delete(p.finished, old)
		}
	}
	p.finished[key] = now
}

// prewarmKey identifies one source under the analysis inputs the owner can
// still change; a different language or soundtrack choice prewarms again.
func prewarmKey(source prewarmSource) string {
	settings, _ := json.Marshal([]any{source.options.Language, source.options.Narration, story.UsesMusicOnlyAudio(source.options)})
	return source.project + "/" + source.asset.ID + "/" + source.asset.Hash + "/" + string(settings)
}

var errProjectGone = errors.New("story project no longer exists")

// prewarmCandidates lists the video sources of recently edited drafts, newest
// project first, excluding accounts that are being deleted.
func (r *Repository) prewarmCandidates(ctx context.Context) ([]prewarmSource, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT p.id,p.options,a.asset FROM story_projects p JOIN story_assets a ON a.project_id=p.id
		WHERE p.status='draft' AND p.lease_token IS NULL AND p.updated_at>now()-interval '12 hours'
		AND coalesce(a.asset->>'kind','') IN ('','video')
		AND NOT EXISTS(SELECT 1 FROM account_deletion_requests d WHERE d.user_id=p.user_id)
		ORDER BY p.updated_at DESC,(a.asset->>'order')::int,a.id LIMIT 200`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var sources []prewarmSource
	for rows.Next() {
		var source prewarmSource
		var options, asset []byte
		if err = rows.Scan(&source.project, &options, &asset); err != nil {
			return nil, err
		}
		if json.Unmarshal(options, &source.options) != nil || json.Unmarshal(asset, &source.asset) != nil {
			continue
		}
		// Match the run's analysis inputs; a draft may still be incomplete.
		if normalized, err := story.NormalizeOptions(source.options); err == nil {
			source.options = normalized
		}
		sources = append(sources, source)
	}
	return sources, rows.Err()
}

func (r *Repository) isDraft(ctx context.Context, project string) (bool, error) {
	status, err := r.projectStatus(ctx, project)
	if errors.Is(err, errProjectGone) {
		return false, nil
	}
	return status == "draft", err
}

func (r *Repository) projectStatus(ctx context.Context, project string) (string, error) {
	var status string
	err := r.db.QueryRowContext(ctx, `SELECT status FROM story_projects WHERE id=$1`, project).Scan(&status)
	if errors.Is(err, sql.ErrNoRows) {
		return "", errProjectGone
	}
	return status, err
}
