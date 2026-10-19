package calendar

import (
	"encoding/json"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/publishing"
)

func TestFacebookOptionsValidateAndRoundTrip(t *testing.T) {
	options := map[string]any{"placeId": "123456", "reelTitle": "Reel 🚲", "isAiGenerated": true}
	fields, err := Validate(map[string]any{"facebook": options}, false)
	if err != nil {
		t.Fatal(err)
	}
	raw := encodeFacebookOptions(fields["facebook"].(publishing.FacebookOptions))
	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil || decoded["placeId"] != "123456" || decoded["reelTitle"] != "Reel 🚲" || decoded["isAiGenerated"] != true {
		t.Fatalf("options lost in persistence: %s %v", raw, err)
	}
	for _, invalid := range []map[string]any{{"placeId": "https://facebook.com/place"}, {"placeId": strings.Repeat("1", 65)}, {"reelTitle": strings.Repeat("🚲", 256)}, {"isAiGenerated": "true"}, {"coverReference": "publishing/cover.jpg"}} {
		if _, err := Validate(map[string]any{"facebook": invalid}, false); err == nil {
			t.Fatalf("invalid options accepted: %+v", invalid)
		}
	}
	if _, err := Validate(map[string]any{"facebook": map[string]any{"reelTitle": strings.Repeat("🚲", 255)}}, false); err != nil {
		t.Fatal("Unicode title limit counted bytes", err)
	}
}
