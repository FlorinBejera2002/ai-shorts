package processing

import (
	"encoding/json"
	"sneepcut/backend-go/internal/story"
	"sort"
)

type studioEffectiveTimeline struct {
	ManuallyEdited bool `json:"manually_edited"`
	Scenes         []struct {
		ID               string  `json:"id"`
		CanonicalSceneID string  `json:"canonical_scene_id"`
		AssetID          string  `json:"asset_id"`
		Start            float64 `json:"start"`
		Duration         float64 `json:"duration"`
		SourceIn         float64 `json:"source_in"`
		PlaybackRate     float64 `json:"playback_rate"`
	} `json:"scenes"`
}

// Only proven source anchors are projected. Arbitrary manually added layers stay
// in Studio and are explicitly subject to human review rather than invented ASR.
func studioStoryTimeline(raw json.RawMessage, request story.Request, version story.Version, plan studioPlan) (bool, []story.Entry) {
	var effective studioEffectiveTimeline
	if len(raw) == 0 || json.Unmarshal(raw, &effective) != nil || !effective.ManuallyEdited {
		return false, nil
	}
	entries := map[string]story.Entry{}
	for i, scene := range plan.Scenes {
		if i < len(version.Timeline) {
			entries[scene.ID] = version.Timeline[i]
		}
	}
	sources := map[string]string{}
	for _, asset := range request.Assets {
		sources["asset-"+storyDigest(asset.Key)[:20]] = asset.ID
	}
	var timeline []story.Entry
	for _, scene := range effective.Scenes {
		entry, ok := entries[scene.CanonicalSceneID]
		sourceID := sources[scene.AssetID]
		if !ok || sourceID == "" || !finite(scene.Start) || !finite(scene.Duration) || !finite(scene.SourceIn) || scene.Start < 0 || scene.Duration <= 0 || scene.SourceIn < 0 {
			continue
		}
		rate := scene.PlaybackRate
		if !finite(rate) || rate <= 0 {
			rate = 1
		}
		entry.OutputIn, entry.OutputOut = scene.Start, scene.Start+scene.Duration
		entry.Video = story.Interval{SourceID: sourceID, In: scene.SourceIn, Out: scene.SourceIn + scene.Duration*rate}
		entry.Audio, entry.Words = nil, nil
		timeline = append(timeline, entry)
	}
	sort.SliceStable(timeline, func(i, j int) bool { return timeline[i].OutputIn < timeline[j].OutputIn })
	return true, timeline
}
