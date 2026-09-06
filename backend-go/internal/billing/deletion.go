package billing

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"net/url"
	"time"
)

type deletionCheckpoint struct {
	CustomerID, SubscriptionID string
	Completed                  bool
}

func scanCheckpoint(row scanner) (deletionCheckpoint, error) {
	var c deletionCheckpoint
	err := row.Scan(&c.CustomerID, &c.SubscriptionID, &c.Completed)
	return c, err
}

const checkpointColumns = `COALESCE(stripe_customer_id,''),COALESCE(stripe_subscription_id,''),billing_cancellation_completed`

func (s *Service) checkpoint(ctx context.Context, userID string) (deletionCheckpoint, error) {
	return scanCheckpoint(s.db.QueryRowContext(ctx, `SELECT `+checkpointColumns+` FROM account_deletion_requests WHERE user_id=$1`, userID))
}
func pendingCheckout(wait time.Duration) error {
	return &Error{Status: 409, Code: "checkout_reconciliation_pending", RetryAfterSeconds: max(1, int(wait.Seconds()+1))}
}
func (s *Service) closePendingCheckout(ctx context.Context, userID string) (*claim, object, error) {
	c, err := s.loadClaim(ctx, userID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil, nil
	}
	if err != nil {
		return nil, nil, err
	}
	var session object
	if c.SessionID == "" {
		state := recoveryState(c, s.now())
		if state == "leased" {
			return nil, nil, pendingCheckout(c.LeaseExpiresAt.Sub(s.now()))
		}
		token, err := newToken()
		if err != nil {
			return nil, nil, err
		}
		lease := s.now().Add(claimLease)
		result, err := s.db.ExecContext(ctx, `UPDATE billing_checkout_claims SET token=$4,lease_expires_at=$5,updated_at=now() WHERE user_id=$1 AND token=$2 AND generation=$3 AND session_id IS NULL AND lease_expires_at<=$6`, c.UserID, c.Token, c.Generation, token, lease, s.now())
		if err != nil {
			return nil, nil, err
		}
		n, err := result.RowsAffected()
		if err != nil {
			return nil, nil, err
		}
		if n != 1 {
			return nil, nil, pendingCheckout(2 * time.Second)
		}
		c.Token = token
		c.LeaseExpiresAt = lease
		if state == "replayable" && c.CheckoutExpiresAt.Sub(s.now()) >= replayMinimum {
			if !paid(c.PlanID) || (c.Locale != "en" && c.Locale != "ro") {
				return nil, nil, conflict("billing_state_invalid")
			}
			session, err = s.createProviderCheckout(ctx, c)
		} else {
			session, err = s.findProviderCheckout(ctx, c)
			if err == nil && session == nil {
				if state == "expired" {
					return nil, nil, s.releaseClaim(ctx, c)
				}
				return nil, nil, pendingCheckout(c.CheckoutExpiresAt.Add(expiryGrace).Sub(s.now()))
			}
		}
		if err != nil {
			return nil, nil, err
		}
		if !matchesClaim(session, c) {
			return nil, nil, conflict("billing_state_invalid")
		}
		if err = s.persistSession(ctx, c, session.text("id")); err != nil {
			return nil, nil, err
		}
		c.SessionID = session.text("id")
	} else {
		session, err = s.session(ctx, c.SessionID)
		if err != nil {
			return nil, nil, err
		}
	}
	if !matchesClaim(session, c) {
		return nil, nil, conflict("billing_state_invalid")
	}
	switch session.text("status") {
	case "complete":
		if session.id("customer") == "" || session.id("subscription") == "" {
			return nil, nil, conflict("billing_state_invalid")
		}
		return &c, session, nil
	case "open":
		if err = s.expire(ctx, c.SessionID); err != nil {
			return nil, nil, err
		}
	case "expired":
	default:
		return nil, nil, conflict("billing_state_invalid")
	}
	return nil, nil, s.releaseClaim(ctx, c)
}
func (s *Service) adoptCheckout(ctx context.Context, userID string, session object) (deletionCheckpoint, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return deletionCheckpoint{}, err
	}
	defer tx.Rollback()
	a, err := scanAccount(tx.QueryRowContext(ctx, `SELECT `+accountColumns+` FROM users WHERE id=$1 FOR UPDATE`, userID))
	if err != nil {
		return deletionCheckpoint{}, err
	}
	checkpoint, err := scanCheckpoint(tx.QueryRowContext(ctx, `SELECT `+checkpointColumns+` FROM account_deletion_requests WHERE user_id=$1 FOR UPDATE`, userID))
	if err != nil {
		return deletionCheckpoint{}, err
	}
	customer := session.id("customer")
	subscription := session.id("subscription")
	if checkpoint.Completed && checkpoint.CustomerID == customer {
		return checkpoint, tx.Commit()
	}
	if !checkpoint.Completed && ((checkpoint.CustomerID != "" && checkpoint.CustomerID != customer) || (checkpoint.CustomerID == "" && checkpoint.SubscriptionID != "" && checkpoint.SubscriptionID != subscription)) {
		return deletionCheckpoint{}, conflict("billing_checkpoint_conflict")
	}
	if checkpoint.Completed {
		cleaned := a.Plan == "free" && a.CustomerID == checkpoint.CustomerID && a.SubscriptionID == checkpoint.SubscriptionID && (a.SubscriptionStatus == "canceled" || checkpoint.SubscriptionID == "") && !a.CancelAtPeriodEnd && !a.CurrentPeriodEnd.Valid
		recovered := a.CustomerID == customer && a.SubscriptionID == subscription
		if !cleaned && !recovered {
			return deletionCheckpoint{}, conflict("billing_checkpoint_conflict")
		}
		_, err = tx.ExecContext(ctx, `UPDATE users SET plan='free',stripe_customer_id=$2,stripe_subscription_id=$3,stripe_subscription_status='incomplete',stripe_cancel_at_period_end=false,stripe_current_period_end=NULL WHERE id=$1`, userID, customer, subscription)
		if err != nil {
			return deletionCheckpoint{}, err
		}
	}
	if checkpoint.CustomerID == "" || checkpoint.Completed {
		checkpoint.CustomerID = customer
	}
	if checkpoint.SubscriptionID == "" || checkpoint.Completed {
		checkpoint.SubscriptionID = subscription
	}
	checkpoint.Completed = false
	_, err = tx.ExecContext(ctx, `UPDATE account_deletion_requests SET stripe_customer_id=$2,stripe_subscription_id=$3,billing_cancellation_completed=false,last_failure=NULL,updated_at=now() WHERE user_id=$1`, userID, nullable(checkpoint.CustomerID), nullable(checkpoint.SubscriptionID))
	if err != nil {
		return deletionCheckpoint{}, err
	}
	return checkpoint, tx.Commit()
}
func (s *Service) refreshCheckpoint(ctx context.Context, userID string) (deletionCheckpoint, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return deletionCheckpoint{}, err
	}
	defer tx.Rollback()
	a, err := scanAccount(tx.QueryRowContext(ctx, `SELECT `+accountColumns+` FROM users WHERE id=$1 FOR UPDATE`, userID))
	if err != nil {
		return deletionCheckpoint{}, err
	}
	checkpoint, err := scanCheckpoint(tx.QueryRowContext(ctx, `SELECT `+checkpointColumns+` FROM account_deletion_requests WHERE user_id=$1 FOR UPDATE`, userID))
	if err != nil {
		return deletionCheckpoint{}, err
	}
	if checkpoint.Completed {
		changedCustomer := a.CustomerID != "" && a.CustomerID != checkpoint.CustomerID
		changedSubscription := a.CustomerID == "" && checkpoint.CustomerID == "" && a.SubscriptionID != "" && a.SubscriptionID != checkpoint.SubscriptionID
		if changedCustomer || changedSubscription {
			checkpoint.CustomerID = a.CustomerID
			checkpoint.SubscriptionID = a.SubscriptionID
			checkpoint.Completed = false
			_, err = tx.ExecContext(ctx, `UPDATE account_deletion_requests SET stripe_customer_id=$2,stripe_subscription_id=$3,billing_cancellation_completed=false,last_failure=NULL,updated_at=now() WHERE user_id=$1`, userID, nullable(checkpoint.CustomerID), nullable(checkpoint.SubscriptionID))
			if err != nil {
				return deletionCheckpoint{}, err
			}
		}
	} else {
		if (checkpoint.CustomerID == "" && a.CustomerID != "") || (checkpoint.SubscriptionID == "" && a.SubscriptionID != "") {
			// Complete partial snapshots without replacing outstanding resources.
			if checkpoint.CustomerID == "" {
				checkpoint.CustomerID = a.CustomerID
			}
			if checkpoint.SubscriptionID == "" {
				checkpoint.SubscriptionID = a.SubscriptionID
			}
			_, err = tx.ExecContext(ctx, `UPDATE account_deletion_requests SET stripe_customer_id=$2,stripe_subscription_id=$3,updated_at=now() WHERE user_id=$1`, userID, nullable(checkpoint.CustomerID), nullable(checkpoint.SubscriptionID))
			if err != nil {
				return deletionCheckpoint{}, err
			}
		}
	}
	return checkpoint, tx.Commit()
}
func (s *Service) markCancelled(ctx context.Context, userID string, expected deletionCheckpoint) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	a, err := scanAccount(tx.QueryRowContext(ctx, `SELECT `+accountColumns+` FROM users WHERE id=$1 FOR UPDATE`, userID))
	if err != nil {
		return err
	}
	checkpoint, err := scanCheckpoint(tx.QueryRowContext(ctx, `SELECT `+checkpointColumns+` FROM account_deletion_requests WHERE user_id=$1 FOR UPDATE`, userID))
	if err != nil {
		return err
	}
	if checkpoint.CustomerID != expected.CustomerID || checkpoint.SubscriptionID != expected.SubscriptionID {
		return conflict("billing_checkpoint_changed")
	}
	if a.CustomerID != "" && a.CustomerID != checkpoint.CustomerID {
		return conflict("billing_checkpoint_changed")
	}
	if checkpoint.CustomerID == "" && a.SubscriptionID != "" && a.SubscriptionID != checkpoint.SubscriptionID {
		return conflict("billing_checkpoint_changed")
	}
	var pending bool
	if err = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM billing_checkout_claims WHERE user_id=$1)`, userID).Scan(&pending); err != nil {
		return err
	}
	if pending {
		return pendingCheckout(2 * time.Second)
	}
	status := any(nil)
	if checkpoint.SubscriptionID != "" {
		status = "canceled"
	}
	_, err = tx.ExecContext(ctx, `UPDATE users SET plan='free',stripe_customer_id=$2,stripe_subscription_id=$3,stripe_subscription_status=$4,stripe_cancel_at_period_end=false,stripe_current_period_end=NULL WHERE id=$1`, userID, nullable(checkpoint.CustomerID), nullable(checkpoint.SubscriptionID), status)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `UPDATE account_deletion_requests SET billing_cancellation_completed=true,last_failure=NULL,updated_at=now() WHERE user_id=$1`, userID)
	if err != nil {
		return err
	}
	return tx.Commit()
}

// CancelForDeletion runs only after the caller has durably blocked new work.
// Provider identifiers remain as tombstones until account finalization.
func (s *Service) CancelForDeletion(ctx context.Context, userID string) error {
	if !uuidPattern.MatchString(userID) {
		return conflict("invalid_account")
	}
	if _, err := s.checkpoint(ctx, userID); err != nil {
		return err
	}
	completedClaim, session, err := s.closePendingCheckout(ctx, userID)
	if err != nil {
		return err
	}
	checkpoint, err := s.refreshCheckpoint(ctx, userID)
	if err != nil {
		return err
	}
	if completedClaim != nil {
		checkpoint, err = s.adoptCheckout(ctx, userID, session)
		if err != nil {
			return err
		}
	}
	if !checkpoint.Completed {
		if checkpoint.CustomerID != "" {
			_, err = s.provider(ctx, http.MethodDelete, "/customers/"+url.PathEscape(checkpoint.CustomerID), nil, "")
		} else if checkpoint.SubscriptionID != "" {
			_, err = s.provider(ctx, http.MethodDelete, "/subscriptions/"+url.PathEscape(checkpoint.SubscriptionID), nil, "")
		}
		if err != nil && !missingResource(err) {
			return err
		}
	}
	if completedClaim != nil {
		if err = s.releaseClaim(ctx, *completedClaim); err != nil {
			return err
		}
	}
	return s.markCancelled(ctx, userID, checkpoint)
}
