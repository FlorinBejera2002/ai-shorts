// Package captions defines the persisted v1 caption contract used by every export.
package captions

import (
	"encoding/json"
	"errors"
	"math"
	"regexp"
	"slices"
	"strings"
)

type Position struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Anchor string  `json:"anchor"`
}
type Style struct {
	Version           int      `json:"version"`
	Preset            string   `json:"preset"`
	FontID            string   `json:"font_id"`
	Weight            int      `json:"weight"`
	Size              float64  `json:"size"`
	TextColor         string   `json:"text_color"`
	OutlineColor      string   `json:"outline_color"`
	Outline           float64  `json:"outline"`
	Shadow            float64  `json:"shadow"`
	BackgroundColor   string   `json:"background_color"`
	BackgroundOpacity float64  `json:"background_opacity"`
	HighlightColor    string   `json:"highlight_color"`
	Align             string   `json:"align"`
	MaxWidth          float64  `json:"max_width"`
	MaxLines          int      `json:"max_lines"`
	LineSpacing       float64  `json:"line_spacing"`
	LetterSpacing     float64  `json:"letter_spacing"`
	WordSpacing       float64  `json:"word_spacing"`
	Position          Position `json:"position"`
}

var Presets = []string{"classic", "minimal", "bold-outline", "contrast-box", "headline", "word-by-word", "karaoke", "active-color", "active-background", "phrase-pop", "subtle-fade", "stacked"}
var color = regexp.MustCompile(`^#[a-fA-F0-9]{6}$`)
var resource = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

func Default() Style {
	return Style{Version: 1, Preset: "classic", FontID: "builtin:inter", Weight: 700, Size: .05, TextColor: "#FFFFFF", OutlineColor: "#000000", Outline: 2, Shadow: 0, BackgroundColor: "#000000", BackgroundOpacity: 0, HighlightColor: "#FFE066", Align: "center", MaxWidth: .88, MaxLines: 2, LineSpacing: 1.15, Position: Position{.5, .84, "center"}}
}
func finiteRange(v, a, b float64) bool {
	return !math.IsNaN(v) && !math.IsInf(v, 0) && v >= a && v <= b
}
func (s Style) Validate() error {
	if s.Version != 1 || !slices.Contains(Presets, s.Preset) || !(resource.MatchString(s.FontID) || IsBuiltin(s.FontID)) || !slices.Contains([]string{"left", "center", "right"}, s.Align) || s.Position.Anchor != "center" {
		return errors.New("unsupported caption style or font")
	}
	for _, c := range []string{s.TextColor, s.OutlineColor, s.BackgroundColor, s.HighlightColor} {
		if !color.MatchString(c) {
			return errors.New("caption colors must use six-digit hex values")
		}
	}
	if !finiteRange(s.Size, .02, .16) || !finiteRange(s.Outline, 0, 8) || !finiteRange(s.Shadow, 0, 8) || !finiteRange(s.BackgroundOpacity, 0, 1) || !finiteRange(s.MaxWidth, .2, .96) || s.MaxLines < 1 || s.MaxLines > 3 || !finiteRange(s.LineSpacing, 1, 1.8) || !finiteRange(s.LetterSpacing, -.05, .3) || !finiteRange(s.WordSpacing, 0, 1) || !finiteRange(s.Position.X, 0, 1) || !finiteRange(s.Position.Y, 0, 1) || s.Weight < 100 || s.Weight > 900 {
		return errors.New("caption settings are outside the supported range")
	}
	if f, ok := Builtin(s.FontID); ok && !slices.Contains(f.Weights, s.Weight) {
		return errors.New("selected font weight is unavailable")
	}
	return nil
}
func Decode(v any) (*Style, error) {
	b, e := json.Marshal(v)
	if e != nil {
		return nil, e
	}
	var s Style
	if e = json.Unmarshal(b, &s); e != nil {
		return nil, e
	}
	return &s, s.Validate()
}

// Legacy settings are interpreted only when no explicit versioned style exists.
func Legacy(brand map[string]any) Style {
	s := Default()
	if family, ok := brand["subtitle_font"].(string); ok && family != "" {
		weight := 400
		if strings.HasSuffix(family, " Bold") {
			weight = 700
			family = strings.TrimSuffix(family, " Bold")
		}
		// A legacy proprietary/local font has no bundled resource. Keep it
		// explicit instead of silently substituting a different family.
		s.FontID = "legacy:" + family
		s.Weight = weight
		for _, available := range Catalog() {
			if strings.EqualFold(available.Family, family) && slices.Contains(available.Weights, weight) {
				s.FontID = available.ID
				break
			}
		}
	}
	if v, ok := brand["subtitle_color"].(string); ok && color.MatchString(v) {
		s.TextColor = v
	}
	if v, ok := brand["subtitle_bg_color"].(string); ok && color.MatchString(v) {
		s.BackgroundColor = v
	}
	if v, ok := brand["subtitle_bg_opacity"].(float64); ok {
		s.BackgroundOpacity = v
	}
	switch brand["subtitle_position"] {
	case "top":
		s.Position.Y = .16
	case "center", "middle":
		s.Position.Y = .5
	}
	return s
}
