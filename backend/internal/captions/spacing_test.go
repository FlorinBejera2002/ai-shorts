package captions

import (
	"encoding/json"
	"math"
	"strings"
	"testing"
)

func TestSpacingPersistsAndChangesExportLayout(t *testing.T) {
	font, err := FontBytes("builtin:inter", 900)
	if err != nil {
		t.Fatal(err)
	}
	style := Default()
	style.Weight = 900
	style.LetterSpacing = .12
	style.WordSpacing = .3
	style.LineSpacing = 1.5
	raw, err := json.Marshal(style)
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Decode(json.RawMessage(raw))
	if err != nil || *restored != style {
		t.Fatalf("spacing lost on persistence: %#v %v", restored, err)
	}
	ass, err := ASS(style, font, [][]Word{{{"Știință", .1, .5}, {"română", .5, 1}}}, 1080, 1920)
	if err != nil {
		t.Fatal(err)
	}
	// At 54px the normal tracking is 6.48px; only space glyphs add 16.2px.
	if !strings.Contains(ass, `\fsp6.480`) || !strings.Contains(ass, `{\fsp22.680} {\fsp6.480}`) {
		t.Fatalf("export does not apply independent letter/word spacing: %s", ass)
	}
	style.LetterSpacing, style.WordSpacing = 0, 0
	plain, err := ASS(style, font, [][]Word{{{"Știință", .1, .5}, {"română", .5, 1}}}, 1080, 1920)
	if err != nil || plain == ass || strings.Contains(plain, `\fsp`) {
		t.Fatalf("default spacing changed or layout did not update: %v", err)
	}
}

func TestSpacingLimitsRejectNonFiniteAndUnreadableValues(t *testing.T) {
	for _, value := range []float64{math.NaN(), math.Inf(1), -.1, .31} {
		s := Default()
		s.LetterSpacing = value
		if s.Validate() == nil {
			t.Fatalf("invalid letter spacing accepted: %v", value)
		}
	}
	for _, value := range []float64{math.NaN(), math.Inf(1), -.01, 1.01} {
		s := Default()
		s.WordSpacing = value
		if s.Validate() == nil {
			t.Fatalf("invalid word spacing accepted: %v", value)
		}
	}
}
