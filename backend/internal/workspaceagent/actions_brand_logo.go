package workspaceagent

import (
	"context"
	"sneepcut/backend-go/internal/media"
)

func (e *PlatformExecutor) SetBrandMedia(service *media.Service) { e.brandMedia = service }
func (e *PlatformExecutor) brandLogo(ctx context.Context, user, request string, a Action) (ActionResult, error) {
	if e.brandMedia == nil {
		return ActionResult{}, ErrUnavailable
	}
	var in media.AgentLogoInput
	if err := decodeAction(a.Input, &in); err != nil {
		return ActionResult{}, err
	}
	state, err := e.brandMedia.AgentBrandLogo(ctx, user, request, a.Name, in)
	if err != nil {
		return ActionResult{}, err
	}
	summary := "Global brand logo attached; shared image files are retained"
	if !state.HasLogo {
		summary = "Global brand logo detached; shared image files are retained"
	}
	out := actionResult(summary, "/dashboard/brand", state)
	out.Undo = actionJSON(Action{Name: "brand.logo.restore", Input: actionJSON(media.AgentLogoInput{ExpectedState: state.ExpectedState, ReceiptID: state.UndoReceiptID})})
	return out, nil
}
