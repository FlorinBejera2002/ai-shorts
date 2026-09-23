package workspaceagent

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/httpx"
	"sneepcut/backend-go/internal/identity"
	"strings"
	"unicode/utf8"
)

type ResourceMedia interface {
	ResolveOwnedLogo(context.Context, string, string) (string, error)
}

func (h *Handler) SetMedia(media ResourceMedia) { h.media = media }
func (h *Handler) attachResource(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Kind      string `json:"kind"`
		Reference string `json:"reference"`
		Text      string `json:"text"`
		Name      string `json:"name"`
		ProjectID string `json:"project_id"`
	}
	if !httpx.Read(w, r, &in, 100000) {
		return
	}
	user := identity.Current(r).User.ID
	if strings.TrimSpace(in.Name) == "" || utf8.RuneCountInString(in.Name) > 200 || len(in.Reference) > 2048 {
		httpx.Error(w, 422, "Invalid resource")
		return
	}
	var project any
	if in.ProjectID != "" {
		if !data.ValidUUID(in.ProjectID) {
			httpx.Error(w, 422, "Invalid project")
			return
		}
		var owned bool
		if err := h.db.QueryRowContext(r.Context(), `SELECT EXISTS(SELECT 1 FROM story_projects WHERE id=$1 AND user_id=$2)`, in.ProjectID, user).Scan(&owned); err != nil || !owned {
			httpx.Error(w, 404, "Project unavailable")
			return
		}
		project = in.ProjectID
	}
	switch in.Kind {
	case "publishing_media":
		resolver, ok := h.media.(interface {
			ResolveOwnedPublishingMedia(context.Context, string, string) (string, string, error)
		})
		if !ok || in.Text != "" || in.ProjectID != "" {
			httpx.Error(w, 422, "Publishing upload is unavailable")
			return
		}
		key, kind, err := resolver.ResolveOwnedPublishingMedia(r.Context(), user, in.Reference)
		if err != nil || (kind != "image" && kind != "video") {
			httpx.Error(w, 422, "Upload publishing media owned by this account first")
			return
		}
		in.Reference, in.Text = key, kind
	case "logo":
		if h.media == nil || in.Text != "" {
			httpx.Error(w, 422, "Logo upload unavailable")
			return
		}
		key, err := h.media.ResolveOwnedLogo(r.Context(), user, in.Reference)
		if err != nil {
			httpx.Error(w, 422, "Upload this account's logo before attaching it")
			return
		}
		in.Reference = key
	case "document":
		if in.Reference != "" || strings.TrimSpace(in.Text) == "" || utf8.RuneCountInString(in.Text) > 20000 || strings.ContainsRune(in.Text, 0) {
			httpx.Error(w, 422, "Brief must contain 1–20000 text characters")
			return
		}
	default:
		httpx.Error(w, 422, "Unsupported resource type")
		return
	}
	id, err := data.NewUUID()
	if err != nil {
		failure(w, err)
		return
	}
	_, err = h.db.ExecContext(r.Context(), `INSERT INTO workspace_agent_resources(id,user_id,project_id,kind,name,reference,content) VALUES($1,$2,$3,$4,$5,$6,$7)`, id, user, project, in.Kind, in.Name, in.Reference, in.Text)
	if err != nil {
		failure(w, err)
		return
	}
	httpx.JSON(w, 201, map[string]any{"id": id, "kind": in.Kind, "name": in.Name, "project_id": in.ProjectID})
}
func (h *Handler) validateResources(ctx context.Context, user string, ids []string, project string) error {
	if len(ids) > 20 {
		return errors.New("Too many resources")
	}
	seen := map[string]bool{}
	for _, id := range ids {
		if !data.ValidUUID(id) || seen[id] {
			return sql.ErrNoRows
		}
		seen[id] = true
		var target, kind, reference string
		if err := h.db.QueryRowContext(ctx, `SELECT coalesce(project_id::text,''),kind,reference FROM workspace_agent_resources WHERE id=$1 AND user_id=$2`, id, user).Scan(&target, &kind, &reference); err != nil {
			return err
		}
		if kind == "publishing_media" {
			resolver, ok := h.media.(interface {
				ResolveOwnedPublishingMedia(context.Context, string, string) (string, string, error)
			})
			if !ok {
				return errors.New("Publishing resource verification is unavailable")
			}
			if _, _, err := resolver.ResolveOwnedPublishingMedia(ctx, user, reference); err != nil {
				return errors.New("Publishing resource is missing or unavailable")
			}
		}
		if kind == "logo" {
			if h.media == nil { return errors.New("Logo resource verification is unavailable") }
			if _, err := h.media.ResolveOwnedLogo(ctx, user, reference); err != nil { return errors.New("Logo resource is missing or unavailable") }
		}
		if target != "" && project != "" && target != project {
			return sql.ErrNoRows
		}
	}
	return nil
}
func (h *Handler) resourceContext(ctx context.Context, r Run) ([]map[string]any, error) {
	out := []map[string]any{}
	for _, id := range r.ResourceIDs {
		var kind, name, content string
		var project sql.NullString
		if err := h.db.QueryRowContext(ctx, `SELECT kind,name,content,project_id FROM workspace_agent_resources WHERE id=$1 AND user_id=$2`, id, r.UserID).Scan(&kind, &name, &content, &project); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{"id": id, "kind": kind, "name": name, "project_id": project.String, "untrusted_text": clipText(content, 20000)})
	}
	return out, nil
}

func (h *Handler) waitForResources(ctx context.Context, r *Run, needs []ResourceNeed) error {
	// Global brand changes and text briefs do not require an unrelated story draft.
	standalone := len(needs) > 0 && r.Context.ProjectID == ""
	for _, need := range needs {
		if (need.Kind != "logo" && need.Kind != "document") || need.TargetID != "" || len(need.Label) > 400 { standalone = false }
	}
	if standalone {
		r.MissingResources = needs
		r.Status = "waiting_for_resources"
		r.Action = nil
		return nil
	}
	onlyPublishing := len(needs) > 0
	for _, need := range needs {
		if need.Kind != "publishing_media" {
			onlyPublishing = false
		}
	}
	if onlyPublishing {
		for _, need := range needs {
			if len(need.Label) > 400 {
				return errors.New("Invalid resource label")
			}
			if need.TargetID != "" {
				var owned bool
				if !data.ValidUUID(need.TargetID) {
					return errors.New("Invalid publication target")
				}
				if err := h.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM scheduled_posts WHERE id=$1 AND user_id=$2 AND status='draft')`, need.TargetID, r.UserID).Scan(&owned); err != nil {
					return err
				}
				if !owned {
					return sql.ErrNoRows
				}
			}
		}
		r.MissingResources = needs
		r.Status = "waiting_for_resources"
		r.Action = nil
		return nil
	}
	target := r.Context.ProjectID
	for _, need := range needs {
		if need.Kind != "videos" && need.Kind != "logo" && need.Kind != "document" {
			return errors.New("Invalid action resource kind")
		}
		if len(need.Label) > 400 {
			return errors.New("Invalid action resource label")
		}
		if need.TargetID != "" {
			if target != "" && target != need.TargetID {
				return errors.New("Invalid action resource target")
			}
			target = need.TargetID
		}
	}
	if !data.ValidUUID(target) {
		return errors.New("Invalid action resource project")
	}
	var owned bool
	if err := h.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM story_projects WHERE id=$1 AND user_id=$2)`, target, r.UserID).Scan(&owned); err != nil {
		return err
	}
	if !owned {
		return sql.ErrNoRows
	}
	r.Context.ProjectID = target
	r.Context.Route = "/dashboard/create"
	r.MissingResources = needs
	r.Status = "waiting_for_resources"
	r.Action = nil
	return nil
}
func (h *Handler) resourcesReady(ctx context.Context, r *Run) error {
	if err := h.validateResources(ctx, r.UserID, r.ResourceIDs, r.Context.ProjectID); err != nil {
		return errors.New("Resources are unavailable for this project")
	}
	attached, err := h.resourceContext(ctx, *r)
	if err != nil {
		return errors.New("Resources are unavailable")
	}
	for _, need := range r.MissingResources {
		available := false
		if need.Kind == "videos" {
			var count int
			err = h.db.QueryRowContext(ctx, `SELECT count(*) FROM story_assets a JOIN story_projects p ON p.id=a.project_id WHERE p.id=$1 AND p.user_id=$2 AND coalesce(a.asset->>'include','auto')!='excluded'`, r.Context.ProjectID, r.UserID).Scan(&count)
			available = err == nil && count > 0
		} else {
			for _, resource := range attached {
				if resource["kind"] == need.Kind {
					available = true
				}
			}
		}
		if !available {
			return errors.New("The requested resources have not finished uploading")
		}
	}
	return nil
}
