package story

import "testing"

func TestDynamicRangeDefaultsAndRestyle(t *testing.T) {
	before, err := NormalizeOptions(DefaultOptions())
	if err != nil || before.DynamicRange != "sdr" {
		t.Fatalf("legacy export default changed: %+v %v", before, err)
	}
	hdr := "hdr"
	after, err := ApplyStyle(before, Style{DynamicRange: &hdr})
	if err != nil || after.DynamicRange != "hdr" || after.AspectRatio != before.AspectRatio || after.TargetSeconds != before.TargetSeconds {
		t.Fatalf("HDR style not applied safely: %+v %v", after, err)
	}
	invalid := "arbitrary-native-option"
	if _, err := ApplyStyle(before, Style{DynamicRange: &invalid}); err == nil {
		t.Fatal("invalid dynamic range accepted")
	}
	before.DynamicRange = invalid
	if _, err := NormalizeOptions(before); err == nil {
		t.Fatal("invalid generation dynamic range accepted")
	}
}
