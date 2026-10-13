package workspaceagent

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sneepcut/backend-go/internal/data"
	"strings"
)

type studioResourceInventory interface {
	StudioAssetIDs(context.Context, string, string) ([]string, error)
}

// Inventory is read through the same signed, account-scoped bridge as Studio
// actions. Client upload notifications only request a recheck; they are not proof.
func (e *PlatformExecutor) StudioAssetIDs(ctx context.Context, user, project string) ([]string, error) {
	if e.studio == nil {
		return nil, fmt.Errorf("%w Studio service is not connected.", ErrUnavailable)
	}
	if !data.ValidUUID(project) {
		return nil, errors.New("Invalid Studio resource target")
	}
	ids := []string{}
	seen := map[string]bool{}
	for page := 1; page <= 10; page++ {
		raw, err := e.studio.call(ctx, user, "", Action{Name: "studio.assets.list", Input: actionJSON(map[string]any{"id": project, "page": page})})
		if err != nil {
			return nil, err
		}
		var current struct {
			ID      string `json:"id"`
			Page    int    `json:"page"`
			HasMore bool   `json:"has_more"`
			Assets  []struct {
				ID   string `json:"asset_id"`
				Size int64  `json:"size"`
			} `json:"assets"`
		}
		if err := json.Unmarshal(raw, &current); err != nil || current.ID != project || current.Page != page || len(current.Assets) > 200 {
			return nil, errors.New("Studio returned an invalid resource inventory")
		}
		for _, asset := range current.Assets {
			if decoded, err := hex.DecodeString(asset.ID); err != nil || len(decoded) != 32 || seen[asset.ID] || asset.Size < 0 {
				return nil, errors.New("Studio resource inventory changed; inspect the project again")
			}
			seen[asset.ID] = true
			if asset.Size > 0 {
				ids = append(ids, asset.ID)
			}
		}
		if !current.HasMore {
			return ids, nil
		}
	}
	return nil, errors.New("Studio has too many assets to verify this upload; manage uploads in Studio")
}

func (h *Handler) waitForStudioResources(ctx context.Context, r *Run, needs []ResourceNeed) error {
	reader, ok := h.executor.(studioResourceInventory)
	if !ok {
		return fmt.Errorf("%w Studio service is not connected.", ErrUnavailable)
	}
	target := ""
	for _, need := range needs {
		if need.Kind != "studio_asset" || len(need.Label) > 400 {
			return errors.New("Request Studio files separately from other resource kinds")
		}
		if need.TargetID != "" {
			if target != "" && target != need.TargetID {
				return errors.New("Request Studio files for one composition at a time")
			}
			target = need.TargetID
		}
	}
	if target == "" && strings.HasPrefix(r.Context.Route, "/dashboard/studio") {
		target = r.Context.ProjectID
	}
	if !data.ValidUUID(target) {
		return errors.New("Inspect a Studio composition before requesting files")
	}
	ids, err := reader.StudioAssetIDs(ctx, r.UserID, target)
	if err != nil {
		return err
	}
	for i := range needs {
		needs[i].TargetID = target
		// Always replace planner-supplied values with an authoritative snapshot.
		needs[i].ExistingAssetIDs = append([]string{}, ids...)
	}
	r.Context.ProjectID, r.Context.Route = target, studioRoute(target)
	r.Context.ClipID, r.Context.StoryStep = "", ""
	r.MissingResources, r.Status, r.Action = needs, "waiting_for_resources", nil
	return nil
}

func (h *Handler) studioResourcesReady(ctx context.Context, r *Run, need ResourceNeed) error {
	reader, ok := h.executor.(studioResourceInventory)
	if !ok {
		return errors.New("Studio resource verification is unavailable")
	}
	if !data.ValidUUID(need.TargetID) || need.TargetID != r.Context.ProjectID {
		return errors.New("Studio resource target changed; inspect the composition again")
	}
	current, err := reader.StudioAssetIDs(ctx, r.UserID, need.TargetID)
	if err != nil {
		return err
	}
	existing := map[string]bool{}
	for _, id := range need.ExistingAssetIDs {
		existing[id] = true
	}
	for _, id := range current {
		if !existing[id] {
			return nil
		}
	}
	return errors.New("The requested Studio files have not finished uploading")
}
