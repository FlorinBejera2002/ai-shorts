package publishing

import "errors"

// ValidateTikTokAdvancedOptions also runs for incomplete drafts.
func ValidateTikTokAdvancedOptions(options TikTokOptions) error {
	if options.PhotoCoverIndex != nil && (*options.PhotoCoverIndex < 0 || *options.PhotoCoverIndex > 34) {
		return errors.New("Choose a TikTok cover photo from the attached photos")
	}
	if options.VideoCoverTimestampMs != nil && (*options.VideoCoverTimestampMs < 0 || *options.VideoCoverTimestampMs > 9007199254740991) {
		return errors.New("TikTok video cover time must be a non-negative whole number of milliseconds")
	}
	return nil
}

func ValidateTikTokMediaOptions(items []PublishMedia, options TikTokOptions) error {
	if err := ValidateTikTokAdvancedOptions(options); err != nil {
		return err
	}
	photo := len(items) > 0 && items[0].Type == "image"
	if photo {
		if options.PhotoCoverIndex != nil && *options.PhotoCoverIndex >= len(items) {
			return errors.New("Choose a TikTok cover photo from the attached photos")
		}
		if options.VideoCoverTimestampMs != nil {
			return errors.New("TikTok video cover time is available only for video posts")
		}
	} else if options.PhotoCoverIndex != nil {
		return errors.New("TikTok photo cover selection is available only for photo posts")
	}
	return nil
}
