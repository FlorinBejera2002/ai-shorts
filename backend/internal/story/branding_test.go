package story

import (
	"math"
	"testing"
)

func TestBrandOptionsAndArbitraryTargetDuration(t *testing.T) {
	o := DefaultOptions()
	o.TargetSeconds = 35
	o.SubtitleColor = "#ffdd00"
	o.SubtitleFont = "DejaVu Sans"
	o.SubtitlePosition = "top"
	o.SubtitleSize = 42
	if _, err := NormalizeOptions(o); err != nil {
		t.Fatal(err)
	}
	for _, mutate := range []func(*Options){func(o *Options) { o.TargetSeconds = 14 }, func(o *Options) { o.TargetSeconds = 91 }, func(o *Options) { o.SubtitleFont = "Arial,Outline=0" }, func(o *Options) { o.SubtitleColor = "red'" }, func(o *Options) { o.SubtitleSize = 121 }, func(o *Options) { o.SubtitlePosition = "left" }, func(o *Options) { o.LogoResourceID = "brand/other/logo.png" }, func(o *Options) { n := math.NaN(); o.LogoOpacity = &n }} {
		bad := o
		mutate(&bad)
		if ValidateOptions(bad) == nil {
			t.Fatalf("accepted invalid options %#v", bad)
		}
	}
}
