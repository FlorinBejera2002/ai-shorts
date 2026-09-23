package story

import (
	"fmt"
	"reflect"
)

// Style deliberately excludes narrative, duration, source and crop settings.
type Style struct {
	Captions         *bool    `json:"captions,omitempty"`
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
	if reflect.DeepEqual(before, after) {
		return before, fmt.Errorf("choose a different visual style")
	}
	return after, ValidateBrandOptions(after)
}
