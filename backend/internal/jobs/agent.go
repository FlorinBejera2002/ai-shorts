package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"sneepcut/backend-go/internal/agentaction"
	"sneepcut/backend-go/internal/data"
)

// AgentInput exposes owned asset identifiers, never model-supplied filesystem paths.
type AgentInput struct {
	Options
	SourceType string  `json:"source_type"`
	SourceURL  *string `json:"source_url,omitempty"`
	AssetID    string  `json:"asset_id,omitempty"`
}
type AgentJob struct {
	ID       string   `json:"id"`
	Status   string   `json:"status"`
	Progress int      `json:"progress"`
	Credits  int      `json:"credits_charged"`
	ClipIDs  []string `json:"clip_ids"`
}

func (h *Handler) agentPrepare(ctx context.Context, user string, in AgentInput) (Prepared, error) {
	p := CreateInput{Options: in.Options, SourceType: in.SourceType, SourceURL: in.SourceURL}
	if in.SourceType == "upload" {
		if !data.ValidUUID(in.AssetID) || !empty(in.SourceURL) {
			return Prepared{}, errors.New("An owned uploaded video asset is required")
		}
		var key string
		err := h.repo.db.QueryRowContext(ctx, `SELECT a.asset->>'key' FROM story_assets a JOIN story_projects p ON p.id=a.project_id WHERE a.id=$1 AND p.user_id=$2 AND coalesce(a.asset->>'kind','video')<>'narration'`, in.AssetID, user).Scan(&key)
		if err != nil {
			return Prepared{}, err
		}
		p.SourceStorageKey = &key
	} else if in.AssetID != "" {
		return Prepared{}, errors.New("Choose exactly one source")
	}
	if err := p.Validate(); err != nil {
		return Prepared{}, err
	}
	return h.prepare(ctx, user, p)
}
func (h *Handler) AgentValidate(ctx context.Context, user string, in AgentInput) error {
	_, err := h.agentPrepare(ctx, user, in)
	return err
}
func (h *Handler) AgentCreate(ctx context.Context, user, request string, in AgentInput) (AgentJob, error) {
	var result AgentJob
	if !data.ValidUUID(request) {
		return result, errors.New("Invalid action request")
	}
	tx, err := h.repo.db.BeginTx(ctx, nil)
	if err != nil {
		return result, err
	}
	defer tx.Rollback()
	replay, err := agentaction.Replay(ctx, tx, user, request, "jobs.create", in, &result)
	if err != nil || replay {
		return result, err
	}
	prepared, err := h.agentPrepare(ctx, user, in)
	if err != nil {
		return result, err
	}
	values, err := h.repo.createTx(ctx, tx, user, []Prepared{prepared})
	if err != nil {
		return result, err
	}
	if err = json.Unmarshal(values[0], &result); err != nil {
		return result, err
	}
	result.ClipIDs = []string{}
	if err = agentaction.Put(ctx, tx, user, request, "jobs.create", in, result); err != nil {
		return result, err
	}
	return result, tx.Commit()
}
func (h *Handler) AgentGet(ctx context.Context, user, id string) (AgentJob, error) {
	var result AgentJob
	raw, err := h.repo.Get(ctx, user, id)
	if err != nil {
		return result, err
	}
	if err = json.Unmarshal(raw, &result); err != nil {
		return result, err
	}
	result.ClipIDs = []string{}
	rows, err := h.repo.db.QueryContext(ctx, `SELECT id,coalesce(file_storage_key,file_path,'') FROM clips WHERE job_id=$1 AND user_id=$2 ORDER BY created_at,id`, id, user)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var clip, key string
		if err = rows.Scan(&clip, &key); err != nil {
			return result, err
		}
		if result.Status == "completed" {
			storage, ok := h.media.(interface {
				Exists(context.Context, string) (bool, error)
			})
			if !ok {
				return result, errors.New("Output storage verification unavailable")
			}
			exists, e := storage.Exists(ctx, key)
			if e != nil {
				return result, e
			}
			if !exists {
				return result, errors.New("Generated output is missing from storage")
			}
		}
		result.ClipIDs = append(result.ClipIDs, clip)
	}
	if err = rows.Err(); err != nil {
		return result, err
	}
	if result.Status == "completed" && len(result.ClipIDs) == 0 {
		return result, errors.New("Processing did not produce a saved clip")
	}
	return result, nil
}
func (h *Handler) AgentCancel(ctx context.Context, user, request, id string) error {
	var owned bool
	err := h.repo.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM agent_action_receipts WHERE user_id=$1 AND request_id=$2 AND action='jobs.create' AND result->>'id'=$3)`, user, request, id).Scan(&owned)
	if err != nil {
		return err
	}
	if !owned {
		return errors.New("Job execution receipt is missing")
	}
	_, err = h.repo.Cancel(ctx, user, id)
	return err
}
