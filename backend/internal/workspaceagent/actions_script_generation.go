package workspaceagent

import (
	"context"
	"sneepcut/backend-go/internal/scripts"
)

func (e *PlatformExecutor) generateScript(ctx context.Context, user string, a Action) (ActionResult, error) {
	if a.Name == "scripts.export" {
		id, err := actionID(a.Input)
		if err != nil {
			return ActionResult{}, err
		}
		value, err := e.scripts.Get(ctx, user, id)
		if err != nil {
			return ActionResult{}, err
		}
		return actionResult("Script JSON prepared; use Download to save it to your device", "/dashboard/script-generator", map[string]any{"id": id, "title": value.Title, "filename": "script-" + id + ".json", "document": scriptDocument(value)}), nil
	}
	in := scripts.Request{Platform: "tiktok", Duration: 30, Tone: "entertaining", Language: "en", Style: "talking_head"}
	if err := decodeAction(a.Input, &in); err != nil {
		return ActionResult{}, err
	}
	value, err := scripts.GenerateDraft(ctx, e.generator, in)
	if err != nil {
		return ActionResult{}, err
	}
	return actionResult("Script generated using the script service; save it explicitly before filming", "/dashboard/script-generator", map[string]any{"topic": in.Topic, "snapshot": value, "credits_charged": 0, "saved": false}), nil
}
