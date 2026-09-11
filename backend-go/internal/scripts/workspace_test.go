package scripts

import "testing"

func TestWorkspaceInputDefaultsAndValidation(t *testing.T) {
	input := WorkspaceInput{Title: "  Campaign launch  "}
	input.defaults()

	if input.Title != "Campaign launch" || input.Status != "draft" || input.Platform != "tiktok" {
		t.Fatalf("unexpected defaults: %#v", input)
	}
	if input.TargetDuration != 30 || input.Language != "en" || input.Snapshot == nil {
		t.Fatalf("workspace defaults are incomplete: %#v", input)
	}
	if !input.valid() {
		t.Fatal("defaulted workspace should be valid")
	}
}

func TestWorkspaceInputRejectsUnsupportedValues(t *testing.T) {
	input := WorkspaceInput{Status: "deleted", Platform: "unknown", Language: "xx", TargetDuration: 5}
	input.defaults()

	if input.valid() {
		t.Fatal("invalid workspace values were accepted")
	}
}
