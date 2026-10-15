package story

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestRestyleOutputShapePreservesNarrativeSettings(t *testing.T) {
	before := DefaultOptions()
	before.Brief = "Keep the original speech and ending"
	before.TargetSeconds = 60
	for _, shape := range []string{"1:1", "16:9", "4:5"} {
		after, err := ApplyStyle(before, Style{AspectRatio: &shape})
		if err != nil {
			t.Fatal(err)
		}
		if after.AspectRatio != shape {
			t.Fatalf("shape not applied: %+v", after)
		}
		after.AspectRatio = before.AspectRatio
		after.AspectRatioRevised = before.AspectRatioRevised
		after.CaptionMode = before.CaptionMode
		if !reflect.DeepEqual(before, after) {
			t.Fatalf("format changed narrative settings: %+v", after)
		}
	}
}

func TestRestyleFormatSupersedesOnlyOriginalFormatInstruction(t *testing.T) {
	before := DefaultOptions()
	before.Brief = "Format: 9:16. No captions. Keep the original voice and pauses."
	if _, err := NormalizeOptions(before); err != nil {
		t.Fatal(err)
	}
	shape := "1:1"
	after, err := ApplyStyle(before, Style{AspectRatio: &shape})
	if err != nil || !after.AspectRatioRevised || after.Brief != before.Brief {
		t.Fatalf("format revision lost the original request: %+v %v", after, err)
	}
	// The queue and accepted version both persist options as JSON before the
	// next validation. The later format choice must survive that round trip.
	raw, err := json.Marshal(after)
	if err != nil {
		t.Fatal(err)
	}
	var saved Options
	if err := json.Unmarshal(raw, &saved); err != nil {
		t.Fatal(err)
	}
	if _, err := NormalizeOptions(saved); err != nil {
		t.Fatalf("intentional format revision blocked: %v", err)
	}
	brief := BuildEditingBrief(Request{Options: saved})
	if !brief.SelectedSettings.AspectRatioRevised || brief.SelectedSettings.AspectRatio != shape || brief.OriginalRequest != before.Brief {
		t.Fatalf("review lost the format revision: %+v", brief)
	}
	saved.AspectRatioRevised = false
	if _, err := NormalizeOptions(saved); err == nil {
		t.Fatal("unrevised format conflict accepted")
	}
	saved = after
	saved.TargetSeconds = 30
	saved.Brief = before.Brief + " Duration: 45 seconds."
	if _, err := NormalizeOptions(saved); err == nil {
		t.Fatal("format revision bypassed duration conflict")
	}
	saved = after
	saved.CaptionMode = "all"
	if _, err := NormalizeOptions(saved); err == nil {
		t.Fatal("format revision bypassed caption conflict")
	}
}

func TestRestyleRejectsUnsupportedShape(t *testing.T) {
	before := DefaultOptions()
	for _, shape := range []string{"", "0:0", "100:1", "original"} {
		after, err := ApplyStyle(before, Style{AspectRatio: &shape})
		if err == nil || !reflect.DeepEqual(before, after) {
			t.Fatalf("invalid shape accepted: %q", shape)
		}
	}
}
