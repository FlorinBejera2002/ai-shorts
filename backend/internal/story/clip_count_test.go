package story

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/audiocleanup"
)

func TestClipCountValidationAcceptsAutoAndBounds(t *testing.T) {
	for _, count := range []int{0, 1, 3, MaxClipCount} {
		o := DefaultOptions()
		o.ClipCount = count
		if err := validateClipCount(o); err != nil {
			t.Fatalf("clip count %d rejected: %v", count, err)
		}
	}
	for _, count := range []int{-1, MaxClipCount + 1} {
		o := DefaultOptions()
		o.ClipCount = count
		if err := validateClipCount(o); err == nil {
			t.Fatalf("clip count %d accepted", count)
		}
	}
}

func TestClipCountRejectsMultiClipNarration(t *testing.T) {
	o := DefaultOptions()
	o.Narration, o.ClipCount = true, 3
	if err := validateClipCount(o); err == nil {
		t.Fatal("narration accepted a multi-clip request")
	}
}

func TestClipCountRoundTripsThroughOptionsJSON(t *testing.T) {
	var o Options
	if err := json.Unmarshal([]byte(`{"clip_count":8,"brief":"x","target_seconds":45,"aspect_ratio":"9:16","language":"auto","mode":"smart","captions":true}`), &o); err != nil {
		t.Fatal(err)
	}
	if o.ClipCount != 8 {
		t.Fatalf("clip_count decoded as %d", o.ClipCount)
	}
	raw, err := json.Marshal(DefaultOptions())
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), `"clip_count":0`) {
		t.Fatalf("default options must serialize auto as clip_count 0: %s", raw)
	}
}

func TestResolvedClipCountUsesExplicitCountAndFootageForAuto(t *testing.T) {
	footage := func(seconds ...float64) []Asset {
		assets := make([]Asset, 0, len(seconds))
		for _, s := range seconds {
			assets = append(assets, Asset{ID: testFootageID(len(assets) + 1), Kind: "video", Duration: s})
		}
		return assets
	}
	o := DefaultOptions()
	if got := ResolvedClipCount(o, footage(10)); got != 1 {
		t.Fatalf("short footage auto count = %d, want 1", got)
	}
	if got := ResolvedClipCount(o, footage(300, 300)); got != 5 {
		t.Fatalf("ten minutes of footage auto count = %d, want 5", got)
	}
	if got := ResolvedClipCount(o, footage(250)); got != 2 {
		t.Fatalf("250 seconds auto count = %d, want 2", got)
	}
	excluded := footage(600)
	excluded[0].Include = "excluded"
	if got := ResolvedClipCount(o, excluded); got != 1 {
		t.Fatalf("excluded footage counted toward auto: %d", got)
	}
	o.ClipCount = 7
	if got := ResolvedClipCount(o, footage(10)); got != 7 {
		t.Fatalf("explicit count = %d, want 7", got)
	}
	narrated := DefaultOptions()
	narrated.Narration = true
	if got := ResolvedClipCount(narrated, footage(900)); got != 1 {
		t.Fatalf("narration count = %d, want 1", got)
	}
}

func TestLegacyVersionExposesSingleOutputAsClipZero(t *testing.T) {
	v := Version{Number: 4, Plan: Plan{Title: "Intro"}, Output: Output{Key: "clips/p/story/x/clip.mp4", Duration: 42, Size: 9, Resolution: "1080x1920", Captions: true, ThumbnailKey: "thumb.jpg"}, Timeline: []Entry{{Words: []Word{{Text: "hello"}, {Text: "world"}}}}}
	outputs := v.ClipOutputs()
	if len(outputs) != 1 || outputs[0].Index != 0 || outputs[0].Key != v.Output.Key || outputs[0].DurationSeconds != 42 || outputs[0].Title != "Intro" || outputs[0].TranscriptText != "hello world" {
		t.Fatalf("legacy output not mirrored: %+v", outputs)
	}
	if got := (Version{}).ClipOutputs(); got != nil {
		t.Fatalf("version without output produced clips: %+v", got)
	}
}

func TestExplicitOutputsTakePrecedenceOverLegacyOutput(t *testing.T) {
	v := Version{Number: 2, Output: Output{Key: "clips/p/story/a/clip.mp4"}, Outputs: []ClipOutput{{Index: 0, Key: "a"}, {Index: 1, Key: "b"}}}
	if outputs := v.ClipOutputs(); len(outputs) != 2 || outputs[1].Key != "b" {
		t.Fatalf("outputs = %+v", outputs)
	}
}

func TestClipOutputLibraryRequirements(t *testing.T) {
	complete := ClipOutput{Key: "k", DurationSeconds: 3, Size: 1, Resolution: "1x1"}
	if !complete.Library() {
		t.Fatal("complete output rejected")
	}
	for _, missing := range []ClipOutput{{DurationSeconds: 3, Size: 1, Resolution: "1x1"}, {Key: "k", Size: 1, Resolution: "1x1"}, {Key: "k", DurationSeconds: 3, Resolution: "1x1"}, {Key: "k", DurationSeconds: 3, Size: 1}} {
		if missing.Library() {
			t.Fatalf("incomplete output accepted: %+v", missing)
		}
	}
}

func TestOptionsForAssetsRejectsForeignCleanupSelection(t *testing.T) {
	assets := []Asset{{ID: testFootageID(1), Kind: "video", Name: "a.mp4", Order: 0}, {ID: testFootageID(2), Kind: "narration", Name: "voice.m4a"}}
	o := DefaultOptions()
	o.AudioCleanup = &audiocleanup.Settings{Enabled: true, AssetIDs: []string{testFootageID(1)}}
	if err := ValidateOptionsForAssets(o, assets); err != nil {
		t.Fatalf("own footage selection rejected: %v", err)
	}
	o.AudioCleanup.AssetIDs = []string{testFootageID(9)}
	if err := ValidateOptionsForAssets(o, assets); err == nil {
		t.Fatal("foreign selection accepted")
	}
	o.AudioCleanup.AssetIDs = []string{testFootageID(2)}
	if err := ValidateOptionsForAssets(o, assets); err == nil {
		t.Fatal("narration recording accepted as footage cleanup")
	}
	o.AudioCleanup.AssetIDs = []string{testFootageID(1), testFootageID(1)}
	if err := ValidateOptionsForAssets(o, assets); err == nil {
		t.Fatal("duplicate selection accepted")
	}
	o.AudioCleanup.AssetIDs = []string{"not-an-id"}
	if err := ValidateOptions(o); err == nil {
		t.Fatal("malformed selection accepted")
	}
}

func TestCleanupSelectionRoundTripsThroughOptions(t *testing.T) {
	var o Options
	if err := json.Unmarshal([]byte(`{"audio_cleanup":{"enabled":true,"asset_ids":["`+testFootageID(3)+`"]}}`), &o); err != nil {
		t.Fatal(err)
	}
	if o.AudioCleanup == nil || !o.AudioCleanup.Enabled || len(o.AudioCleanup.AssetIDs) != 1 || o.AudioCleanup.AssetIDs[0] != testFootageID(3) {
		t.Fatalf("selection decoded as %+v", o.AudioCleanup)
	}
	raw, _ := json.Marshal(o)
	if !strings.Contains(string(raw), `"asset_ids":["`+testFootageID(3)+`"]`) {
		t.Fatalf("selection not serialized: %s", raw)
	}
}

// testFootageID returns a canonical UUID-shaped identifier for fixtures, one per n.
func testFootageID(n int) string {
	return fmt.Sprintf("00000000-0000-4000-8000-%012d", n)
}
