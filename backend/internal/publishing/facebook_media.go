package publishing

import (
	"context"
	"errors"
	"path"
	"unicode/utf8"

	"sneepcut/backend-go/internal/media"
)

type facebookImagePreparer interface {
	PrepareFacebookImage(context.Context, string, *media.InstagramCrop) (string, error)
}

func ValidateFacebookMedia(items []PublishMedia) error {
	for _, item := range items {
		if item.Type != "image" && (item.AltText != "" || item.Crop != nil) {
			return errors.New("Facebook alternative text and photo crop require an image")
		}
		if utf8.RuneCountInString(item.AltText) > 1000 {
			return errors.New("Alternative text must be at most 1,000 characters per Facebook image")
		}
		if item.Crop != nil {
			if err := item.Crop.Validate(); err != nil {
				return err
			}
		}
	}
	return nil
}

func PrepareFacebookAttachments(ctx context.Context, storage Media, userID string, attachments []MediaAttachment) error {
	for _, item := range attachments {
		if item.Type != "image" || item.Crop == nil {
			continue
		}
		preparer, ok := storage.(facebookImagePreparer)
		if !ok {
			return errors.New("Facebook crop preparation is unavailable")
		}
		key, err := storage.KeyFromReference(item.Reference)
		if err != nil || path.Dir(key) != "publishing/"+userID {
			return errors.New("Choose photos uploaded by this account")
		}
		if _, err := preparer.PrepareFacebookImage(ctx, key, item.Crop); err != nil {
			return err
		}
	}
	return nil
}
