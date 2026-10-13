package workspaceagent

import (
	"context"
	"encoding/json"
	"errors"
	"sneepcut/backend-go/internal/data"
)

func (e *PlatformExecutor) extendedStudioCapabilities() []Capability {
	available := e.studio != nil
	return []Capability{
		{Name: "studio.layer.remove", Description: "Remove one inspected Studio layer and its associated animation with guarded Undo. Input {id,expected_version,element_id OR hf_id}. Confirm the exact layer; source files remain.", Risk: "external", Available: available},
		{Name: "studio.layer.split", Description: "Split one Studio layer at an absolute composition time, preserving its source and creating a second stable layer. Input {id,expected_version,element_id OR hf_id,split_time}. Requires authored timing; returns verified saved version and Undo.", Risk: "write", Available: available},
		{Name: "studio.assets.list", Description: "List uploaded media/font assets in this owned Studio project. Input {id,page?}. Returns up to 200 opaque asset IDs, names and byte sizes with has_more. A new local file requires the contextual Studio upload control.", Risk: "read", Available: available},
		{Name: "studio.assets.get", Description: "Inspect a Studio asset's content fingerprint, current document version and referencing layers. Input {id,asset_id}. Use before duplication or deletion; never invent paths.", Risk: "read", Available: available},
		{Name: "studio.assets.duplicate", Description: "Duplicate an inspected Studio media/font asset using the existing file service. Input {id,asset_id,expected_version,expected_asset_version}. Exact content is verified; safe request replay.", Risk: "write", Available: available},
		{Name: "studio.assets.rename", Description: "Rename an inspected Studio media/font asset using the existing file service, which updates project references. Input {id,asset_id,expected_version,expected_asset_version,new_name}. Supply a filename with the same extension, not a path. Exact file content and resulting document version are verified; no agent Undo, but the file can be renamed again.", Risk: "write", Available: available},
		{Name: "studio.assets.delete", Description: "Delete an inspected Studio media/font asset. Input {id,asset_id,expected_version,expected_asset_version}. Confirm exact file and affected layers; referenced layers may lose their media. Source files outside this Studio project remain. No agent Undo.", Risk: "external", Available: available},
		{Name: "studio.renders.list", Description: "List actual saved renders in an owned Studio project with their verified status and sizes. Input {id}.", Risk: "read", Available: available},
		{Name: "studio.export", Description: "Verify an existing completed Studio render and prepare its download. Input {id,job_id} from studio.renders.list. Output must exist, be nonempty and pass renderer verification; no claim of saving on the user's device.", Risk: "read", Available: available},
		{Name: "studio.renders.delete", Description: "Delete one inspected completed, verified Studio render. Input {id,job_id}. Active, cancelled or failed render cleanup must be handled in Studio; this tool never races a stopping worker. Confirm exact output; composition and source assets remain. No Undo.", Risk: "external", Available: available},
	}
}

func (e *PlatformExecutor) studioApproval(ctx context.Context, user string, a Action) (json.RawMessage, error) {
	if e.studio == nil {
		return nil, ErrUnavailable
	}
	var in struct {
		ID                   string `json:"id"`
		ExpectedVersion      string `json:"expected_version"`
		ExpectedAssetVersion string `json:"expected_asset_version"`
		ElementID            string `json:"element_id"`
		HFID                 string `json:"hf_id"`
		AssetID              string `json:"asset_id"`
		JobID                string `json:"job_id"`
	}
	if err := decodeAction(a.Input, &in); err != nil {
		return nil, err
	}
	if !data.ValidUUID(in.ID) {
		return nil, errors.New("Inspect an owned Studio project first")
	}
	read := Action{Name: "studio.get", Input: actionJSON(map[string]any{"id": in.ID})}
	if a.Name == "studio.assets.delete" {
		read = Action{Name: "studio.assets.get", Input: actionJSON(map[string]any{"id": in.ID, "asset_id": in.AssetID})}
	} else if a.Name == "studio.renders.delete" {
		read = Action{Name: "studio.renders.list", Input: actionJSON(map[string]any{"id": in.ID})}
	}
	raw, err := e.studio.call(ctx, user, "", read)
	if err != nil {
		return nil, err
	}
	var current struct {
		Version            string           `json:"version"`
		Title              string           `json:"title"`
		Layers             []map[string]any `json:"layers"`
		Asset              map[string]any   `json:"asset"`
		UsedBy             []map[string]any `json:"used_by"`
		ReferencesComplete bool             `json:"references_complete"`
		ReferenceWarning   string           `json:"reference_warning"`
		Renders            []map[string]any `json:"renders"`
	}
	if err = json.Unmarshal(raw, &current); err != nil {
		return nil, err
	}
	preview := map[string]any{"action": a.Name, "project_id": in.ID, "title": current.Title, "expected_version": current.Version}
	switch a.Name {
	case "studio.layer.remove":
		if current.Version != in.ExpectedVersion || (in.ElementID == "") == (in.HFID == "") {
			return nil, errors.New("Studio layer or document changed; inspect it again")
		}
		var matched []map[string]any
		for _, layer := range current.Layers {
			if (in.ElementID != "" && layer["id"] == in.ElementID) || (in.HFID != "" && layer["hf_id"] == in.HFID) {
				matched = append(matched, layer)
			}
		}
		if len(matched) != 1 {
			return nil, errors.New("Studio layer is missing or ambiguous")
		}
		preview["layer"], preview["effect"] = matched[0], "Remove this layer and its associated animation. Original media remains; guarded Undo is available."
	case "studio.assets.delete":
		if current.Version != in.ExpectedVersion || current.Asset["expected_asset_version"] != in.ExpectedAssetVersion || current.Asset["asset_id"] != in.AssetID {
			return nil, errors.New("Studio asset or document changed; inspect it again")
		}
		preview["asset"], preview["affected_layers"], preview["effect"] = current.Asset, current.UsedBy, "Delete this Studio asset. Referencing layers will lose this media. Composition and original uploads outside Studio remain. No agent Undo."
		preview["irreversible"] = true
		preview["references_complete"], preview["reference_warning"] = current.ReferencesComplete, current.ReferenceWarning
	case "studio.renders.delete":
		var target map[string]any
		for _, render := range current.Renders {
			if render["id"] == in.JobID {
				target = render
			}
		}
		if target == nil {
			return nil, errors.New("Studio render is unavailable")
		}
		if target["status"] != "complete" {
			return nil, errors.New("Only completed Studio renders can be deleted by the agent; manage active or interrupted renders in Studio")
		}
		preview["render"], preview["effect"], preview["irreversible"] = target, "Delete this saved Studio render. Composition and source assets remain. No Undo.", true
	}
	return actionJSON(preview), nil
}
