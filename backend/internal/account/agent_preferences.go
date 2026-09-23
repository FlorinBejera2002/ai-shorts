package account

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"sneepcut/backend-go/internal/agentaction"
	"sneepcut/backend-go/internal/data"
)

type AgentPreferences struct {
	Preferences   Preferences  `json:"preferences"`
	ExpectedState string       `json:"expected_state"`
	Previous      *Preferences `json:"previous,omitempty"`
}

func preferenceState(ctx context.Context, q interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}, user string) (out AgentPreferences, err error) {
	out.Preferences = defaultPreferences()
	var raw []byte
	err = q.QueryRowContext(ctx, `SELECT to_jsonb(p) FROM account_preferences p WHERE user_id=$1`, user).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		raw = []byte("absent")
		err = nil
	} else if err == nil {
		p := &out.Preferences
		err = q.QueryRowContext(ctx, `SELECT locale,theme,timezone,default_aspect_ratio,default_clip_count,email_security,email_product,email_marketing,in_app_processing,in_app_publishing FROM account_preferences WHERE user_id=$1`, user).Scan(&p.Locale, &p.Theme, &p.Timezone, &p.DefaultAspectRatio, &p.DefaultClipCount, &p.EmailSecurity, &p.EmailProduct, &p.EmailMarketing, &p.InAppProcessing, &p.InAppPublishing)
	}
	if err != nil {
		return out, err
	}
	sum := sha256.Sum256(raw)
	out.ExpectedState = hex.EncodeToString(sum[:])
	return out, nil
}
func AgentReadPreferences(ctx context.Context, db *sql.DB, user string) (AgentPreferences, error) {
	tx, err := db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		return AgentPreferences{}, err
	}
	defer tx.Rollback()
	result, err := preferenceState(ctx, tx, user)
	return result, err
}
func AgentPatchPreferences(ctx context.Context, db *sql.DB, user, request, expected string, patch json.RawMessage) (AgentPreferences, error) {
	if !data.ValidUUID(request) || len(expected) != 64 {
		return AgentPreferences{}, errors.New("Invalid preferences update")
	}
	var savedInput, savedResult []byte
	replayErr := db.QueryRowContext(ctx, `SELECT input,result FROM agent_action_receipts WHERE user_id=$1 AND request_id=$2 AND action='settings.preferences'`, user, request).Scan(&savedInput, &savedResult)
	if replayErr == nil {
		var binding struct {
			Expected    string
			Preferences Preferences
		}
		var result AgentPreferences
		if json.Unmarshal(savedInput, &binding) != nil || json.Unmarshal(savedResult, &result) != nil || result.Previous == nil {
			return result, errors.New("Invalid saved preferences receipt")
		}
		candidate := *result.Previous
		if json.Unmarshal(patch, &candidate) != nil || binding.Expected != expected || candidate != binding.Preferences {
			return AgentPreferences{}, agentaction.ErrConflict
		}
		return result, nil
	}
	if !errors.Is(replayErr, sql.ErrNoRows) {
		return AgentPreferences{}, replayErr
	}
	// The expected digest is checked again under the shared writer lock below.
	before, err := AgentReadPreferences(ctx, db, user)
	if err != nil {
		return before, err
	}
	if before.ExpectedState != expected {
		return AgentPreferences{}, agentaction.ErrConflict
	}
	allowed := map[string]bool{"locale": true, "theme": true, "timezone": true, "defaultAspectRatio": true, "defaultClipCount": true, "emailSecurity": true, "emailProduct": true, "emailMarketing": true, "inAppProcessing": true, "inAppPublishing": true}
	var fields map[string]json.RawMessage
	if json.Unmarshal(patch, &fields) != nil || len(fields) == 0 {
		return AgentPreferences{}, errors.New("Invalid preferences patch")
	}
	for key, value := range fields {
		if !allowed[key] || string(value) == "null" {
			return AgentPreferences{}, errors.New("Invalid preference field")
		}
	}
	input := before.Preferences
	if err = json.Unmarshal(patch, &input); err != nil {
		return AgentPreferences{}, err
	}
	return updateAgentPreferences(ctx, db, user, request, expected, input)
}
func updateAgentPreferences(ctx context.Context, db *sql.DB, userID, request, expected string, input Preferences) (out AgentPreferences, err error) {
	if !input.valid() {
		return out, errors.New("Preferences are invalid")
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return out, err
	}
	defer tx.Rollback()
	binding := struct {
		Expected    string
		Preferences Preferences
	}{expected, input}
	if request != "" {
		replay, e := agentaction.Replay(ctx, tx, userID, request, "settings.preferences", binding, &out)
		if e != nil || replay {
			return out, e
		}
	}
	var owner string
	if err = tx.QueryRowContext(ctx, `SELECT id FROM users WHERE id=$1 FOR UPDATE`, userID).Scan(&owner); err != nil {
		return out, err
	}
	if request != "" {
		var active bool
		if err = tx.QueryRowContext(ctx, `SELECT access_role='member' AND NOT email_activation_required AND NOT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=$1) FROM users WHERE id=$1`, userID).Scan(&active); err != nil {
			return out, err
		}
		if !active {
			return out, errors.New("Account is unavailable")
		}
	}
	before, err := preferenceState(ctx, tx, userID)
	if err != nil {
		return out, err
	}
	if expected != "" && expected != before.ExpectedState {
		return out, agentaction.ErrConflict
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO account_preferences(user_id,locale,theme,timezone,default_aspect_ratio,default_clip_count,email_security,email_product,email_marketing,in_app_processing,in_app_publishing,updated_at)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,clock_timestamp()) ON CONFLICT(user_id) DO UPDATE SET locale=excluded.locale,theme=excluded.theme,timezone=excluded.timezone,default_aspect_ratio=excluded.default_aspect_ratio,default_clip_count=excluded.default_clip_count,email_security=excluded.email_security,email_product=excluded.email_product,email_marketing=excluded.email_marketing,in_app_processing=excluded.in_app_processing,in_app_publishing=excluded.in_app_publishing,updated_at=clock_timestamp()`, userID, input.Locale, input.Theme, input.Timezone, input.DefaultAspectRatio, input.DefaultClipCount, input.EmailSecurity, input.EmailProduct, input.EmailMarketing, input.InAppProcessing, input.InAppPublishing)
	if err != nil {
		return out, err
	}
	out, err = preferenceState(ctx, tx, userID)
	if err != nil {
		return out, err
	}
	out.Previous = &before.Preferences
	if request != "" {
		if err = agentaction.Put(ctx, tx, userID, request, "settings.preferences", binding, out); err != nil {
			return out, err
		}
	}
	return out, tx.Commit()
}
