package publishing

import (
	"context"
	"errors"
	"sneepcut/backend-go/internal/agentaction"
	"sneepcut/backend-go/internal/data"
	"time"
)

type AgentDisconnectInput struct {
	ID            string `json:"id"`
	ExpectedState string `json:"expected_state"`
}
type DisconnectResult struct {
	Disconnected    bool `json:"disconnected"`
	ProviderRevoked bool `json:"providerRevoked"`
}
type disconnectGuard struct {
	RequestID string
	Input     AgentDisconnectInput
}

func (h *Handler) AgentDisconnect(ctx context.Context, user, request string, in AgentDisconnectInput) (DisconnectResult, error) {
	if !data.ValidUUID(in.ID) || !data.ValidUUID(request) || len(in.ExpectedState) != 64 {
		return DisconnectResult{}, errInvalid
	}
	return h.disconnectAccount(ctx, user, in.ID, &disconnectGuard{request, in})
}
func (h *Handler) disconnectAccount(ctx context.Context, user, id string, guard *disconnectGuard) (DisconnectResult, error) {
	result := DisconnectResult{}
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return result, err
	}
	defer tx.Rollback()
	if guard != nil {
		found, e := agentaction.Replay(ctx, tx, user, guard.RequestID, "publishing.disconnect", guard.Input, &result)
		if e != nil || found {
			return result, e
		}
	}
	var member bool
	if err = tx.QueryRowContext(ctx, `SELECT access_role='member' AND NOT email_activation_required AND NOT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=$1) FROM users WHERE id=$1 FOR UPDATE`, user).Scan(&member); err != nil {
		return result, err
	}
	if !member {
		return result, errors.New("Account is unavailable")
	}
	var provider, remote, encrypted string
	if err = tx.QueryRowContext(ctx, `SELECT provider,remote_id,credentials FROM social_accounts WHERE id=$1 AND user_id=$2 FOR UPDATE`, id, user).Scan(&provider, &remote, &encrypted); err != nil {
		return result, err
	}
	if guard != nil {
		state, e := AgentAccountBinding(ctx, tx, user, id)
		if e != nil {
			return result, e
		}
		if state != guard.Input.ExpectedState {
			return result, agentaction.ErrConflict
		}
	}
	if _, err = tx.ExecContext(ctx, `UPDATE social_accounts SET credentials='',status='disconnected',updated_at=now() WHERE id=$1`, id); err != nil {
		return result, err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE social_posts SET status='cancelled',error='Account disconnected.',updated_at=now() WHERE account_id=$1 AND status IN ('queued','processing')`, id); err != nil {
		return result, err
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM social_oauth_states WHERE user_id=$1 AND provider=$2`, user, provider); err != nil {
		return result, err
	}
	if provider == "youtube" {
		if err = purgeYouTubeAccount(ctx, tx, user, id); err != nil {
			return result, err
		}
	}
	if provider == "linkedin" {
		if err = purgeLinkedInAccount(ctx, tx, user, id); err != nil {
			return result, err
		}
	}
	if provider != "facebook" && h.vault != nil {
		var credentials Credentials
		if unseal(h.vault, encrypted, user+":"+provider+":"+remote, &credentials) == nil {
			revokeCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
			result.ProviderRevoked = h.client.Revoke(revokeCtx, provider, credentials) == nil
			cancel()
		}
	}
	result.Disconnected = true
	if guard != nil {
		if err = agentaction.Put(ctx, tx, user, guard.RequestID, "publishing.disconnect", guard.Input, result); err != nil {
			return result, err
		}
	}
	return result, tx.Commit()
}
