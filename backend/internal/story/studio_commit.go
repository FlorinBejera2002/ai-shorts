package story

import (
	"context"
	"errors"
)

// CommitStudio is deliberately separate from rendering/review. Rejected repair
// candidates cannot become the shared editable project's current revision.
func (b *Builder) CommitStudio(ctx context.Context, owner, artifact string) error {
	committer, ok := b.media.(interface {
		CommitStudio(context.Context, string, string) error
	})
	if !ok {
		return errors.New("Studio project publication is unavailable")
	}
	return committer.CommitStudio(ctx, owner, artifact)
}
