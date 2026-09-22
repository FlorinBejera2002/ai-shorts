package publishing

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

func (h *Handler) ValidateXSchedule(ctx context.Context, tx *sql.Tx, user, id, caption string) (string, error) {
	if !h.configured("twitter") {
		return "accountIds", errInvalid
	}
	if len([]rune(caption)) > 280 {
		return "caption", errInvalid
	}
	var valid bool
	err := tx.QueryRowContext(ctx, `SELECT status='connected' AND 'video_publish'=ANY(scopes) AND x_consent_at IS NOT NULL FROM social_accounts WHERE id=$1 AND user_id=$2 AND provider='twitter' FOR UPDATE`, id, user).Scan(&valid)
	if err != nil || !valid {
		return "accountIds", errInvalid
	}
	return "", nil
}

func purgeXAccount(ctx context.Context, tx *sql.Tx, user, id string) error {
	_, err := tx.ExecContext(ctx, `UPDATE scheduled_posts SET account_ids=array_remove(account_ids,$2::uuid),status=CASE WHEN status IN ('scheduled','publishing') THEN 'failed' ELSE status END,publishing_error=CASE WHEN status IN ('scheduled','publishing') THEN 'X access was removed. Review destinations before scheduling again.' ELSE publishing_error END,updated_at=now() WHERE user_id=$1 AND $2::uuid=ANY(account_ids)`, user, id)
	if err == nil {
		_, err = tx.ExecContext(ctx, `DELETE FROM social_posts WHERE user_id=$1 AND account_id=$2`, user, id)
	}
	if err == nil {
		_, err = tx.ExecContext(ctx, `DELETE FROM social_oauth_states WHERE user_id=$1 AND provider='twitter'`, user)
	}
	if err == nil {
		_, err = tx.ExecContext(ctx, `DELETE FROM social_accounts WHERE id=$1 AND user_id=$2 AND provider='twitter'`, id, user)
	}
	return err
}

func (h *Handler) maintainXData(ctx context.Context) error {
	if h.vault == nil {
		return nil
	}
	rows, err := h.db.QueryContext(ctx, `SELECT id,user_id,remote_id,credentials,token_expires_at FROM social_accounts WHERE provider='twitter' AND status='connected' AND (x_check_after IS NULL OR x_check_after<=now() OR COALESCE(token_expires_at<=now(),false)) ORDER BY COALESCE(x_check_after,'epoch') LIMIT 100`)
	if err != nil {
		return err
	}
	defer rows.Close()
	var accounts []Account
	for rows.Next() {
		var account Account
		if err = rows.Scan(&account.ID, &account.UserID, &account.RemoteID, &account.Encrypted, &account.TokenExpiresAt); err != nil {
			return err
		}
		account.Provider = "twitter"
		accounts = append(accounts, account)
	}
	for _, account := range accounts {
		tx, beginErr := h.db.BeginTx(ctx, nil)
		if beginErr != nil {
			return beginErr
		}
		lockErr := tx.QueryRowContext(ctx, `SELECT credentials,token_expires_at FROM social_accounts WHERE id=$1 AND user_id=$2 AND provider='twitter' AND status='connected' FOR UPDATE`, account.ID, account.UserID).Scan(&account.Encrypted, &account.TokenExpiresAt)
		if lockErr != nil {
			tx.Rollback()
			continue
		}
		credentials, credentialErr := h.liveCredentialsLocked(ctx, tx, account)
		if credentialErr != nil {
			err = purgeXAccount(ctx, tx, account.UserID, account.ID)
			if err == nil {
				err = tx.Commit()
			} else {
				tx.Rollback()
			}
			if err != nil {
				return err
			}
			continue
		}
		checkCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
		remote, checkErr := h.client.XAccount(checkCtx, credentials, account.RemoteID)
		cancel()
		if XAuthorizationRevoked(checkErr) || errors.Is(checkErr, errInvalid) {
			err = purgeXAccount(ctx, tx, account.UserID, account.ID)
		} else if checkErr != nil {
			_, err = tx.ExecContext(ctx, `UPDATE social_accounts SET x_check_after=now()+interval '6 hours',updated_at=now() WHERE id=$1`, account.ID)
		} else {
			_, err = tx.ExecContext(ctx, `UPDATE social_accounts SET name=$2,username=$3,avatar_url=$4,x_verified_at=now(),x_check_after=now()+interval '1 day',updated_at=now() WHERE id=$1`, account.ID, remote.Name, remote.Username, remote.AvatarURL)
		}
		if err == nil {
			err = tx.Commit()
		} else {
			tx.Rollback()
		}
		if err != nil {
			return err
		}
	}
	return nil
}
