package brand

import (
	"errors"
	"math"
	"regexp"
	"slices"
	"strings"
)

var ErrInvalid = errors.New("Brand settings are invalid")
var ErrPlan = errors.New("Removing the platform badge requires an Agency plan")
var ErrInactive = errors.New("Account is unavailable")
var colorPattern = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
var fontPattern = regexp.MustCompile(`^[A-Za-z0-9 -]+$`)
var columns = map[string]string{"primaryColor": "primary_color", "secondaryColor": "secondary_color", "fontFamily": "font_family", "subtitleFont": "subtitle_font", "subtitleColor": "subtitle_color", "subtitleBgColor": "subtitle_bg_color", "subtitleBgOpacity": "subtitle_bg_opacity", "subtitlePosition": "subtitle_position", "watermarkPosition": "watermark_position", "watermarkOpacity": "watermark_opacity", "hidePlatformBadge": "hide_platform_badge"}

func Validate(input map[string]any) (map[string]any, error) {
	if len(input) == 0 {
		return nil, ErrInvalid
	}
	output := make(map[string]any, len(input))
	for key, value := range input {
		if _, ok := columns[key]; !ok {
			return nil, ErrInvalid
		}
		switch {
		case strings.HasSuffix(key, "Color"):
			text, ok := value.(string)
			if !ok || !colorPattern.MatchString(text) {
				return nil, ErrInvalid
			}
			output[key] = strings.ToUpper(text)
		case key == "fontFamily" || key == "subtitleFont":
			text, ok := value.(string)
			if !ok || len(text) > 100 || strings.TrimSpace(text) == "" || !fontPattern.MatchString(text) {
				return nil, ErrInvalid
			}
			output[key] = strings.TrimSpace(text)
		case key == "subtitlePosition":
			text, ok := value.(string)
			if !ok || !slices.Contains([]string{"top", "center", "bottom"}, text) {
				return nil, ErrInvalid
			}
			output[key] = text
		case key == "watermarkPosition":
			text, ok := value.(string)
			if !ok || !slices.Contains([]string{"top-left", "top-right", "bottom-left", "bottom-right"}, text) {
				return nil, ErrInvalid
			}
			output[key] = text
		case key == "subtitleBgOpacity" || key == "watermarkOpacity":
			number, ok := value.(float64)
			if !ok || math.IsNaN(number) || math.IsInf(number, 0) || number < 0 || number > 1 {
				return nil, ErrInvalid
			}
			output[key] = number
		case key == "hidePlatformBadge":
			flag, ok := value.(bool)
			if !ok {
				return nil, ErrInvalid
			}
			output[key] = flag
		}
	}
	return output, nil
}
