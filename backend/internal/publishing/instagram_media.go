package publishing

import (
	"context"
	"errors"
	"path"
	"strings"

	"sneepcut/backend-go/internal/media"
)

type instagramImagePreparer interface {
	PrepareInstagramImage(context.Context, string, *media.InstagramCrop) (string, error)
}

// PrepareInstagramAttachments validates actual stored bytes before enqueue.
// Existing fakes may omit image preparation only when there is no crop/cover.
func PrepareInstagramAttachments(ctx context.Context, storage Media, userID string, attachments []MediaAttachment, options InstagramOptions) error {
	preparer, available := storage.(instagramImagePreparer)
	for _, item := range attachments {
		if item.Type != "image" {
			continue
		}
		if !available {
			if item.Crop != nil {
				return errors.New("Instagram crop preparation is unavailable")
			}
			continue
		}
		key, err := storage.KeyFromReference(item.Reference)
		if err != nil || path.Dir(key) != "publishing/"+userID {
			return errors.New("Choose photos uploaded by this account")
		}
		prepared, err := preparer.PrepareInstagramImage(ctx, key, item.Crop)
		if err != nil {
			return err
		}
		if item.Crop == nil {
			if validator, ok := storage.(interface {
				ValidateInstagramFeedImage(context.Context, string) error
			}); ok {
				if err := validator.ValidateInstagramFeedImage(ctx, prepared); err != nil {
					return err
				}
			}
		}
	}
	if options.CoverReference != "" {
		_, err := instagramCoverKey(ctx, storage, userID, options.CoverReference)
		return err
	}
	return nil
}

func instagramCoverKey(ctx context.Context, storage Media, userID, reference string) (string, error) {
	key, err := storage.KeyFromReference(reference)
	if err != nil || path.Dir(key) != "publishing/"+userID {
		return "", errors.New("Choose a Reel cover uploaded by this account")
	}
	switch strings.ToLower(path.Ext(key)) {
	case ".jpg", ".jpeg", ".png", ".webp":
	default:
		return "", errors.New("Choose an image for the Reel cover")
	}
	preparer, ok := storage.(instagramImagePreparer)
	if !ok {
		return "", errors.New("Instagram cover preparation is unavailable")
	}
	return preparer.PrepareInstagramImage(ctx, key, nil)
}

func attachmentsForProvider(provider string, attachments []MediaAttachment) []MediaAttachment {
	result := make([]MediaAttachment, len(attachments))
	for i, item := range attachments {
		if provider != "instagram" {
			item.UserTags = nil
		}
		if provider != "instagram" && provider != "facebook" {
			item.AltText = ""
			if provider != "tiktok" {
				item.Crop = nil
			}
		}
		result[i] = item
	}
	return result
}
