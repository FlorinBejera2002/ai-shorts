package publishing

import (
	"context"
	"errors"

	"sneepcut/backend-go/internal/media"
)

// prepareTikTokPhoto retains the original reference in the job and only signs
// the cached derivative after validating the actual prepared image.
func prepareTikTokPhoto(ctx context.Context, storage Media, reference string, crop *media.InstagramCrop) (string, error) {
	if crop != nil {
		resolver, ok := storage.(interface {
			PrepareTikTokImage(context.Context, string, *media.InstagramCrop) (string, error)
		})
		if !ok {
			return "", errors.New("TikTok crop preparation is unavailable")
		}
		return resolver.PrepareTikTokImage(ctx, reference, crop)
	}
	resolver, ok := storage.(interface {
		TikTokPublishingKey(context.Context, string) (string, error)
	})
	if !ok {
		return "", errors.New("TikTok image preparation is unavailable")
	}
	return resolver.TikTokPublishingKey(ctx, reference)
}
