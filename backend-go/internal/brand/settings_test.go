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
