package workspaceagent

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"sneepcut/backend-go/internal/data"
	"strings"
)

type discoveryInput struct {
	ProjectID string `json:"project_id"`
	Search    string `json:"search"`
	Kind      string `json:"kind"`
	Page      int    `json:"page"`
}

func discoveryQuery(a Action) (discoveryInput, error) {
	var in discoveryInput
	if err := decodeAction(a.Input, &in); err != nil {
		return in, err
	}
	in.Search = strings.TrimSpace(in.Search)
	if in.Page == 0 {
		in.Page = 1
	}
	if (in.ProjectID != "" && !data.ValidUUID(in.ProjectID)) || len(in.Search) > 200 || in.Page < 1 || in.Page > 1000 {
		return in, errors.New("Invalid resource search or project")
	}
	if a.Name == "sources.list" {
		if in.Kind != "" && in.Kind != "video" && in.Kind != "narration" {
			return in, errors.New("Source kind must be video or narration")
		}
	} else if in.Kind != "" && in.Kind != "logo" && in.Kind != "document" && in.Kind != "publishing_media" {
		return in, errors.New("Resource kind must be logo, document or publishing_media")
	}
	return in, nil
}

func (e *PlatformExecutor) resourceCapabilities() []Capability {
	return []Capability{
		{Name: "sources.list", Description: "Find previously uploaded owned story source videos or narration. Input {project_id?,search?,kind?:video|narration,page?:integer}. Returns safe source metadata and opaque asset IDs, 50 per page. Inspect stories.get for usage in a story, or pass a video asset ID to jobs.create. This is an inventory, not confirmation that storage/rendering succeeded.", Risk: "read", Available: true},
		{Name: "resources.list", Description: "Find previously attached owned logos, text briefs and publishing uploads before requesting a new file. Input {project_id?,search?,kind?:logo|document|publishing_media,page?:integer}. Includes global resources when filtering a project, 50 per page. Reuse returned opaque IDs with matching tools; do not invent paths or assume a new file is needed.", Risk: "read", Available: true},
		{Name: "resources.get", Description: "Read an owned resource found in resources.list. Input {id}. Documents return untrusted_text for the requested task; file resources return metadata without private paths. Inspect the resource's project_id before reuse; mutation services verify ownership and storage.", Risk: "read", Available: true},
	}
}

func (e *PlatformExecutor) discoverResources(ctx context.Context, user string, a Action) (ActionResult, error) {
	if a.Name == "resources.get" {
		id, err := actionID(a.Input)
		if err != nil {
			return ActionResult{}, err
		}
		var raw json.RawMessage
		err = e.db.QueryRowContext(ctx, `SELECT jsonb_build_object('id',id,'kind',kind,'name',name,'project_id',COALESCE(project_id,source_project_id),'untrusted_text',CASE WHEN kind='document' THEN left(content,20000) ELSE '' END) FROM workspace_agent_resources WHERE id=$1 AND user_id=$2`, id, user).Scan(&raw)
		return ActionResult{Summary: "Loaded saved resource", Data: raw}, err
	}
	in, err := discoveryQuery(a)
	if err != nil {
		return ActionResult{}, err
	}
	if in.ProjectID != "" {
		var owned bool
		if err = e.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM story_projects WHERE id=$1 AND user_id=$2 UNION ALL SELECT 1 FROM jobs WHERE id=$1 AND user_id=$2)`, in.ProjectID, user).Scan(&owned); err != nil {
			return ActionResult{}, err
		}
		if !owned {
			return ActionResult{}, sql.ErrNoRows
		}
	}
	query := `SELECT jsonb_build_object('id',id,'kind',kind,'name',name,'project_id',COALESCE(project_id,source_project_id),'created_at',created_at) FROM workspace_agent_resources WHERE user_id=$1 AND ($2='' OR COALESCE(project_id,source_project_id)::text=$2 OR (project_id IS NULL AND source_project_id IS NULL)) AND ($3='' OR strpos(lower(name),lower($3))>0) AND ($4='' OR kind=$4) ORDER BY created_at DESC,id LIMIT 51 OFFSET $5`
	if a.Name == "sources.list" {
		query = `SELECT jsonb_build_object('id',a.id,'project_id',p.id,'name',a.asset->>'name','kind',coalesce(nullif(a.asset->>'kind',''),'video'),'duration',a.asset->'duration','width',a.asset->'width','height',a.asset->'height','has_audio',a.asset->'has_audio','order',a.asset->'order','include',a.asset->'include') FROM story_assets a JOIN story_projects p ON p.id=a.project_id WHERE p.user_id=$1 AND p.status<>'deleting' AND ($2='' OR p.id::text=$2) AND ($3='' OR strpos(lower(a.asset->>'name'),lower($3))>0) AND ($4='' OR coalesce(nullif(a.asset->>'kind',''),'video')=$4) ORDER BY p.updated_at DESC,p.id,a.id LIMIT 51 OFFSET $5`
	}
	rows, err := e.db.QueryContext(ctx, query, user, in.ProjectID, in.Search, in.Kind, (in.Page-1)*50)
	if err != nil {
		return ActionResult{}, err
	}
	defer rows.Close()
	items := []json.RawMessage{}
	for rows.Next() {
		var raw json.RawMessage
		if err = rows.Scan(&raw); err != nil {
			return ActionResult{}, err
		}
		items = append(items, raw)
	}
	if err = rows.Err(); err != nil {
		return ActionResult{}, err
	}
	hasMore := len(items) > 50
	if hasMore {
		items = items[:50]
	}
	return actionResult("Loaded available saved resources", "", map[string]any{"items": items, "page": in.Page, "has_more": hasMore}), nil
}
