package stories

import (
	"context"
	"errors"
	"log/slog"
	"sneepcut/backend-go/internal/story"
	"time"
)

type Builder interface {
	Run(context.Context, story.Request, story.Checkpoints) (story.Result, error)
}
type Runner struct {
	Repo    *Repository
	Builder Builder
	Logger  *slog.Logger
}

func (r *Runner) Once(ctx context.Context) (bool, error) {
	if err := r.Repo.Recover(ctx); err != nil {
		return false, err
	}
	e, err := r.Repo.Claim(ctx)
	if err != nil || e == nil {
		return false, err
	}
	work, cancel := context.WithTimeout(ctx, r.Repo.limits.Timeout)
	defer cancel()
	work = story.WithAIBudget(work, e.reserveAI)
	done := make(chan struct{})
	defer close(done)
	go func() {
		tick := time.NewTicker(20 * time.Second)
		defer tick.Stop()
		for {
			select {
			case <-done:
				return
			case <-work.Done():
				return
			case <-tick.C:
				if e.Progress(work, "", "") != nil {
					cancel()
					return
				}
			}
		}
	}()
	result, runErr := r.Builder.Run(work, e.Input, e)
	finalCtx, stop := context.WithTimeout(context.WithoutCancel(ctx), 30*time.Second)
	defer stop()
	if err = e.finish(finalCtx, result, runErr); err != nil && !errors.Is(err, ErrOwnership) {
		return true, err
	}
	if runErr != nil && r.Logger != nil {
		r.Logger.Warn("Story execution did not complete", "story_id", e.ID)
	}
	return true, nil
}
