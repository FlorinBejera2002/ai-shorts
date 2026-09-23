package workspaceagent

import (
	"context"
	"sneepcut/backend-go/internal/projects"
)

func (e *PlatformExecutor) projectBrandCapabilities() []Capability {
	return []Capability{
		{Name: "projects.brand.read", Description: "Read only this source project's local brand settings and expected_state. Input {id}; does not read or change global brand.", Risk: "read", Available: true},
		{Name: "projects.brand.update", Description: "Patch this source project's local brand only. Input {project_id,expected_state,settings?:{name,primaryColor,secondaryColor,fontFamily,subtitleFont,subtitleColor},logo_resource_id?:owned attached logo UUID or empty string to remove}. Preserve omitted settings. Inspect projects.brand.read first. No private paths or URLs accepted. Supports guarded Undo.", Risk: "write", Available: true},
	}
}
func (e *PlatformExecutor) executeProjectBrand(ctx context.Context, user, request string, a Action) (ActionResult, error) {
	repo := projects.NewRepository(e.db, nil)
	if a.Name == "projects.brand.read" {
		id, err := actionID(a.Input)
		if err != nil {
			return ActionResult{}, err
		}
		state, err := repo.InspectProjectBrand(ctx, user, id)
		return actionResult("Loaded this project's local brand settings", "/dashboard/clips", state), err
	}
	var in projects.ProjectBrandInput
	if err := decodeAction(a.Input, &in); err != nil {
		return ActionResult{}, err
	}
	state, err := repo.ChangeProjectBrand(ctx, user, request, a.Name, in)
	if err != nil {
		return ActionResult{}, err
	}
	out := actionResult("Saved this project's local brand; global brand is unchanged", "/dashboard/clips", state)
	if state.UndoReceiptID != "" {
		out.Undo = actionJSON(Action{Name: "projects.brand.restore", Input: actionJSON(projects.ProjectBrandInput{ProjectID: in.ProjectID, ExpectedState: state.ExpectedState, ReceiptID: state.UndoReceiptID})})
	}
	return out, nil
}
