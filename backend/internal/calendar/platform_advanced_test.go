package calendar

import (
	"encoding/json"
	"testing"

	"sneepcut/backend-go/internal/publishing"
)

func TestTikTokCoverOptionsValidateAndPersistExplicitZero(t *testing.T) {
	for _, key := range []string{"photoCoverIndex", "videoCoverTimestampMs"} {
		fields, err := Validate(map[string]any{"tiktok": map[string]any{key: 0, "isAigc": true}}, false)
		if err != nil {
			t.Fatal(err)
		}
		raw, _ := json.Marshal(fields["tiktok"])
		var decoded map[string]any
		_ = json.Unmarshal(raw, &decoded)
		if decoded[key] != float64(0) || decoded["isAigc"] != true {
			t.Fatalf("explicit option lost: %s", raw)
		}
		for _, invalid := range []any{-1, 1.5, "0", true, 9007199254740992} {
			if _, err := Validate(map[string]any{"tiktok": map[string]any{key: invalid}}, false); err == nil {
				t.Fatalf("invalid %s=%v accepted", key, invalid)
			}
		}
	}
}

func TestYouTubeAdvancedOptionsValidateInDrafts(t *testing.T) {
	fields, err := Validate(map[string]any{"youtube": map[string]any{"tags": []any{"summer", "road trip"}, "license": "creativeCommon", "embeddable": false}}, false)
	if err != nil {
		t.Fatal(err)
	}
	options := fields["youtube"].(publishing.YouTubeOptions)
	if len(options.Tags) != 2 || options.License != "creativeCommon" || options.Embeddable == nil || *options.Embeddable {
		t.Fatalf("advanced settings lost: %+v", options)
	}
	for _, invalid := range []map[string]any{{"tags": "summer"}, {"tags": []any{1}}, {"license": "invalid"}, {"embeddable": "false"}} {
		if _, err := Validate(map[string]any{"youtube": invalid}, false); err == nil {
			t.Fatalf("invalid options accepted: %+v", invalid)
		}
	}
}
