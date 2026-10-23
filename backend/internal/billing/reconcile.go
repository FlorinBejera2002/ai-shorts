package billing

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"net/url"
	"time"

	"sneepcut/backend-go/internal/identity"
)

func (s *Service) matchesMode(value object) bool {
	live, present := value["livemode"]
	if !present {
		return true
	}
	flag, valid := live.(bool)
	return valid && flag == (s.cfg.Mode == "live")
}

func (s *Service) reconcile(w http.ResponseWriter, r *http.Request) {
	var input struct{}
	if !readJSON(w, r, &input) {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
	defer cancel()
	if err := s.Reconcile(ctx, identity.Current(r).User.ID); err != nil {
		if s.cfg.Logger != nil {
			s.cfg.Logger.ErrorContext(ctx, "Stripe reconciliation failed", "code", processingCode(err, "reconciliation_failed"))
		}
		writeFailure(w, err)
		return
	}
	write(w, http.StatusOK, object{"reconciled": true})
}

func processingCode(err error, fallback string) string {
	var failure *Error
	if errors.As(err, &failure) {
		return failure.Code
	}
	return fallback
}

// Reconcile repairs a single account from Stripe, using the same transactions
// and grant deduplication as webhook delivery. It never creates, cancels or
// modifies a Stripe object and cannot accept a customer ID from the browser.
func (s *Service) Reconcile(ctx context.Context, userID string) error {
	if !uuidPattern.MatchString(userID) || !s.completePlans() {
		return conflict("billing_state_invalid")
	}
	a, err := s.account(ctx, userID)
	if err != nil {
		return err
	}
	pending, err := s.deletionPending(ctx, userID)
	if err != nil {
		return err
	}
	if pending {
		return conflict("account_deletion_in_progress")
	}
	// The durable checkout claim locates a completed Checkout even if its
	// creation response and every initial webhook were lost.
	c, err := s.loadClaim(ctx, userID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	if err == nil {
		var session object
		if c.SessionID == "" {
			session, err = s.findProviderCheckout(ctx, c)
		} else {
			session, err = s.session(ctx, c.SessionID)
		}
		if err != nil {
			return err
		}
		if session != nil {
			if !matchesClaim(session, c) || !s.matchesMode(session) {
				return conflict("billing_state_invalid")
			}
			if session.text("status") == "complete" {
				if _, err = s.processEvent(ctx, reconciliationEvent("checkout:"+session.text("id"), "checkout.session.completed", session, s.now())); err != nil {
					return err
				}
			}
		}
	}
	a, err = s.account(ctx, userID)
	if err != nil || a.CustomerID == "" {
		return err
	}
	// Fetching the provider snapshot inside the customer lock serializes this
	// recovery operation with webhook processing across all API instances.
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,8675309))`, a.CustomerID); err != nil {
		return err
	}
	if err = s.subscriptionChanged(ctx, tx, object{"id": a.SubscriptionID, "customer": a.CustomerID, "metadata": object{"userId": userID}}, s.now().Unix()); err != nil {
		return err
	}
	if err = tx.Commit(); err != nil {
		return err
	}
	// Page through every paid invoice, including old subscriptions on this
	// customer. Rollover credits remain earned after a later plan change.
	invoices, err := s.listProvider(ctx, "/invoices", url.Values{"customer": {a.CustomerID}, "status": {"paid"}})
	if err != nil {
		return err
	}
	for _, invoice := range invoices {
		if invoice.id("customer") != a.CustomerID || !s.matchesMode(invoice) || invoice.text("status") != "paid" {
			return conflict("billing_state_invalid")
		}
		if _, err = s.processEvent(ctx, reconciliationEvent("invoice:"+invoice.text("id"), "invoice.paid", invoice, s.now())); err != nil {
			return err
		}
	}
	return nil
}

func reconciliationEvent(source, kind string, data object, now time.Time) object {
	return object{"id": "reconcile:" + source, "type": kind, "created": now.Unix(), "data": object{"object": data}}
}
