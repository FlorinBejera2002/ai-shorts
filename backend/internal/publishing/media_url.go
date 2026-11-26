package publishing

import "context"

// Resolve provider-specific delivery after the existing ownership/preparation checks.
func (h *Handler) publishingURL(ctx context.Context, provider, reference string) (string, error) {
	if resolver, ok := h.media.(interface {
		PublishingURL(context.Context, string, string) (string, error)
	}); ok {
		return resolver.PublishingURL(ctx, provider, reference)
	}
	return h.media.SignedURL(ctx, reference)
}
