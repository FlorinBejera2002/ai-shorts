package publishing

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// ValidateYouTubeSchedule is shared by direct posts, calendar scheduling and
// dispatch. A legacy read-only grant never becomes publishing consent.
func (h *Handler) ValidateYouTubeSchedule(ctx context.Context, tx *sql.Tx, user, id string, options YouTubeOptions) (string, error) {
	if !h.configured("youtube") {
		return "accountIds", errInvalid
	}
	if err := ValidateYouTubeOptions(options, h.cfg.YouTubeAuditApproved); err != nil {
		return "youtube", err
	}
	var allowed bool
	err := tx.QueryRowContext(ctx, `SELECT status='connected' AND 'video_publish'=ANY(scopes) AND youtube_consent_at IS NOT NULL AND youtube_verified_at>now()-interval '6 days' FROM social_accounts WHERE id=$1 AND user_id=$2 AND provider='youtube' FOR UPDATE`, id, user).Scan(&allowed)
	if err != nil || !allowed {
		return "accountIds", errInvalid
	}
	return "", nil
}

// Erase API-derived identifiers and profile data, including historical results.
// User-authored calendar content and original media remain under user control.
// The caller holds the account lock, fencing any concurrent upload.
func purgeYouTubeAccount(ctx context.Context, tx *sql.Tx, user, id string) error {
	_, err := tx.ExecContext(ctx, `UPDATE scheduled_posts SET account_ids=array_remove(account_ids,$2::uuid),status=CASE WHEN status IN ('scheduled','publishing') THEN 'failed' ELSE status END,publishing_error=CASE WHEN status IN ('scheduled','publishing') THEN 'YouTube access was removed. Review destinations before scheduling again.' ELSE publishing_error END,updated_at=now() WHERE user_id=$1 AND $2::uuid=ANY(account_ids)`, user, id)
	if err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM social_posts WHERE user_id=$1 AND account_id=$2`, user, id); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM social_oauth_states WHERE user_id=$1 AND provider='youtube'`, user); err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `DELETE FROM social_accounts WHERE user_id=$1 AND id=$2 AND provider='youtube'`, user, id)
	return err
}

// Maintenance runs even when publishing is disabled. Daily channel reads both
// refresh cached metadata and detect revoked grants. Unverifiable connections
// are erased after six days, conservatively within the seven-day revocation
// window. Transient provider errors back off without pretending validation.
func (h *Handler) maintainYouTubeData(ctx context.Context) error {
	var candidateID, candidateUser string
	err := h.db.QueryRowContext(ctx, `SELECT id,user_id FROM social_accounts WHERE provider='youtube' AND (youtube_check_after<=now() OR status<>'connected' OR youtube_verified_at<=now()-interval '6 days') ORDER BY youtube_verified_at,id LIMIT 1`).Scan(&candidateID, &candidateUser)
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
	var a Account
	var verified time.Time
	err = tx.QueryRowContext(ctx, `SELECT id,user_id,provider,remote_id,status,credentials,token_expires_at,youtube_verified_at FROM social_accounts WHERE id=$1 AND user_id=$2 AND provider='youtube' AND (youtube_check_after<=now() OR status<>'connected' OR youtube_verified_at<=now()-interval '6 days') FOR UPDATE`, candidateID, candidateUser).Scan(&a.ID, &a.UserID, &a.Provider, &a.RemoteID, &a.Status, &a.Encrypted, &a.TokenExpiresAt, &verified)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if a.Status != "connected" || time.Since(verified) >= 6*24*time.Hour {
		if err = purgeYouTubeAccount(ctx, tx, a.UserID, a.ID); err != nil {
			return err
		}
		return tx.Commit()
	}
	checkCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	var remote RemoteAccount
	creds, checkErr := h.liveCredentialsLocked(checkCtx, tx, a)
	if checkErr == nil {
		remote, checkErr = h.client.YouTubeChannel(checkCtx, creds, a.RemoteID)
	}
	if checkErr != nil {
		if YouTubeAuthorizationRevoked(checkErr) {
			if err = purgeYouTubeAccount(ctx, tx, a.UserID, a.ID); err != nil {
				return err
			}
		} else {
			_, err = tx.ExecContext(ctx, `UPDATE social_accounts SET youtube_check_after=now()+interval '1 hour' WHERE id=$1`, a.ID)
		}
	} else {
		_, err = tx.ExecContext(ctx, `UPDATE social_accounts SET name=$2,username=$3,avatar_url=$4,youtube_verified_at=now(),youtube_check_after=now()+interval '1 day' WHERE id=$1`, a.ID, remote.Name, remote.Username, remote.AvatarURL)
		// We do not retain stale video API results indefinitely or keep refreshing
		// historical uploads solely to retain their identifiers.
		if err == nil {
			_, err = tx.ExecContext(ctx, `DELETE FROM social_posts WHERE account_id=$1 AND status NOT IN ('queued','submitting','processing','finalizing') AND updated_at<now()-interval '29 days'`, a.ID)
		}
	}
	if err != nil {
		return err
	}
	return tx.Commit()
}
