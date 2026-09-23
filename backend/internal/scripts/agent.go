package scripts

import "reflect"

// NormalizeWorkspaceInput shares manual workspace validation with agent callers.
func NormalizeWorkspaceInput(input WorkspaceInput) (WorkspaceInput, error) {
	input.defaults()
	if !input.valid() {
		return input, ErrWorkspaceInput
	}
	return input, nil
}

func sameWorkspaceInput(record ScriptRecord, input WorkspaceInput) bool {
	return reflect.DeepEqual(WorkspaceInput{Title: record.Title, Status: record.Status, Topic: record.Topic, Platform: record.Platform, Language: record.Language, TargetDuration: record.TargetDuration, Tone: record.Tone, Style: record.Style, Audience: record.Audience, Snapshot: record.Snapshot}, input)
}
