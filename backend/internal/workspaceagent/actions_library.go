package workspaceagent

import (
	"context"
	"database/sql"
	"encoding/json"
	"sneepcut/backend-go/internal/projects"
)

func (e *PlatformExecutor) libraryCapabilities() []Capability {
	return []Capability{
		{Name: "library.get", Description: "Inspect a project's folders, clip membership and expected_state. Input {id} with the source project/job ID.", Risk: "read", Available: true},
		{Name: "folders.create", Description: "Create a folder in an inspected project. Input {project_id,expected_state,name,parent_id:null|folderID}. Does not create or alter video files.", Risk: "write", Available: true},
		{Name: "folders.update", Description: "Rename/reparent a folder. Input {project_id,id,expected_state,name,parent_id:null|folderID}; use stable folder IDs from library.get. Cannot create cycles or cross project boundaries.", Risk: "write", Available: true},
		{Name: "folders.delete", Description: "Delete a folder only; its clips and child folders move to the parent. Input {project_id,id,expected_state}. Inspect the exact affected items first. Does not delete video files. No Undo for deletion.", Risk: "external", Available: true},
		{Name: "clips.move", Description: "Move a clip into a folder of its EXISTING source project, or root. Input {project_id,id,expected_state,folder_id:null|folderID}. Never moves across source jobs. Inspect library.get first.", Risk: "write", Available: true},
	}
}
func (e *PlatformExecutor) libraryApproval(ctx context.Context, user string, a Action) (json.RawMessage, error) {
	var in projects.LibraryInput
	if err := decodeAction(a.Input, &in); err != nil {
		return nil, err
	}
	state, err := projects.NewRepository(e.db, nil).InspectLibrary(ctx, user, in.ProjectID)
	if err != nil {
		return nil, err
	}
	if state.ExpectedState != in.ExpectedState {
		return nil, projects.ErrLibraryChanged
	}
	var folder *projects.LibraryFolder
	children := []projects.LibraryFolder{}
	clips := []projects.LibraryClip{}
	for i := range state.Folders {
		f := state.Folders[i]
		if f.ID == in.ID {
			folder = &f
		}
		if f.ParentID != nil && *f.ParentID == in.ID {
			children = append(children, f)
		}
	}
	if folder == nil {
		return nil, sql.ErrNoRows
	}
	for _, c := range state.Clips {
		if c.FolderID != nil && *c.FolderID == in.ID {
			clips = append(clips, c)
		}
	}
	return actionJSON(map[string]any{"action": a.Name, "project_id": in.ProjectID, "project_name": state.Name, "folder": folder, "children": children, "clips": clips, "children_count": len(children), "clips_count": len(clips), "effect": "Remove this folder; move its direct child folders and clips to its parent. Video files remain unchanged.", "expected_state": state.ExpectedState}), nil
}
func (e *PlatformExecutor) executeLibrary(ctx context.Context, user, request string, a Action) (ActionResult, error) {
	repo := projects.NewRepository(e.db, nil)
	if a.Name == "library.get" {
		id, err := actionID(a.Input)
		if err != nil {
			return ActionResult{}, err
		}
		state, err := repo.InspectLibrary(ctx, user, id)
		return actionResult("Loaded project folders and clip membership", "/dashboard/clips", state), err
	}
	var in projects.LibraryInput
	if err := decodeAction(a.Input, &in); err != nil {
		return ActionResult{}, err
	}
	result, err := repo.ChangeLibrary(ctx, user, request, a.Name, in)
	if err != nil {
		return ActionResult{}, err
	}
	out := actionResult("Project library changes saved; video sources are unchanged", "/dashboard/clips", result.LibrarySnapshot)
	if result.UndoInput != nil {
		out.Undo = actionJSON(Action{Name: result.UndoAction, Input: actionJSON(result.UndoInput)})
	}
	return out, nil
}
