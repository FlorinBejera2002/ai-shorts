package publishing

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
)

// AgentPostBinding binds approval to actual content, current owned media, and
// stable destination identities. Rotating OAuth credentials are deliberately
// excluded; a reconnect to a different destination changes remote_id.
func AgentPostBinding(ctx context.Context, tx *sql.Tx, user, id string, lock bool) (string, error) {
	if lock {
		_, err := tx.ExecContext(ctx, `SELECT c.id FROM clips c JOIN scheduled_posts p ON p.clip_id=c.id AND p.user_id=c.user_id WHERE p.id=$1 AND p.user_id=$2 FOR SHARE OF c`, id, user)
		if err != nil {
			return "", err
		}
		_, err = tx.ExecContext(ctx, `SELECT a.id FROM social_accounts a JOIN scheduled_posts p ON a.id=ANY(p.account_ids) AND a.user_id=p.user_id WHERE p.id=$1 AND p.user_id=$2 ORDER BY a.id FOR UPDATE OF a`, id, user)
		if err != nil {
			return "", err
		}
	}
	var raw []byte
	err := tx.QueryRowContext(ctx, `SELECT jsonb_build_object(
 'id',p.id,'title',p.title,'caption',p.caption,'notes',p.notes,'platforms',p.platforms,'accounts',p.account_ids,'scheduled_at',p.scheduled_at,'clip_id',p.clip_id,'media',p.media,'tiktok',p.tiktok_options,'instagram',p.instagram_options,'youtube',p.youtube_options,
 'clip',CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('id',c.id,'file',c.file_storage_key,'path',c.file_path,'url',c.file_url,'tiktok',c.tiktok_file_storage_key,'size',c.file_size,'duration',c.duration) END,
 'destinations',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'provider',a.provider,'remote',a.remote_id,'status',a.status,'scopes',a.scopes,'youtube_consent',a.youtube_consent_at,'linkedin_consent',a.linkedin_consent_at) ORDER BY a.id) FROM social_accounts a WHERE a.user_id=p.user_id AND a.id=ANY(p.account_ids)),'[]'::jsonb)) FROM scheduled_posts p LEFT JOIN clips c ON c.id=p.clip_id AND c.user_id=p.user_id WHERE p.id=$1 AND p.user_id=$2`, id, user).Scan(&raw)
	if err != nil {
		return "", err
	}
	return digest(string(raw)), nil
}
func AgentAccountBinding(ctx context.Context, tx *sql.Tx, user, id string) (string, error) {
	var raw []byte
	err := tx.QueryRowContext(ctx, `SELECT jsonb_build_object('id',id,'provider',provider,'remote',remote_id,'status',status,'scopes',scopes,'youtube_consent',youtube_consent_at,'linkedin_consent',linkedin_consent_at) FROM social_accounts WHERE id=$1 AND user_id=$2`, id, user).Scan(&raw)
	if err != nil {
		return "", err
	}
	return digest(string(raw)), nil
}

type AgentAccount struct {
	ID            string `json:"id"`
	Provider      string `json:"provider"`
	Name          string `json:"name"`
	Username      string `json:"username"`
	Status        string `json:"status"`
	Configured    bool   `json:"configured"`
	ExpectedState string `json:"expected_state"`
}

func (h *Handler) AgentAccounts(ctx context.Context, user string) ([]AgentAccount, error) {
	rows, err := h.db.QueryContext(ctx, `SELECT id,provider,name,username,status,jsonb_build_object('id',id,'provider',provider,'remote',remote_id,'status',status,'scopes',scopes,'youtube_consent',youtube_consent_at,'linkedin_consent',linkedin_consent_at) FROM social_accounts WHERE user_id=$1 ORDER BY provider,id`, user)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AgentAccount{}
	for rows.Next() {
		var a AgentAccount
		var binding []byte
		if err = rows.Scan(&a.ID, &a.Provider, &a.Name, &a.Username, &a.Status, &binding); err != nil {
			return nil, err
		}
		a.Configured = h.configured(a.Provider)
		a.ExpectedState = digest(string(binding))
		out = append(out, a)
	}
	return out, rows.Err()
}

func (h *Handler) verifyAgentCalendar(ctx context.Context, tx *sql.Tx, user, id string) error {
	var binding struct {
		Digest string `json:"digest"`
	}
	var raw []byte
	if err := tx.QueryRowContext(ctx, `SELECT agent_binding FROM scheduled_posts WHERE id=$1 AND user_id=$2`, id, user).Scan(&raw); err != nil {
		return err
	}
	if err := json.Unmarshal(raw, &binding); err != nil {
		return err
	}
	if binding.Digest == "" {
		return nil
	}
	var permitted bool
	if err := tx.QueryRowContext(ctx, `SELECT access_role='member' AND NOT email_activation_required FROM users WHERE id=$1`, user).Scan(&permitted); err != nil {
		return err
	}
	if !permitted {
		return errors.New("Publishing permission is no longer active")
	}
	actual, err := AgentPostBinding(ctx, tx, user, id, true)
	if err != nil {
		return err
	}
	if actual != binding.Digest {
		return errors.New("The approved post, media, or destination changed. Review and approve it again")
	}
	return nil
}
