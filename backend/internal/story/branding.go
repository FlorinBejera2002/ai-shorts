package story

import (
	"fmt"
	"regexp"
	"strings"
)

var storyColor = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
var storyFont = regexp.MustCompile(`^[A-Za-z0-9 -]{1,100}$`)
var storyResource = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// ValidateBrandOptions is also used before native rendering, including restored jobs.
func ValidateBrandOptions(o Options) error {
	if o.SubtitleColor != "" && !storyColor.MatchString(o.SubtitleColor) {
		return fmt.Errorf("subtitle color must be a six-digit hex color")
	}
	if o.SubtitleFont != "" && (!storyFont.MatchString(o.SubtitleFont) || strings.TrimSpace(o.SubtitleFont) == "") {
		return fmt.Errorf("subtitle font is invalid")
	}
	if o.SubtitleSize != 0 && (o.SubtitleSize < 12 || o.SubtitleSize > 120) {
		return fmt.Errorf("subtitle size must be between 12 and 120")
	}
	switch o.SubtitlePosition {
	case "", "top", "center", "bottom":
	default:
		return fmt.Errorf("subtitle position is invalid")
	}
	switch o.LogoPosition {
	case "", "top-left", "top-right", "bottom-left", "bottom-right":
	default:
		return fmt.Errorf("logo position is invalid")
	}
	if o.LogoOpacity != nil && (!finite(*o.LogoOpacity) || *o.LogoOpacity < 0 || *o.LogoOpacity > 1) {
		return fmt.Errorf("logo opacity must be between zero and one")
	}
	if o.LogoResourceID != "" && !storyResource.MatchString(o.LogoResourceID) {
		return fmt.Errorf("choose an attached logo resource")
	}
	return nil
}
