package story

import (
	"context"
	"sneepcut/backend-go/internal/audiocleanup"
)

type AudioPreparer interface {
	PrepareStoryAudio(context.Context, string, Asset) (Asset, error)
}

func (s *runState) prepareAudio(ctx context.Context) error {
	if !audiocleanup.Enabled(s.req.Options.AudioCleanup) {
		return nil
	}
	preparer, ok := s.builder.media.(AudioPreparer)
	if !ok {
		return &audiocleanup.Failure{Message: "Background noise reduction is unavailable. Turn it off to use original audio."}
	}
	if err := s.checkpoints.Progress(ctx, "editing", "Reducing background noise; original audio is retained"); err != nil {
		return err
	}
	s.req.Assets = cloneAssets(s.req.Assets)
	for i, asset := range s.req.Assets {
		if err := ctx.Err(); err != nil {
			return err
		}
		updated, err := preparer.PrepareStoryAudio(ctx, s.req.ID, asset)
		// Never permit an adapter to swap the owner-approved source.
		updated.ID, updated.Key, updated.Hash = asset.ID, asset.Key, asset.Hash
		s.req.Assets[i] = updated
		if saveErr := s.checkpoints.SaveAsset(ctx, updated); saveErr != nil {
			return saveErr
		}
		if err != nil {
			return err
		}
	}
	return nil
}
