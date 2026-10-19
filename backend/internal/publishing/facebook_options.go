package publishing

import (
	"errors"
	"net/url"
	"regexp"
	"strings"
	"unicode/utf8"
)

type FacebookOptions struct {
	PlaceID       string `json:"placeId,omitempty"`
	ReelTitle     string `json:"reelTitle,omitempty"`
	IsAIGenerated bool   `json:"isAiGenerated,omitempty"`
}

var facebookPlaceID = regexp.MustCompile(`^[0-9]{1,64}$`)

func ValidateFacebookOptions(options FacebookOptions) error {
	if options.PlaceID != "" && !facebookPlaceID.MatchString(options.PlaceID) {
		return errors.New("Facebook location must be a numeric Place ID")
	}
	// This is an application limit, not a claimed Meta API character limit.
	if utf8.RuneCountInString(options.ReelTitle) > 255 || strings.IndexFunc(options.ReelTitle, func(r rune) bool { return r < 32 || r == 127 }) >= 0 {
		return errors.New("Facebook Reel title must be at most 255 characters")
	}
	return nil
}

func ValidateFacebookSettings(items []PublishMedia, options FacebookOptions) error {
	if err := ValidateFacebookOptions(options); err != nil {
		return err
	}
	if err := ValidateFacebookMedia(items); err != nil {
		return err
	}
	reel := len(items) == 1 && items[0].Type == "video"
	if !reel && (options.ReelTitle != "" || options.IsAIGenerated) {
		return errors.New("Facebook title and AI disclosure are available only for a single Reel")
	}
	return nil
}

func facebookReelFields(form url.Values, options FacebookOptions) {
	if options.PlaceID != "" {
		form.Set("place", options.PlaceID)
	}
	if options.ReelTitle != "" {
		form.Set("title", options.ReelTitle)
	}
	if options.IsAIGenerated {
		form.Set("is_ai_generated", "true")
	}
}
