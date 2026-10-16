package captions

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestCatalogContainsActualRomanianFontsAndWeights(t *testing.T) {
	if len(Catalog()) < 30 {
		t.Fatal("fewer than 30 families")
	}
	for _, font := range Catalog() {
		t.Run(font.Family, func(t *testing.T) {
			for _, weight := range font.Weights {
				data, err := FontBytes(font.ID, weight)
				if err != nil {
					t.Fatal(err)
				}
				meta, err := Inspect(data)
				if err != nil {
					t.Fatal(err)
				}
				if !meta.Romanian {
					t.Fatal("missing Romanian diacritics")
				}
				if meta.Weights[0] != weight {
					t.Fatalf("expected weight %d, actual %d", weight, meta.Weights[0])
				}
				if !strings.Contains(strings.ToLower(meta.Family), strings.Split(strings.ToLower(font.Family), " ")[0]) {
					t.Fatalf("wrong family %q", meta.Family)
				}
			}
		})
	}
}
func TestUploadedMultiwordFamilyAndMalformedFont(t *testing.T) {
	data, err := FontBytes("builtin:open-sans", 700)
	if err != nil {
		t.Fatal(err)
	}
	f, err := Inspect(data)
	if err != nil || f.Family != "Open Sans" {
		t.Fatalf("family was truncated: %#v %v", f, err)
	}
	for _, bad := range [][]byte{nil, []byte("wOF2fake"), data[:40], make([]byte, (8<<20)+1)} {
		if _, err := Inspect(bad); err == nil {
			t.Fatal("invalid font accepted")
		}
	}
	if _, err := PrivateKey("owner", "../../font.ttf"); err == nil {
		t.Fatal("unsafe resource accepted")
	}
}
func TestCaptionContractRoundtripAndDistinctTimedASS(t *testing.T) {
	data, _ := FontBytes("builtin:inter", 700)
	style := Default()
	style.Position = Position{.3, .25, "center"}
	raw, _ := json.Marshal(style)
	var restored Style
	if json.Unmarshal(raw, &restored) != nil || restored != style {
		t.Fatal("style placement lost on reload")
	}
	groups := [][]Word{{{"ă â î ș ț", .1, .5}, {"Ă Â Î Ș Ț", .7, 1.2}}}
	seen := map[string]bool{}
	for _, preset := range Presets {
		style.Preset = preset
		ass, err := ASS(style, data, groups, 1080, 1920)
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(ass, "ă") || !strings.Contains(ass, "Ș") || !strings.Contains(ass, "PlayResY: 1920") {
			t.Fatal("caption data lost")
		}
		if seen[ass] {
			t.Fatalf("duplicate presentation %s", preset)
		}
		seen[ass] = true
	}
	style.Preset = "word-by-word"
	ass, _ := ASS(style, data, groups, 1080, 1920)
	if !strings.Contains(ass, "0:00:00.70,0:00:01.20") {
		t.Fatal("word timestamps changed")
	}
	style.Position.X = -.1
	if style.Validate() == nil {
		t.Fatal("off frame value accepted")
	}
	style = Default()
	style.Version = 99
	if style.Validate() == nil {
		t.Fatal("unknown version accepted")
	}
}

func TestMissingAlignmentRequiresGenuinePhraseBounds(t *testing.T) {
	data, _ := FontBytes("builtin:inter", 700)
	s := Default()
	s.Preset = "karaoke"
	if _, err := ASS(s, data, [][]Word{{{Text: "hello"}}}, 320, 180); err == nil {
		t.Fatal("invalid alignment silently accepted")
	}
	ass, err := ASSCues(s, data, []Cue{{Text: "Romanian ă â î ș ț words without word alignment", Start: .4, End: 2.1}}, 320, 180)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(ass, `\kf`) || strings.Contains(ass, `\k0`) || !strings.Contains(ass, "0:00:00.40,0:00:02.10") {
		t.Fatal("static fallback invented word timing", ass)
	}
	if _, err = ASSCues(s, data, []Cue{{Text: "no timing"}}, 320, 180); err == nil {
		t.Fatal("missing phrase bounds accepted")
	}
}
func TestStackedHonorsOneLineAndLongWordGetsScale(t *testing.T) {
	data, _ := FontBytes("builtin:inter", 700)
	s := Default()
	s.Preset = "stacked"
	s.MaxLines = 1
	ass, err := ASS(s, data, [][]Word{{{Text: "two", Start: .1, End: .4}, {Text: "words", Start: .4, End: .8}}}, 320, 180)
	if err != nil || strings.Count(ass, "Dialogue:") != 1 {
		t.Fatal("max lines ignored", err, ass)
	}
	s.Preset = "word-by-word"
	s.Size = .16
	s.Position = Position{X: 0, Y: 0, Anchor: "center"}
	ass, err = ASS(s, data, [][]Word{{{Text: strings.Repeat("Romanian", 15), Start: .1, End: .5}}}, 180, 320)
	if err != nil || !strings.Contains(ass, `\fscx`) || strings.Contains(ass, `\fscx100.00`) {
		t.Fatal("long token not scaled", err, ass)
	}
}

func TestLegacyKitRetainsExactAvailableFamilyAndWeight(t *testing.T) {
	s := Legacy(map[string]any{"subtitle_font": "Roboto Bold", "subtitle_color": "#112233"})
	if s.FontID != "builtin:roboto" || s.Weight != 700 || s.TextColor != "#112233" || s.Validate() != nil {
		t.Fatalf("legacy exact font lost %#v", s)
	}
	s = Legacy(map[string]any{"subtitle_font": "Impact"})
	if s.Validate() == nil || s.FontID == "builtin:anton" || s.FontID == "builtin:inter" {
		t.Fatal("unavailable legacy font silently substituted")
	}
}

func TestIndependentCaptionSwitchesPreserveExplicitFalse(t *testing.T) {
	s := Default()
	off := false
	s.OutlineEnabled, s.BackgroundEnabled, s.ActiveWordEnabled = &off, &off, &off
	s.Animation = "word-pop"
	raw, err := json.Marshal(s)
	if err != nil {
		t.Fatal(err)
	}
	var restored Style
	if err := json.Unmarshal(raw, &restored); err != nil {
		t.Fatal(err)
	}
	if restored.OutlineEnabled == nil || *restored.OutlineEnabled || restored.BackgroundEnabled == nil || *restored.BackgroundEnabled || restored.ActiveWordEnabled == nil || *restored.ActiveWordEnabled || restored.Animation != "word-pop" || restored.Validate() != nil {
		t.Fatal("explicit Off or animation lost", string(raw))
	}
	if restored.Outline != s.Outline || restored.HighlightColor != s.HighlightColor {
		t.Fatal("Off erased saved appearance")
	}
	restored.Animation = "unsafe-animation"
	if restored.Validate() == nil {
		t.Fatal("unsupported animation accepted")
	}
}

func TestDisabledPresetEffectsDoNotOverrideOff(t *testing.T) {
	font, _ := FontBytes("builtin:inter", 700)
	style := Default()
	off := false
	style.OutlineEnabled, style.BackgroundEnabled, style.ActiveWordEnabled = &off, &off, &off
	for _, preset := range []string{"bold-outline", "contrast-box", "active-background", "karaoke"} {
		style.Preset = preset
		ass, err := ASS(style, font, [][]Word{{{Text: "hello", Start: 0, End: 1}}}, 720, 1280)
		if err != nil {
			t.Fatal(err)
		}
		if strings.Contains(ass, "Dialogue: 0,") || strings.Contains(ass, "Dialogue: 2,") {
			t.Fatalf("%s revived a disabled effect", preset)
		}
		if !strings.Contains(ass, ",1,0.00,0.00,5,") {
			t.Fatal("outline Off ignored", ass)
		}
	}
}
