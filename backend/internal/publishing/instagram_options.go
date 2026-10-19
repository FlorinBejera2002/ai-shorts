package publishing

import (
	"encoding/json"
	"errors"
	"math"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"

	"sneepcut/backend-go/internal/media"
)

type InstagramOptions struct {
	CommentEnabled *bool    `json:"commentEnabled,omitempty"`
	ShareToFeed    *bool    `json:"shareToFeed,omitempty"`
	LocationID     string   `json:"locationId,omitempty"`
	Collaborators  []string `json:"collaborators,omitempty"`
	CoverReference string   `json:"coverReference,omitempty"`
	ThumbOffset    *int     `json:"thumbOffset,omitempty"`
	AudioName      string   `json:"audioName,omitempty"`
	IsAIGenerated  bool     `json:"isAiGenerated,omitempty"`
	TrialReel      string   `json:"trialReel,omitempty"`
	// Resolved only immediately before the provider request, never persisted.
	CoverURL string `json:"-"`
}

type InstagramUserTag struct {
	Username string  `json:"username"`
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
}

type MediaAttachment struct {
	Type      string               `json:"type"`
	Reference string               `json:"reference"`
	Name      string               `json:"name"`
	AltText   string               `json:"altText,omitempty"`
	Crop      *media.InstagramCrop `json:"crop,omitempty"`
	UserTags  []InstagramUserTag   `json:"userTags,omitempty"`
}

func (m MediaAttachment) PublishMedia() PublishMedia {
	return PublishMedia{Type: m.Type, URL: m.Reference, AltText: m.AltText, Crop: m.Crop, UserTags: m.UserTags}
}

var instagramUsername = regexp.MustCompile(`^[A-Za-z0-9._]{1,30}$`)
var instagramLocation = regexp.MustCompile(`^[0-9]{1,64}$`)

func ValidateInstagramOptions(options InstagramOptions) error {
	if options.LocationID != "" && !instagramLocation.MatchString(options.LocationID) {
		return errors.New("Instagram location must be a numeric Facebook Page ID")
	}
	if len(options.Collaborators) > 3 {
		return errors.New("Instagram supports up to 3 collaborators")
	}
	seen := map[string]bool{}
	for _, username := range options.Collaborators {
		if !instagramUsername.MatchString(username) || seen[strings.ToLower(username)] {
			return errors.New("Choose unique Instagram collaborator usernames without @")
		}
		seen[strings.ToLower(username)] = true
	}
	if options.ThumbOffset != nil && (*options.ThumbOffset < 0 || *options.ThumbOffset > 900000) {
		return errors.New("Instagram cover frame must be between 0 and 900,000 milliseconds")
	}
	if options.CoverReference != "" && options.ThumbOffset != nil {
		return errors.New("Choose either an uploaded Reel cover or a video frame")
	}
	if utf8.RuneCountInString(options.AudioName) > 100 || strings.IndexFunc(options.AudioName, func(r rune) bool { return r < 32 || r == 127 }) >= 0 {
		return errors.New("Instagram audio name must be at most 100 characters")
	}
	if options.TrialReel != "" && options.TrialReel != "MANUAL" && options.TrialReel != "SS_PERFORMANCE" {
		return errors.New("Choose a valid trial Reel sharing strategy")
	}
	return nil
}

func ValidateInstagramMedia(media []PublishMedia, options InstagramOptions) error {
	if err := ValidateInstagramOptions(options); err != nil {
		return err
	}
	if options.CommentEnabled != nil && !*options.CommentEnabled {
		return errors.New("Manage comment settings in Instagram. Reset the saved comments setting before publishing")
	}
	reel := len(media) == 1 && media[0].Type == "video"
	if !reel && (options.CoverReference != "" || options.CoverURL != "" || options.ThumbOffset != nil || options.AudioName != "" || options.TrialReel != "") {
		return errors.New("Cover, audio name and trial settings are available only for a single Instagram Reel")
	}
	var cropRatio string
	for _, item := range media {
		if item.Type == "image" && item.Crop != nil {
			if cropRatio != "" && cropRatio != item.Crop.AspectRatio {
				return errors.New("Use the same Instagram format for every carousel photo")
			}
			cropRatio = item.Crop.AspectRatio
		}
	}
	for _, item := range media {
		if item.Type == "image" && cropRatio != "" && item.Crop == nil {
			return errors.New("Apply the selected Instagram format to every carousel photo")
		}
		if item.Type != "image" && (item.AltText != "" || item.Crop != nil || len(item.UserTags) > 0) {
			return errors.New("Alternative text, photo crop and positioned user tags require an image")
		}
		if utf8.RuneCountInString(item.AltText) > 1000 {
			return errors.New("Instagram alternative text must be at most 1,000 characters per image")
		}
		if item.Crop != nil {
			if err := item.Crop.Validate(); err != nil {
				return err
			}
		}
		if len(item.UserTags) > 20 {
			return errors.New("Choose up to 20 Instagram user tags per image")
		}
		seen := map[string]bool{}
		for _, tag := range item.UserTags {
			if !instagramUsername.MatchString(tag.Username) || seen[strings.ToLower(tag.Username)] || math.IsNaN(tag.X) || math.IsNaN(tag.Y) || tag.X < 0 || tag.X > 1 || tag.Y < 0 || tag.Y > 1 {
				return errors.New("Choose unique Instagram usernames and tag positions within the image")
			}
			seen[strings.ToLower(tag.Username)] = true
		}
	}
	return nil
}

func instagramImageFields(form url.Values, item PublishMedia) {
	if item.AltText != "" {
		form.Set("alt_text", item.AltText)
	}
	if len(item.UserTags) > 0 {
		encoded, _ := json.Marshal(item.UserTags)
		form.Set("user_tags", string(encoded))
	}
}

func instagramParentFields(form url.Values, options InstagramOptions) {
	if options.LocationID != "" {
		form.Set("location_id", options.LocationID)
	}
	if len(options.Collaborators) > 0 {
		encoded, _ := json.Marshal(options.Collaborators)
		form.Set("collaborators", string(encoded))
	}
	if options.IsAIGenerated {
		form.Set("is_ai_generated", "true")
	}
}

func instagramReelFields(form url.Values, options InstagramOptions) {
	if options.ShareToFeed != nil {
		form.Set("share_to_feed", strconv.FormatBool(*options.ShareToFeed))
	}
	if options.CoverURL != "" {
		form.Set("cover_url", options.CoverURL)
	}
	if options.ThumbOffset != nil {
		form.Set("thumb_offset", strconv.Itoa(*options.ThumbOffset))
	}
	if options.AudioName != "" {
		form.Set("audio_name", options.AudioName)
	}
	if options.TrialReel != "" {
		encoded, _ := json.Marshal(map[string]string{"graduation_strategy": options.TrialReel})
		form.Set("trial_params", string(encoded))
	}
}
