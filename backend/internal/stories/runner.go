package stories

import (
	"context"
	"errors"
	"fmt"
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

var ErrStoryNotPending = errors.New("requested Story is not eligible: it must be pending, unclaimed, and not cancelled or being deleted")

// RunStory processes exactly one selected Story, without global recovery or any
// ordinary job claims. Unlike the polling loop, its caller receives run errors.
func (r *Runner) RunStory(ctx context.Context, id string) error {
	e, err := r.Repo.ClaimStory(ctx, id)
	if err != nil {
		return err
	}
	if e == nil {
		return fmt.Errorf("Story %s: %w", id, ErrStoryNotPending)
	}
	runErr, finishErr := r.execute(ctx, e)
	if err := errors.Join(runErr, finishErr); err != nil {
		return fmt.Errorf("Story %s: %w", e.ID, err)
	}
	return nil
}

func (r *Runner) Once(ctx context.Context) (bool, error) {
	if err := r.Repo.Recover(ctx); err != nil {
		return false, err
	}
	e, err := r.Repo.Claim(ctx)
	if err != nil || e == nil {
		return false, err
	}
	_, finishErr := r.execute(ctx, e)
	if finishErr != nil && !errors.Is(finishErr, ErrOwnership) {
		return true, finishErr
	}
	return true, nil
}

func (r *Runner) execute(ctx context.Context, e *execution) (runErr, finishErr error) {
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
	commit := func(ctx context.Context, owner, artifact string) error {
		committer, ok := r.Builder.(interface {
			CommitStudio(context.Context, string, string) error
		})
		if !ok {
			return errors.New("Studio project publication is unavailable")
		}
		return committer.CommitStudio(ctx, owner, artifact)
	}
	finishErr = e.finish(finalCtx, result, runErr, commit)
	if runErr != nil && r.Logger != nil {
		r.Logger.Warn("Story execution did not complete", "story_id", e.ID)
	}
	return runErr, finishErr
}
