package worker

import (
	"context"
	"errors"
	"sneepcut/backend-go/internal/processing"
	"time"
)

type studioCommitter interface {
	CommitStudio(context.Context, string, string) error
}

func (w *Worker) commitStudioClips(ctx context.Context, owner string, clips []processing.Clip) error {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	for _, clip := range clips {
		if clip.StudioArtifactID == "" {
			continue
		}
		committer, ok := w.Pipeline.(studioCommitter)
		if !ok {
			return errors.New("Studio project publication is unavailable")
		}
		// Clean social exports share the primary document and never replace it.
		if err := committer.CommitStudio(ctx, owner, clip.StudioArtifactID); err != nil {
			return err
		}
	}
	return nil
}
