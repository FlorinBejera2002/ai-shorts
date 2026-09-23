package clips

import (
	"context"
	"encoding/json"
	"errors"
	"sneepcut/backend-go/internal/agentaction"
)

type AgentMetadataUndo struct {
	ID            string        `json:"id"`
	ExpectedState string        `json:"expected_state"`
	Metadata      MetadataInput `json:"metadata"`
}
type AgentMutationResult struct {
	Clip    *AgentClip         `json:"clip,omitempty"`
	Deleted bool               `json:"deleted,omitempty"`
	Undo    *AgentMetadataUndo `json:"undo,omitempty"`
}

// AgentMutate serializes domain effects and their replay receipt together. The
// existing manual validation and deletion service remain the source of truth.
func (h *Handler) AgentMutate(ctx context.Context, user, request, id, expected, kind string, raw json.RawMessage) (AgentMutationResult, error) {
	result := AgentMutationResult{}
	if !idPattern.MatchString(id) || !idPattern.MatchString(request) || len(expected) != 64 {
		return result, ErrAgentConflict
	}
	if kind != "metadata" && kind != "delete" {
		return result, errors.New("Unsupported clip mutation")
	}
	if kind == "delete" && len(raw) > 0 {
		return result, errors.New("Clip deletion does not accept metadata")
	}
	input := struct {
		ID, Expected string
		Metadata     json.RawMessage
	}{id, expected, raw}
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return result, err
	}
	defer tx.Rollback()
	found, err := agentaction.Replay(ctx, tx, user, request, "clips."+kind, input, &result)
	if err != nil || found {
		return result, err
	}
	if _, err = lockClip(ctx, tx, user, id); err != nil {
		return result, err
	}
	var active bool
	if err = tx.QueryRowContext(ctx, `SELECT access_role='member' AND NOT email_activation_required AND NOT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=$1) FROM users WHERE id=$1 FOR UPDATE`, user).Scan(&active); err != nil {
		return result, err
	}
	if !active {
		return result, errors.New("Account is unavailable")
	}
	current, err := agentRead(ctx, tx, user, id, true)
	if err != nil {
		return result, err
	}
	if current.ExpectedState != expected {
		return result, ErrAgentConflict
	}
	if kind == "delete" {
		if h.media == nil && !current.StoryOwned {
			return result, errors.New("Clip media service is unavailable")
		}
		if err = h.deleteClipTx(ctx, tx, user, id); err != nil {
			return result, err
		}
		result.Deleted = true
	} else {
		var before MetadataInput
		if err = tx.QueryRowContext(ctx, `SELECT title,hook_text,transcript_text FROM clips WHERE id=$1 AND user_id=$2`, id, user).Scan(&before.Title, &before.Hook, &before.Transcript); err != nil {
			return result, err
		}
		after := before
		if err = decodeAgentEdit(raw, &after); err != nil {
			return result, err
		}
		if err = after.Validate(); err != nil {
			return result, err
		}
		if err = updateMetadataWith(ctx, tx, user, id, after); err != nil {
			return result, err
		}
		updated, e := agentRead(ctx, tx, user, id, false)
		if e != nil {
			return result, e
		}
		result.Clip = &updated
		result.Undo = &AgentMetadataUndo{ID: id, ExpectedState: updated.ExpectedState, Metadata: before}
	}
	if err = agentaction.Put(ctx, tx, user, request, "clips."+kind, input, result); err != nil {
		return result, err
	}
	return result, tx.Commit()
}

func (h *Handler) AgentDeletePreview(ctx context.Context, user, id, expected string) (AgentClip, error) {
	clip, err := h.AgentRead(ctx, user, id)
	if err != nil {
		return clip, err
	}
	if expected != clip.ExpectedState || clip.Editing {
		return clip, ErrAgentConflict
	}
	return clip, nil
}
