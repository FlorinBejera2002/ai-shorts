package media

import (
	"context"
	"time"

	"sneepcut/backend-go/internal/studiocomposition"
)

// Studio retains editable originals independently of the exported media store.
// Cleanup must succeed before callers finalize destructive database mutations.
func (s *Service) studioCleanup(ctx context.Context, remove func(context.Context, *studiocomposition.Client) error) error {
	client, err := studiocomposition.New(s.cfg.StudioURL, s.cfg.StudioSecret)
	if err != nil || client == nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, time.Minute)
	defer cancel()
	return remove(ctx, client)
}

func (s *Service) DeleteStudioJob(ctx context.Context, owner, jobID string) error {
	return s.studioCleanup(ctx, func(ctx context.Context, client *studiocomposition.Client) error {
		return client.DeleteScope(ctx, owner, studiocomposition.Scope(owner, jobID))
	})
}

func (s *Service) DeleteStudioArtifacts(ctx context.Context, owner string, artifacts []string) error {
	return s.studioCleanup(ctx, func(ctx context.Context, client *studiocomposition.Client) error {
		return client.Delete(ctx, owner, artifacts)
	})
}

func (s *Service) purgeStudioOwner(ctx context.Context, owner string) error {
	return s.studioCleanup(ctx, func(ctx context.Context, client *studiocomposition.Client) error {
		return client.PurgeOwner(ctx, owner)
	})
}
