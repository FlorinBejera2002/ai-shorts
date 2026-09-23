package scripts

import "testing"

func TestAgentWorkspaceValidationMatchesManualRules(t *testing.T) {
	valid, err := NormalizeWorkspaceInput(WorkspaceInput{Title: "  Draft  "})
	if err != nil || valid.Title != "Draft" || valid.Status != "draft" || valid.TargetDuration != 30 {
		t.Fatalf("defaults: %+v %v", valid, err)
	}
	for _, in := range []WorkspaceInput{{Status: "executing"}, {Platform: "unknown"}, {Language: "xx"}, {TargetDuration: 181}} {
		if _, err := NormalizeWorkspaceInput(in); err == nil {
			t.Fatalf("invalid document accepted: %+v", in)
		}
	}
}
