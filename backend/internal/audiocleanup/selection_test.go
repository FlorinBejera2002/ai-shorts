package audiocleanup

import "testing"

func TestSelectsAppliesToAllSourcesWhenNoSelectionIsGiven(t *testing.T) {
	settings := &Settings{Enabled: true}
	if !Selects(settings, "any-source") {
		t.Fatal("an enabled cleanup without a selection must cover every source")
	}
}

func TestSelectsLimitsCleanupToChosenSources(t *testing.T) {
	settings := &Settings{Enabled: true, AssetIDs: []string{"AAA-1"}}
	if !Selects(settings, "aaa-1") {
		t.Fatal("selected source was not matched case-insensitively")
	}
	if Selects(settings, "bbb-2") {
		t.Fatal("unselected source was cleaned")
	}
}

func TestSelectsIsFalseWhenDisabledOrAbsent(t *testing.T) {
	if Selects(nil, "a") || Selects(&Settings{Enabled: false, AssetIDs: []string{"a"}}, "a") {
		t.Fatal("disabled or absent cleanup selected a source")
	}
}
