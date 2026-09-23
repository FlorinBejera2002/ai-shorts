package workspaceagent

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/stories"
	"strings"
	"time"
)

// Only explicit presentation fields reach the model. Storage references and
// provider credentials never belong in workspace context.
func safeStory(p stories.Project) map[string]any {
	assets := []map[string]any{}
	for _, a := range p.Assets {
		assets = append(assets, map[string]any{"id": a.ID, "name": a.Name, "duration": a.Duration, "order": a.Order, "role": a.Role, "include": a.Include})
	}
	versions := []map[string]any{}
	for _, v := range p.Versions[max(0, len(p.Versions)-5):] {
		blocks := v.Plan.Blocks[:min(len(v.Plan.Blocks), 40)]
		issues := v.Report.Issues[:min(len(v.Report.Issues), 20)]
		versions = append(versions, map[string]any{"number": v.Number, "accepted": v.Accepted, "title": v.Plan.Title, "summary": v.Plan.Summary, "blocks": blocks, "review_status": v.Report.Status, "issues": issues, "coverage": v.Report.Coverage})
	}
	return map[string]any{"id": p.ID, "status": p.Status, "message": p.Message, "options": p.Options, "current_version": p.CurrentVersion, "assets": assets, "versions": versions}
}

func (e *PlatformExecutor) inspectedStory(ctx context.Context, user, id string) (map[string]any, error) {
	before, err := e.stories.AgentState(ctx, user, id)
	if err != nil {
		return nil, err
	}
	p, err := e.stories.Get(ctx, user, id)
	if err != nil {
		return nil, err
	}
	after, err := e.stories.AgentState(ctx, user, id)
	if err != nil {
		return nil, err
	}
	if before != after {
		return nil, stories.ErrConflict
	}
	result := safeStory(p)
	result["expected_state"] = before
	return result, nil
}
func (e *PlatformExecutor) projectSummaries(ctx context.Context, user string) ([]map[string]any, error) {
	rows, err := e.db.QueryContext(ctx, `SELECT j.id,COALESCE(NULLIF(j.project_name,''),'Untitled project'),j.status,(SELECT count(*) FROM clips c WHERE c.job_id=j.id AND c.user_id=$1),j.updated_at FROM jobs j WHERE j.user_id=$1 ORDER BY j.updated_at DESC LIMIT 30`, user)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, status string
		var count int
		var updated time.Time
		if err = rows.Scan(&id, &name, &status, &count, &updated); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{"id": id, "name": name, "status": status, "clips": count, "updated_at": updated})
	}
	return out, rows.Err()
}
func (e *PlatformExecutor) analytics(ctx context.Context, user string) (map[string]any, error) {
	var credits, projects, clips, scriptsCount int
	err := e.db.QueryRowContext(ctx, `SELECT credits,(SELECT count(*) FROM jobs WHERE user_id=$1),(SELECT count(*) FROM clips WHERE user_id=$1),(SELECT count(*) FROM scripts WHERE user_id=$1 AND archived_at IS NULL) FROM users WHERE id=$1`, user).Scan(&credits, &projects, &clips, &scriptsCount)
	return map[string]any{"credits": credits, "projects": projects, "clips": clips, "scripts": scriptsCount}, err
}
func (e *PlatformExecutor) Context(ctx context.Context, user string, scope Scope) (json.RawMessage, error) {
	if (scope.ProjectID != "" && !data.ValidUUID(scope.ProjectID)) || (scope.ClipID != "" && !data.ValidUUID(scope.ClipID)) {
		return nil, sql.ErrNoRows
	}
	projects, err := e.projectSummaries(ctx, user)
	if err != nil {
		return nil, err
	}
	storySummaries, err := e.contextInventory(ctx, user, true)
	if err != nil {
		return nil, err
	}
	summaries, err := e.contextInventory(ctx, user, false)
	if err != nil {
		return nil, err
	}
	out := map[string]any{"route": scope.Route, "projects": projects, "stories": storySummaries, "scripts": summaries}
	studioScope := strings.HasSuffix(strings.Split(scope.Route, "?")[0], "/dashboard/studio")
	if studioScope && data.ValidUUID(scope.ProjectID) {
		if e.studio == nil {
			return nil, fmt.Errorf("Studio service is not connected")
		}
		selected, err := e.studio.call(ctx, user, "", Action{Name: "studio.get", Input: actionJSON(map[string]any{"id": scope.ProjectID})})
		if err != nil {
			return nil, err
		}
		out["selected_studio"] = selected
		if len(scope.StudioSelection) > 0 {
			var document struct {
				Layers []struct {
					ID   string `json:"id"`
					HFID string `json:"hf_id"`
				} `json:"layers"`
			}
			if err = json.Unmarshal(selected, &document); err != nil {
				return nil, err
			}
			for _, id := range scope.StudioSelection {
				matches := 0
				for _, layer := range document.Layers {
					if layer.ID == id || layer.HFID == id {
						matches++
					}
				}
				if matches != 1 {
					return nil, fmt.Errorf("Studio selection changed; select the current layer again")
				}
			}
			out["selected_studio_layers"] = scope.StudioSelection
		}
	} else if data.ValidUUID(scope.ProjectID) {
		// Scope is client supplied. An unknown or another user's target fails closed.
		var owned bool
		err = e.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM story_projects WHERE id=$1 AND user_id=$2)`, scope.ProjectID, user).Scan(&owned)
		if err != nil {
			return nil, err
		}
		if owned {
			selected, err := e.inspectedStory(ctx, user, scope.ProjectID)
			if err != nil {
				return nil, err
			}
			out["selected_story"] = selected
		} else {
			err = e.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM jobs WHERE id=$1 AND user_id=$2)`, scope.ProjectID, user).Scan(&owned)
			if err != nil {
				return nil, err
			}
			if !owned {
				return nil, sql.ErrNoRows
			}
		}
	}
	if data.ValidUUID(scope.ClipID) {
		var title string
		var duration float64
		err = e.db.QueryRowContext(ctx, `SELECT title,duration FROM clips WHERE id=$1 AND user_id=$2`, scope.ClipID, user).Scan(&title, &duration)
		if err == nil {
			out["selected_clip"] = map[string]any{"id": scope.ClipID, "title": title, "duration": duration}
		} else {
			return nil, err
		}
	}
	return json.Marshal(out)
}

func (e *PlatformExecutor) contextInventory(ctx context.Context, user string, storiesOnly bool) (json.RawMessage, error) {
	query := `SELECT COALESCE(jsonb_agg(to_jsonb(s)),'[]'::jsonb) FROM (SELECT id,title,status,revision,topic FROM scripts WHERE user_id=$1 AND archived_at IS NULL ORDER BY updated_at DESC LIMIT 20) s`
	if storiesOnly {
		query = `SELECT COALESCE(jsonb_agg(to_jsonb(s)),'[]'::jsonb) FROM (SELECT id,status,current_version FROM story_projects WHERE user_id=$1 AND status<>'deleting' ORDER BY updated_at DESC LIMIT 20) s`
	}
	var raw []byte
	err := e.db.QueryRowContext(ctx, query, user).Scan(&raw)
	return json.RawMessage(raw), err
}
