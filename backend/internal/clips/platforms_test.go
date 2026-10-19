package clips

import (
	"context"
	"encoding/json"
	"slices"
	"testing"
)

func TestClipVariantsExposeOnlySupportedPublishingPlatforms(t *testing.T) {
	h := New(nil, fakeAuth{}, &fakeMedia{}, Config{})
	for _, containsBadge := range []bool{false, true} {
		raw, err := json.Marshal(map[string]any{
			"file_storage_key": "clips/job/video.mp4", "contains_platform_badge": containsBadge,
			"tiktok_file_storage_key": "clips/job/clean.mp4",
		})
		if err != nil {
			t.Fatal(err)
		}
		record, err := h.resolve(context.Background(), raw, false)
		if err != nil {
			t.Fatal(err)
		}
		variants := record["variants"].([]map[string]any)
		wantPrimary := []string{"instagram", "facebook", "youtube"}
		if !containsBadge {
			wantPrimary = append(wantPrimary, "tiktok")
		}
		if len(variants) != 2 || !slices.Equal(variants[0]["platforms"].([]string), wantPrimary) || !slices.Equal(variants[1]["platforms"].([]string), []string{"tiktok"}) {
			t.Fatalf("badge=%t unexpected destinations: %#v", containsBadge, variants)
		}
	}
}
