package workspaceagent

import (
	"context"
	"encoding/json"
	"sneepcut/backend-go/internal/account"
)

func (e *PlatformExecutor) settings(ctx context.Context, user, request string, a Action) (ActionResult, error) {
	if a.Name == "settings.preferences.read" {
		if err := decodeAction(a.Input, &struct{}{}); err != nil {
			return ActionResult{}, err
		}
		value, err := account.AgentReadPreferences(ctx, e.db, user)
		return actionResult("Loaded your saved application preferences", "/dashboard/settings", value), err
	}
	if a.Name == "settings.preferences.update" {
		var in struct {
			ExpectedState string          `json:"expected_state"`
			Preferences   json.RawMessage `json:"preferences"`
		}
		if err := decodeAction(a.Input, &in); err != nil {
			return ActionResult{}, err
		}
		value, err := account.AgentPatchPreferences(ctx, e.db, user, request, in.ExpectedState, in.Preferences)
		if err != nil {
			return ActionResult{}, err
		}
		previous := value.Previous
		value.Previous = nil
		result := actionResult("Application preferences saved and verified", "/dashboard/settings", value)
		result.Undo = actionJSON(Action{Name: "settings.preferences.update", Input: actionJSON(map[string]any{"expected_state": value.ExpectedState, "preferences": previous})})
		return result, nil
	}
	if a.Name == "settings.read" {
		if err := decodeAction(a.Input, &struct{}{}); err != nil {
			return ActionResult{}, err
		}
		profile, err := account.AgentReadProfile(ctx, e.db, user)
		return actionResult("Loaded your editable profile preferences", "/dashboard/settings", profile), err
	}
	var in struct {
		ExpectedState string  `json:"expected_state"`
		Name          *string `json:"name"`
	}
	if err := decodeAction(a.Input, &in); err != nil {
		return ActionResult{}, err
	}
	profile, err := account.AgentUpdateProfile(ctx, e.db, user, request, in.ExpectedState, in.Name, a.Name == "settings.restore")
	if err != nil {
		return ActionResult{}, err
	}
	previous := profile.Previous
	profile.Previous = nil
	result := actionResult("Profile name saved and verified", "/dashboard/settings", profile)
	result.Undo = actionJSON(Action{Name: "settings.restore", Input: actionJSON(map[string]any{"expected_state": profile.ExpectedState, "name": previous})})
	return result, nil
}
