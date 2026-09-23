package workspaceagent

import (
	"context"
	"sneepcut/backend-go/internal/brand"
)

func (e *PlatformExecutor) updateBrand(ctx context.Context, user, request string, a Action) (ActionResult, error) {
	var in struct {
		ExpectedState string         `json:"expected_state"`
		Settings      map[string]any `json:"settings"`
	}
	if err := decodeAction(a.Input, &in); err != nil {
		return ActionResult{}, err
	}
	state, err := brand.NewRepository(e.db).AgentUpdate(ctx, user, brand.AgentUpdate{RequestID: request, ExpectedState: in.ExpectedState, Settings: in.Settings})
	if err != nil {
		return ActionResult{}, err
	}
	previous := state.Previous
	state.Previous = nil
	result := actionResult("Saved and verified brand settings", "/dashboard/brand", state)
	result.Undo = actionJSON(Action{Name: "brand.restore", Input: actionJSON(map[string]any{"expected_state": state.ExpectedState, "settings": previous})})
	return result, nil
}
