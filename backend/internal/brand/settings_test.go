package brand

import (
	"math"
	"strings"
	"testing"
)

func TestSettingsNormalizeAndRejectUneditableFields(t *testing.T) {
	input := map[string]any{"primaryColor": "#aAbBcC", "fontFamily": " Inter Bold ", "subtitleBgOpacity": 0.0, "watermarkOpacity": 1.0, "hidePlatformBadge": false, "subtitlePosition": "center", "watermarkPosition": "top-right"}
	result, e := Validate(input)
	if e != nil {
		t.Fatal(e)
	}
	if result["primaryColor"] != "#AABBCC" || result["fontFamily"] != "Inter Bold" {
		t.Fatal(result)
	}
	for _, fields := range []map[string]any{nil, {}, {"logoPath": "brand/foreign/logo.png"}, {"userId": "foreign"}, {"primaryColor": "red"}, {"secondaryColor": "#fff"}, {"fontFamily": "Arial; color:red"}, {"subtitleFont": ""}, {"fontFamily": strings.Repeat("a", 101)}, {"subtitleBgOpacity": -0.01}, {"watermarkOpacity": 1.01}, {"watermarkOpacity": math.NaN()}, {"watermarkOpacity": math.Inf(1)}, {"subtitleBgOpacity": true}, {"hidePlatformBadge": "true"}, {"subtitlePosition": "left"}, {"watermarkPosition": "center"}} {
		if _, e := Validate(fields); e == nil {
			t.Fatalf("accepted %#v", fields)
		}
	}
}

func TestWatermarkCenterValidation(t *testing.T) {
	for _, fields := range []map[string]any{
		{"watermarkX": 0.0, "watermarkY": 1.0},
		{"watermarkX": .25, "watermarkY": .65},
		{"watermarkX": nil, "watermarkY": nil},
	} {
		if _, err := Validate(fields); err != nil {
			t.Fatalf("valid logo center rejected: %v", err)
		}
	}
	for _, fields := range []map[string]any{
		{"watermarkX": .5}, {"watermarkY": .5},
		{"watermarkX": nil, "watermarkY": .5},
		{"watermarkX": -.1, "watermarkY": .5},
		{"watermarkX": .5, "watermarkY": 1.01},
		{"watermarkX": math.NaN(), "watermarkY": .5},
		{"watermarkX": .5, "watermarkY": math.Inf(1)},
		{"watermarkX": "0.5", "watermarkY": .5},
	} {
		if _, err := Validate(fields); err == nil {
			t.Fatalf("invalid logo center accepted: %#v", fields)
		}
	}
}
