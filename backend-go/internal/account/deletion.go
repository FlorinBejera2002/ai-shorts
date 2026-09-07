package account

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"golang.org/x/crypto/bcrypt"
	"sneepcut/backend-go/internal/billing"
)

type DeletionInput struct {
	Confirmation    string  `json:"confirmation"`
	CurrentPassword *string `json:"currentPassword"`
}
type deletionAccount struct {
	Email, PasswordHash        string
	SessionVersion             int
	CustomerID, SubscriptionID sql.NullString
}

func recent(authenticatedAt, now int64) bool {
	return authenticatedAt > 0 && authenticatedAt <= now && now-authenticatedAt <= 600
}
func confirm(input DeletionInput, user deletionAccount, authenticatedAt, now int64) error {
	issues := []Issue{}
	if !strings.EqualFold(strings.TrimSpace(input.Confirmation), user.Email) {
		issues = append(issues, Issue{"confirmation", "Confirmation must match the account email address"})
	}
	if user.PasswordHash != "" {
		if input.CurrentPassword == nil || *input.CurrentPassword == "" {
			issues = append(issues, Issue{"currentPassword", "Current password is required"})
		} else if len(*input.CurrentPassword) > 72 {
			issues = append(issues, Issue{"currentPassword", "Current password must fit within the secure password length limit"})
		}
	} else if input.CurrentPassword != nil {
		issues = append(issues, Issue{"body", "Unsupported field: currentPassword"})
	}
	if len(issues) > 0 {
		return &apiError{Status: 400, Message: "Account confirmation did not match", Issues: issues}
	}
	if user.PasswordHash != "" {
		if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(*input.CurrentPassword)); err != nil {
			return &apiError{Status: 403, Message: "Current password is incorrect", Issues: []Issue{{"currentPassword", "Current password is incorrect"}}}
		}
	} else if !recent(authenticatedAt, now) {
		return &apiError{Status: 403, Message: "Sign in with your provider again before deleting your account", Code: "reauthentication_required"}
	}
	return nil
}
func (h *Handler) deletionAccount(ctx context.Context, userID string) (deletionAccount, error) {
	var user deletionAccount
	err := h.db.QueryRowContext(ctx, `SELECT email,COALESCE(password_hash,''),session_version,stripe_customer_id,stripe_subscription_id FROM users WHERE id=$1`, userID).Scan(&user.Email, &user.PasswordHash, &user.SessionVersion, &user.CustomerID, &user.SubscriptionID)
	return user, err
}
func (h *Handler) finished(ctx context.Context, userID string) (bool, error) {
	var absent bool
	err := h.db.QueryRowContext(ctx, `SELECT NOT EXISTS(SELECT 1 FROM users WHERE id=$1) AND NOT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=$1)`, userID).Scan(&absent)
	return absent, err
}
func (h *Handler) recordFailure(ctx context.Context, userID, code string) {
	_, _ = h.db.ExecContext(ctx, `UPDATE account_deletion_requests SET last_failure=$2,updated_at=now() WHERE user_id=$1`, userID, code)
}

func (h *Handler) freeze(ctx context.Context, userID string, snapshot deletionAccount) error {
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var email, hash string
	var version int
	err = tx.QueryRowContext(ctx, `SELECT email,COALESCE(password_hash,''),session_version FROM users WHERE id=$1 FOR UPDATE`, userID).Scan(&email, &hash, &version)
	if err != nil {
		return err
	}
	if email != snapshot.Email || hash != snapshot.PasswordHash || version != snapshot.SessionVersion {
		return &apiError{Status: 409, Message: "Account security changed. Sign in again before deleting your account.", Code: "reauthentication_required"}
	}
	// The user lock serializes with checkout, uploads, branding and calendar
	// mutations. Preserve the original provider snapshot on every retry.
	_, err = tx.ExecContext(ctx, `INSERT INTO account_deletion_requests(user_id,stripe_customer_id,stripe_subscription_id) SELECT id,stripe_customer_id,stripe_subscription_id FROM users WHERE id=$1 ON CONFLICT(user_id) DO NOTHING`, userID)
	if err != nil {
		return err
	}
	return tx.Commit()
}

func (h *Handler) stopWork(ctx context.Context, userID string) error {
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	rows, err := tx.QueryContext(ctx, `SELECT id FROM jobs WHERE user_id=$1 ORDER BY id FOR UPDATE`, userID)
	if err != nil {
		return err
	}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	// Keep processing_active and running-edit counters until worker cleanup has
	// actually stopped. Database cancellation cooperates without broker access.
	if _, err = tx.ExecContext(ctx, `UPDATE jobs SET status='cancelled',progress_message='Cancelled for account deletion',completed_at=now(),updated_at=now() WHERE user_id=$1 AND status NOT IN ('completed','failed','cancelled')`, userID); err != nil {
		return err
	}
	// A pending durable edit has not been claimed. Fence it atomically with the
	// reservation release, so broker outages do not stall deletion for an hour.
	if _, err = tx.ExecContext(ctx, `UPDATE jobs j SET active_edit_tasks=0,active_edit_token=NULL,edit_deadline=NULL,updated_at=now() FROM edit_deliveries e WHERE j.user_id=$1 AND e.job_id=j.id AND e.state='pending' AND e.reservation_token=j.active_edit_token`, userID); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE edit_deliveries e SET state='expired',last_error='account_deletion_pending',completed_at=now() FROM jobs j WHERE e.job_id=j.id AND j.user_id=$1 AND e.state='pending'`, userID); err != nil {
		return err
	}
	return tx.Commit()
}
func activeWork(ctx context.Context, db interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}, userID string) (bool, error) {
	var active bool
	err := db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM jobs WHERE user_id=$1 AND (status NOT IN ('completed','failed','cancelled') OR processing_active OR active_edit_tasks>0))`, userID).Scan(&active)
	return active, err
}

func (h *Handler) finalize(ctx context.Context, userID string) error {
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	// Lock work before its owner, matching workers and explicit cancellation.
	rows, err := tx.QueryContext(ctx, `SELECT id FROM jobs WHERE user_id=$1 ORDER BY id FOR UPDATE`, userID)
	if err != nil {
		return err
	}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	var id string
	err = tx.QueryRowContext(ctx, `SELECT id FROM users WHERE id=$1 FOR UPDATE`, userID).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		var marker bool
		if e := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=$1)`, userID).Scan(&marker); e != nil {
			return e
		}
		if !marker {
			return nil
		}
		return &apiError{Status: 409, Message: "Account deletion state requires support assistance"}
	}
	if err != nil {
		return err
	}
	if err = tx.QueryRowContext(ctx, `SELECT user_id FROM account_deletion_requests WHERE user_id=$1 FOR UPDATE`, userID).Scan(&id); err != nil {
		return err
	}
	var ready bool
	err = tx.QueryRowContext(ctx, `SELECT d.billing_cancellation_completed AND u.plan='free' AND u.stripe_customer_id IS NOT DISTINCT FROM d.stripe_customer_id AND u.stripe_subscription_id IS NOT DISTINCT FROM d.stripe_subscription_id AND u.stripe_subscription_status IS NOT DISTINCT FROM CASE WHEN d.stripe_subscription_id IS NULL THEN NULL ELSE 'canceled' END AND NOT u.stripe_cancel_at_period_end AND u.stripe_current_period_end IS NULL AND NOT EXISTS(SELECT 1 FROM billing_checkout_claims WHERE user_id=$1) FROM users u JOIN account_deletion_requests d ON d.user_id=u.id WHERE u.id=$1`, userID).Scan(&ready)
	if err != nil {
		return err
	}
	if !ready {
		return &apiError{Status: 409, Message: "Billing changed while account deletion was pending. Retry account deletion.", Code: "billing_reconciliation_pending"}
	}
	active, err := activeWork(ctx, tx, userID)
	if err != nil {
		return err
	}
	if active {
		return &apiError{Status: 409, Message: "Account deletion is waiting for active work to stop", Code: "processing_pending", RetryAfter: 10}
	}
	// Delete email verification/reset artifacts too: they intentionally have no
	// user FK in the Auth.js-compatible schema.
	if _, err = tx.ExecContext(ctx, `DELETE FROM verification_tokens t USING users u WHERE u.id=$1 AND t.identifier IN (u.email,'email-activation:'||u.email,'password-reset:'||u.email)`, userID); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM users WHERE id=$1`, userID); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM account_deletion_requests WHERE user_id=$1`, userID); err != nil {
		return err
	}
	return tx.Commit()
}

func (h *Handler) deleteAccount(ctx context.Context, userID string, authenticatedAt int64, input DeletionInput) error {
	user, err := h.deletionAccount(ctx, userID)
	if errors.Is(err, sql.ErrNoRows) {
		done, e := h.finished(ctx, userID)
		if e != nil {
			return e
		}
		if done {
			return nil
		}
		return &apiError{Status: 409, Message: "Account deletion state requires support assistance"}
	}
	if err != nil {
		return err
	}
	if err = confirm(input, user, authenticatedAt, h.now().Unix()); err != nil {
		return err
	}
	if err = h.freeze(ctx, userID, user); err != nil {
		if done, _ := h.finished(ctx, userID); done {
			return nil
		}
		return err
	}
	if err = h.stopWork(ctx, userID); err != nil {
		if done, _ := h.finished(ctx, userID); done {
			return nil
		}
		h.recordFailure(ctx, userID, "database_deletion_failed")
		return err
	}
	if err = h.billing.CancelForDeletion(ctx, userID); err != nil {
		done, _ := h.finished(ctx, userID)
		if done {
			return nil
		}
		h.recordFailure(ctx, userID, "billing_cancellation_failed")
		var provider *billing.Error
		if errors.As(err, &provider) {
			return err
		}
		return &apiError{Status: 502, Message: "Billing cleanup could not be completed. Your account was not deleted."}
	}
	active, err := activeWork(ctx, h.db, userID)
	if err != nil {
		return err
	}
	if active {
		return &apiError{Status: 409, Message: "Account deletion is waiting for active work to stop", Code: "processing_pending", RetryAfter: 10}
	}
	cleanup, err := h.media.CleanupAccount(ctx, userID)
	if err != nil || !cleanup.Complete {
		done, _ := h.finished(ctx, userID)
		if done {
			return nil
		}
		h.recordFailure(ctx, userID, "media_cleanup_failed")
		return &apiError{Status: 502, Message: "Account media could not be removed. Your database records were not deleted."}
	}
	if err = h.finalize(ctx, userID); err != nil {
		done, _ := h.finished(ctx, userID)
		if done {
			return nil
		}
		h.recordFailure(ctx, userID, "database_deletion_failed")
		return err
	}
	return nil
}
