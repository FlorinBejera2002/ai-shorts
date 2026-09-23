package workspaceagent

import "errors"

func openWorkspace(action Action) (ActionResult, error) {
	var in struct {
		Page string `json:"page"`
	}
	if err := decodeAction(action.Input, &in); err != nil {
		return ActionResult{}, err
	}
	routes := map[string]string{"home": "/dashboard", "create": "/dashboard/create", "clips": "/dashboard/clips", "scripts": "/dashboard/script-generator", "studio": "/dashboard/studio", "brand": "/dashboard/brand", "publish": "/dashboard/publish", "calendar": "/dashboard/calendar", "settings": "/dashboard/settings", "billing": "/dashboard/billing"}
	route, ok := routes[in.Page]
	if !ok {
		return ActionResult{}, errors.New("Choose a supported workspace page")
	}
	return actionResult("Page is ready to open", route, map[string]any{"page": in.Page}), nil
}
