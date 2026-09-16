package publishing

import (
	"errors"
	"net/url"
	"path"
	"strings"
)

// ValidateMediaReferences also checks container formats before any provider
// request. The original remains available even when a destination cannot use it.
func ValidateMediaReferences(provider string, media []PublishMedia) error {
	types := make([]string, 0, len(media))
	for _, item := range media {
		types = append(types, item.Type)
	}
	if err := ValidateMediaTypes(provider, types); err != nil {
		return err
	}
	if provider == "instagram" || provider == "facebook" {
		for _, item := range media {
			if item.Type != "video" {
				continue
			}
			parsed, err := url.Parse(item.URL)
			if err != nil {
				return errors.New("Choose a valid uploaded video")
			}
			extension := strings.ToLower(path.Ext(parsed.Path))
			if extension != ".mp4" && extension != ".mov" {
				return errors.New("Instagram and Facebook require MP4 or MOV videos; the original file has not been converted")
			}
		}
	}
	return nil
}

// ValidateMediaTypes rejects combinations that the configured publishing flows
// cannot send in full. Never silently publish only the first carousel slide.
func ValidateMediaTypes(provider string, types []string) error {
	if len(types) == 0 || len(types) > 10 {
		return errors.New("Choose between 1 and 10 images or videos")
	}
	videos := 0
	for _, kind := range types {
		switch kind {
		case "video":
			videos++
		case "image":
		default:
			return errors.New("Choose supported images or videos")
		}
	}
	switch provider {
	case "instagram":
		return nil
	case "facebook":
		if videos > 0 && len(types) > 1 {
			return errors.New("Facebook supports a photo carousel or one video; publish mixed carousels on Instagram")
		}
	case "tiktok":
		if len(types) != 1 || videos != 1 {
			return errors.New("TikTok publishing currently supports one video in Sneep Cut")
		}
	default:
		return errors.New("Publishing to this platform is not available")
	}
	return nil
}
