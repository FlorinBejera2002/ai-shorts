package story

import (
	"fmt"
	"reflect"
)

// Style deliberately excludes narrative, duration, source and crop settings.
type Style struct {
	Captions         *bool    `json:"captions,omitempty"`
	CaptionMode      *string  `json:"caption_mode,omitempty"`
	SubtitleColor    *string  `json:"subtitle_color,omitempty"`
	SubtitlePosition *string  `json:"subtitle_position,omitempty"`
	SubtitleFont     *string  `json:"subtitle_font,omitempty"`
	SubtitleSize     *int     `json:"subtitle_size,omitempty"`
	LogoResourceID   *string  `json:"logo_resource_id,omitempty"`
	LogoPosition     *string  `json:"logo_position,omitempty"`
	LogoOpacity      *float64 `json:"logo_opacity,omitempty"`
}

func ApplyStyle(before Options, patch Style) (Options, error) {
	after := before
	if patch.Captions != nil {
		after.Captions = *patch.Captions
		// Legacy switches must not leave a stale explicit mode behind.
		after.CaptionMode = ""
	}
	if patch.CaptionMode != nil {
		after.CaptionMode = *patch.CaptionMode
	}
	after.CaptionMode = EffectiveCaptionMode(after)
	after.Captions = after.CaptionMode != "off"
	if err := validateCaptionMode(after); err != nil {
		return before, err
	}
	if patch.CaptionMode != nil && patch.Captions != nil && *patch.Captions != after.Captions {
		return before, fmt.Errorf("caption mode and captions switch disagree")
	}
	if EffectiveCaptionMode(before) != after.CaptionMode {
		after.CaptionModeRevised = true
	}
	if patch.SubtitleColor != nil {
		after.SubtitleColor = *patch.SubtitleColor
	}
	if patch.SubtitlePosition != nil {
		after.SubtitlePosition = *patch.SubtitlePosition
	}
	if patch.SubtitleFont != nil {
		after.SubtitleFont = *patch.SubtitleFont
	}
	if patch.SubtitleSize != nil {
		after.SubtitleSize = *patch.SubtitleSize
	}
	if patch.LogoResourceID != nil {
		after.LogoResourceID = *patch.LogoResourceID
	}
	if patch.LogoPosition != nil {
		after.LogoPosition = *patch.LogoPosition
	}
	if patch.LogoOpacity != nil {
		value := *patch.LogoOpacity
		after.LogoOpacity = &value
	}
	comparable := before
	comparable.CaptionMode = EffectiveCaptionMode(before)
	if reflect.DeepEqual(comparable, after) {
		return before, fmt.Errorf("choose a different visual style")
	}
	return after, ValidateBrandOptions(after)
}
