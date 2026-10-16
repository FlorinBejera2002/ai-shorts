package story

import (
	"fmt"
	"testing"
)

func TestLargeCollectionsRetainEveryAssetAndTimelineEntry(t *testing.T) {
	for _, n := range []int{80, 125, 250} {
		t.Run(fmt.Sprint(n), func(t *testing.T) {
			var assets []Asset
			plan := Plan{}
			for i := 0; i < n; i++ {
				id := fmt.Sprintf("source-%d", i)
				candidate := id + "-moment"
				assets = append(assets, Asset{ID: id, Key: id + ".mp4", Order: i, Size: 1024, Duration: .2, Width: 160, Height: 90, Candidates: []Candidate{{ID: candidate, SourceID: id, In: 0, Out: .2}}})
				plan.Blocks = append(plan.Blocks, Block{ID: id, CandidateID: candidate})
			}
			if err := ValidateAssets(assets, DefaultLimits()); err != nil {
				t.Fatal(err)
			}
			timeline, err := BuildTimeline(plan, assets)
			if err != nil || len(timeline) != n {
				t.Fatalf("source omitted: %d %v", len(timeline), err)
			}
			for i, entry := range timeline {
				if entry.Video.SourceID != assets[i].ID {
					t.Fatal("source order changed", i)
				}
			}
			limits := DefaultLimits()
			limits.MaxTotalBytes = 1024
			if ValidateAssets(assets, limits) == nil {
				t.Fatal("byte resource budget bypassed")
			}
			limits = DefaultLimits()
			limits.MaxTotalSeconds = 1
			if ValidateAssets(assets, limits) == nil {
				t.Fatal("duration resource budget bypassed")
			}
		})
	}
}
func TestObsoleteFileCountSettingDoesNotChangeResourceBudgets(t *testing.T) {
	limits, err := LimitsFromEnv(func(key string) string {
		if key == "STORY_MAX_FILES" {
			return "20"
		}
		return ""
	})
	if err != nil || limits.MaxFiles != 0 || limits.MaxTotalBytes <= 0 || limits.MaxTotalSeconds <= 0 {
		t.Fatal(limits, err)
	}
}
