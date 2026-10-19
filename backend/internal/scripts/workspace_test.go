package scripts

import (
	"context"
	"errors"
	"testing"
)

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

func TestWorkspaceCreateAndUpdateRejectRetiredPlatforms(t *testing.T) {
	for _, platform := range []string{"linkedin", "twitter", "x", "other"} {
		input := WorkspaceInput{Title: "Existing script", Platform: platform}
		if _, err := NormalizeWorkspaceInput(input); !errors.Is(err, ErrWorkspaceInput) {
			t.Fatalf("workspace accepted %q: %v", platform, err)
		}
		// Repository updates also cover restore and internal callers that do not
		// pass through the HTTP handler; rejection must precede database writes.
		if _, err := NewRepository(nil).Update(context.Background(), "user", "script", input, 1, "restore", ""); !errors.Is(err, ErrWorkspaceInput) {
			t.Fatalf("repository update accepted %q: %v", platform, err)
		}
	}
}
