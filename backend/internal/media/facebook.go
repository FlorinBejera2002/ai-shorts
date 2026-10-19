package media

import "context"

// PrepareFacebookImage reuses the lossless-original, cached JPEG crop pipeline.
// Facebook originals do not inherit Instagram's feed ratio or JPEG requirement.
func (s *Service) PrepareFacebookImage(ctx context.Context, reference string, crop *InstagramCrop) (string, error) {
	if crop == nil {
		return s.KeyFromReference(reference)
	}
	return s.PrepareInstagramImage(ctx, reference, crop)
}
