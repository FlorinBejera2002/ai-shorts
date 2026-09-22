package publishing

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

func (h *Handler) ValidateLinkedInSchedule(ctx context.Context, tx *sql.Tx, user, id string) (string, error) {
	if !h.configured("linkedin") {
		return "accountIds", errInvalid
	}
	var allowed bool
	err := tx.QueryRowContext(ctx, `SELECT status='connected' AND 'video_publish'=ANY(scopes) AND linkedin_consent_at IS NOT NULL AND COALESCE(token_expires_at>now(),true) FROM social_accounts WHERE id=$1 AND user_id=$2 AND provider='linkedin' FOR UPDATE`, id, user).Scan(&allowed)
	if err != nil || !allowed {
		return "accountIds", errInvalid
	}
	return "", nil
}

// purgeLinkedInAccount deletes tokens, cached profile/page data, and API-derived
// publication identifiers immediately. User-authored media and captions remain
// in the library, while calendar destinations are detached for explicit review.
func purgeLinkedInAccount(ctx context.Context, tx *sql.Tx, user, id string) error {
	_, err := tx.ExecContext(ctx, `UPDATE scheduled_posts SET account_ids=array_remove(account_ids,$2::uuid),status=CASE WHEN status IN ('scheduled','publishing') THEN 'failed' ELSE status END,publishing_error=CASE WHEN status IN ('scheduled','publishing') THEN 'LinkedIn access was removed. Review destinations before scheduling again.' ELSE publishing_error END,updated_at=now() WHERE user_id=$1 AND $2::uuid=ANY(account_ids)`, user, id)
	if err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM social_posts WHERE user_id=$1 AND account_id=$2`, user, id); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM social_oauth_states WHERE user_id=$1 AND provider='linkedin'`, user); err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `DELETE FROM social_accounts WHERE user_id=$1 AND id=$2 AND provider='linkedin'`, user, id)
	return err
}

func (h *Handler) maintainLinkedInData(ctx context.Context) error {
	var candidateID, candidateUser string
	err := h.db.QueryRowContext(ctx, `SELECT id,user_id FROM social_accounts WHERE provider='linkedin' AND (linkedin_check_after<=now() OR status<>'connected' OR COALESCE(token_expires_at<=now(),false)) ORDER BY linkedin_check_after,id LIMIT 1`).Scan(&candidateID, &candidateUser)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var lockedUser string
	if err = tx.QueryRowContext(ctx, `SELECT id FROM users WHERE id=$1 FOR UPDATE`, candidateUser).Scan(&lockedUser); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		return err
	}
	var account Account
	err = tx.QueryRowContext(ctx, `SELECT id,user_id,provider,remote_id,status,credentials,token_expires_at FROM social_accounts WHERE id=$1 AND user_id=$2 AND provider='linkedin' AND (linkedin_check_after<=now() OR status<>'connected' OR COALESCE(token_expires_at<=now(),false)) FOR UPDATE`, candidateID, candidateUser).Scan(&account.ID, &account.UserID, &account.Provider, &account.RemoteID, &account.Status, &account.Encrypted, &account.TokenExpiresAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if account.Status != "connected" || account.TokenExpiresAt != nil && !account.TokenExpiresAt.After(time.Now()) {
		if err = purgeLinkedInAccount(ctx, tx, account.UserID, account.ID); err != nil {
			return err
		}
		return tx.Commit()
	}
	checkCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	credentials, checkErr := h.liveCredentialsLocked(checkCtx, tx, account)
	var remote RemoteAccount
	if checkErr == nil {
		remote, checkErr = h.client.LinkedInAccount(checkCtx, credentials, account.RemoteID)
	}
	if checkErr != nil {
		if LinkedInAuthorizationRevoked(checkErr) || errors.Is(checkErr, errInvalid) {
			err = purgeLinkedInAccount(ctx, tx, account.UserID, account.ID)
		} else {
			_, err = tx.ExecContext(ctx, `UPDATE social_accounts SET linkedin_check_after=now()+interval '1 hour' WHERE id=$1`, account.ID)
		}
	} else {
		_, err = tx.ExecContext(ctx, `UPDATE social_accounts SET name=$2,username=$3,avatar_url=$4,linkedin_verified_at=now(),linkedin_check_after=now()+interval '1 day' WHERE id=$1`, account.ID, remote.Name, remote.Username, remote.AvatarURL)
	}
	if err != nil {
		return err
	}
	return tx.Commit()
}
