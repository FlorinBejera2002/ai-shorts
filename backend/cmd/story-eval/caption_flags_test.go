package main

import (
	"io"
	"testing"

	"sneepcut/backend-go/internal/story"
)

func TestCaptionModeFlagsAndReplay(t *testing.T) {
	for _, mode := range []string{"all", "selective", "off"} {
		cfg, err := parseFlags([]string{"-input", "fixtures", "-output", "results", "-caption-mode", mode}, io.Discard)
		if err != nil {
			t.Fatal(err)
		}
		if cfg.options.CaptionMode != mode || cfg.options.Captions != (mode != "off") {
			t.Fatalf("caption mode lost: %+v", cfg.options)
		}
		previous := story.DefaultOptions()
		previous.CaptionMode, previous.Captions = "all", true
		if got := replayOptions(previous, cfg); got.CaptionMode != mode || got.Captions != (mode != "off") {
			t.Fatalf("replay ignored explicit mode: %+v", got)
		}
	}
	if _, err := parseFlags([]string{"-input", "fixtures", "-output", "results", "-captions=false", "-caption-mode", "all"}, io.Discard); err == nil {
		t.Fatal("conflicting flags accepted")
	}
	cfg, err := parseFlags([]string{"-input", "fixtures", "-output", "results", "-captions=false"}, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	previous := story.Options{Captions: true, CaptionMode: "selective"}
	if got := replayOptions(previous, cfg); got.Captions || got.CaptionMode != "off" {
		t.Fatalf("legacy override retained selective captions: %+v", got)
	}
}

func TestReplayCaptionRevisionPreservesOriginalBrief(t *testing.T) {
	previous := story.DefaultOptions()
	previous.Brief = "No captions."
	previous.CaptionMode = "off"
	cfg := evalFlags{options: story.Options{CaptionMode: "all", Captions: true}, explicit: map[string]bool{"caption-mode": true}}
	revised := replayOptions(previous, cfg)
	if _, err := story.NormalizeOptions(revised); err != nil || !revised.CaptionModeRevised || revised.Brief != previous.Brief {
		t.Fatalf("intentional caption revision rejected or rewrote original: %+v %v", revised, err)
	}
	cfg.explicit["brief-file"] = true
	cfg.options.Brief = "No captions. Keep the entire source."
	if _, err := story.NormalizeOptions(replayOptions(revised, cfg)); err == nil {
		t.Fatal("new conflicting brief retained the previous caption override")
	}
}
