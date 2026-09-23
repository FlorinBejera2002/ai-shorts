package workspaceagent

import (
	"context"
	"sneepcut/backend-go/internal/brand"
	"sneepcut/backend-go/internal/projects"
	"time"
)

type projectRename struct {
	ID                string    `json:"id"`
	Name              *string   `json:"name"`
	ExpectedUpdatedAt time.Time `json:"expected_updated_at"`
}

func (e *PlatformExecutor) renameProject(ctx context.Context, user, requestID string, a Action) (ActionResult, error) {
	var in projectRename
	if err := decodeAction(a.Input, &in); err != nil {
		return ActionResult{}, err
	}
	repo := projects.NewRepository(e.db, nil)
	result, err := repo.RenameConditional(ctx, user, in.ID, requestID, projects.RenameInput{Name: in.Name, ExpectedUpdatedAt: in.ExpectedUpdatedAt, Restore: a.Name == "projects.restore"})
	if err != nil {
		return ActionResult{}, err
	}
	out := actionResult("Project name saved", "/dashboard/clips", result)
	out.Undo = actionJSON(Action{Name: "projects.restore", Input: actionJSON(projectRename{ID: in.ID, Name: result.PreviousName, ExpectedUpdatedAt: result.UpdatedAt})})
	return out, nil
}
func (e *PlatformExecutor) readBrand(ctx context.Context, user string, a Action) (ActionResult, error) {
	if err := decodeAction(a.Input, &struct{}{}); err != nil {
		return ActionResult{}, err
	}
	state, err := brand.NewRepository(e.db).AgentRead(ctx, user)
	return actionResult("Loaded saved brand settings", "/dashboard/brand", state), err
}
