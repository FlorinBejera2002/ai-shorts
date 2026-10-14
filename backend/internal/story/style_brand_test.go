package story

import (
	"sneepcut/backend-go/internal/captions"
	"testing"
)

func TestApplyStyleSelectingBrandKitClearsPreviousCaptionOverride(t *testing.T) {
	before := DefaultOptions()
	custom := captions.Default()
	custom.Size = .073
	before.CaptionStyle = &custom
	enabled := true
	after, err := ApplyStyle(before, Style{UseBrandKit: &enabled})
	if err != nil {
		t.Fatal(err)
	}
	if !after.UseBrandKit || after.CaptionStyle != nil {
		t.Fatalf("selected kit retained stale caption override: %+v", after)
	}
	if before.CaptionStyle == nil || before.CaptionStyle.Size != .073 {
		t.Fatal("previous saved style was mutated")
	}
}

func TestApplyStyleKeepsExplicitCaptionOverrideAndKitOptOut(t *testing.T) {
	before := DefaultOptions()
	custom := captions.Default()
	custom.Size = .073
	before.CaptionStyle = &custom
	enabled := true
	explicit := captions.Default()
	explicit.Size = .062
	after, err := ApplyStyle(before, Style{UseBrandKit: &enabled, CaptionStyle: &explicit})
	if err != nil || after.CaptionStyle == nil || after.CaptionStyle.Size != .062 {
		t.Fatalf("explicit caption choice was lost: %+v %v", after.CaptionStyle, err)
	}
	disabled := false
	after, err = ApplyStyle(after, Style{UseBrandKit: &disabled})
	if err != nil || after.UseBrandKit || after.CaptionStyle == nil || after.CaptionStyle.Size != .062 {
		t.Fatalf("turning kit off lost the chosen captions: %+v %v", after, err)
	}
}
