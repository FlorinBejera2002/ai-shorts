package billing

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"reflect"
	"sync"
	"testing"
	"time"
)

func TestPostgresCheckoutRechecksLockedAccountBeforeCreatingOrRotating(t *testing.T) {
	s, _, db := billingDatabase(t)
	snapshot := claimSnapshot()
	execute(t, db, `UPDATE users SET plan='creator',stripe_customer_id='cus_activated',stripe_subscription_id='sub_activated',stripe_subscription_status='active' WHERE id=$1`, fixtureUser)
	_, _, err := s.claimOrLoad(context.Background(), snapshot)
	requireBillingError(t, err, "checkout_processing")
	if _, err := s.loadClaim(context.Background(), fixtureUser); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("stale request created a checkout claim: %v", err)
	}
	execute(t, db, `UPDATE users SET plan='free',stripe_customer_id=NULL,stripe_subscription_id=NULL,stripe_subscription_status=NULL WHERE id=$1`, fixtureUser)
	c, _, err := s.claimOrLoad(context.Background(), snapshot)
	if err != nil {
		t.Fatal(err)
	}
	execute(t, db, `UPDATE users SET plan='creator',stripe_customer_id='cus_activated',stripe_subscription_id='sub_activated',stripe_subscription_status='active' WHERE id=$1`, fixtureUser)
	_, err = s.rotateClaim(context.Background(), c, snapshot)
	requireBillingError(t, err, "checkout_processing")
	current, err := s.loadClaim(context.Background(), fixtureUser)
	if err != nil || current.Generation != c.Generation {
		t.Fatalf("stale request rotated an activated account: %+v %v", current, err)
	}
}

func TestPostgresReconcileRecoversLostCheckoutAndPaidInvoiceOnce(t *testing.T) {
	s, p, db := billingDatabase(t)
	c, _, err := s.claimOrLoad(context.Background(), claimSnapshot())
	if err != nil {
		t.Fatal(err)
	}
	checkout := checkoutForClaim(c, "cs_test_lost", "complete")
	checkout["payment_status"] = "paid"
	p.sessions[checkout.text("id")] = checkout
	p.subs = []object{subscriptionFixture("sub_recovered", "cus_recovered", "creator", "active", c.Generation)}
	invoice := invoiceFixture()
	invoice["customer"] = "cus_recovered"
	invoice["status"] = "paid"
	invoice.child("parent").child("subscription_details")["subscription"] = "sub_recovered"
	p.invoices = []object{invoice}
	// Stripe can be briefly unavailable after completing payment. Nothing is
	// granted until a provider fetch succeeds, and the durable claim survives.
	p.failList = true
	if err = s.Reconcile(context.Background(), fixtureUser); err == nil {
		t.Fatal("provider outage accepted as successful reconciliation")
	}
	requireAccount(t, s, 100, "free", "")
	p.failList = false
	if err = s.Reconcile(context.Background(), fixtureUser); err != nil {
		t.Fatal(err)
	}
	a := requireAccount(t, s, 1600, "creator", "active")
	if a.CustomerID != "cus_recovered" || a.SubscriptionID != "sub_recovered" {
		t.Fatalf("lost checkout was not recovered: %+v", a)
	}
	if _, err = s.loadClaim(context.Background(), fixtureUser); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("completed checkout claim retained: %v", err)
	}
	var wg sync.WaitGroup
	errs := make(chan error, 8)
	for i := range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if i%2 == 0 {
				errs <- s.Reconcile(context.Background(), fixtureUser)
			} else {
				_, err := s.processEvent(context.Background(), eventFor(fmt.Sprintf("evt_paid_%d", i), "invoice.payment_succeeded", invoice, 100))
				errs <- err
			}
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	requireAccount(t, s, 1600, "creator", "active")
	var grants int
	if err := db.QueryRow(`SELECT count(*) FROM stripe_events WHERE credit_grant_id='invoice:in_cycle'`).Scan(&grants); err != nil || grants != 1 {
		t.Fatalf("invoice grant count %d: %v", grants, err)
	}
	other, err := s.account(context.Background(), fixtureOther)
	if err != nil || other.Credits != 100 || other.CustomerID != "" {
		t.Fatalf("foreign account was changed: %+v %v", other, err)
	}
}

func TestPostgresIgnoredEarlyInvoiceDoesNotConsumeGrant(t *testing.T) {
	s, p, db := billingDatabase(t)
	invoice := invoiceFixture()
	invoice["status"] = "paid"
	invoice.child("parent").child("subscription_details")["metadata"] = object{}
	if _, err := s.processEvent(context.Background(), eventFor("evt_before_binding", "invoice.paid", invoice, 100)); err != nil {
		t.Fatal(err)
	}
	var grants int
	if err := db.QueryRow(`SELECT count(*) FROM stripe_events WHERE credit_grant_id IS NOT NULL`).Scan(&grants); err != nil || grants != 0 {
		t.Fatal("ignored event consumed its credit grant")
	}
	execute(t, db, `UPDATE users SET stripe_customer_id='cus_invoice',stripe_subscription_id='sub_invoice' WHERE id=$1`, fixtureUser)
	p.subs = []object{subscriptionFixture("sub_invoice", "cus_invoice", "creator", "active", 1)}
	p.invoices = []object{invoice}
	if err := s.Reconcile(context.Background(), fixtureUser); err != nil {
		t.Fatal(err)
	}
	requireAccount(t, s, 1600, "creator", "active")
}

func TestPostgresTerminalSubscriptionCanBeReplacedByCompletedCheckout(t *testing.T) {
	s, p, db := billingDatabase(t)
	execute(t, db, `UPDATE users SET stripe_customer_id='cus_recovered',stripe_subscription_id='sub_old',stripe_subscription_status='canceled',stripe_checkout_generation=1 WHERE id=$1`, fixtureUser)
	snapshot := claimSnapshot()
	snapshot.CustomerID = "cus_recovered"
	c, _, err := s.claimOrLoad(context.Background(), snapshot)
	if err != nil {
		t.Fatal(err)
	}
	p.subs = []object{subscriptionFixture("sub_recovered", "cus_recovered", "creator", "active", 2), subscriptionFixture("sub_old", "cus_recovered", "creator", "canceled", 1)}
	if _, err := s.processEvent(context.Background(), eventFor("evt_resubscribed", "checkout.session.completed", checkoutForClaim(c, "cs_test_new", "complete"), 100)); err != nil {
		t.Fatal(err)
	}
	a := requireAccount(t, s, 100, "creator", "active")
	if a.SubscriptionID != "sub_recovered" {
		t.Fatalf("old terminal subscription retained: %+v", a)
	}
	if _, err = s.loadClaim(context.Background(), fixtureUser); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("completed resubscription claim retained: %v", err)
	}
}

func TestPostgresPaymentFailuresAndStaleEventsFollowCurrentStripeState(t *testing.T) {
	s, p, db := billingDatabase(t)
	execute(t, db, `UPDATE users SET plan='creator',stripe_customer_id='cus_invoice',stripe_subscription_id='sub_invoice',stripe_subscription_status='active' WHERE id=$1`, fixtureUser)
	sub := subscriptionFixture("sub_invoice", "cus_invoice", "creator", "past_due", 1)
	p.subs = []object{sub}
	for _, kind := range []string{"invoice.payment_failed", "invoice.payment_action_required"} {
		if _, err := s.processEvent(context.Background(), eventFor("evt_"+kind, kind, invoiceFixture(), 100)); err != nil {
			t.Fatal(err)
		}
	}
	requireAccount(t, s, 100, "free", "past_due")
	partial := invoiceFixture()
	partial["status"], partial["amount_remaining"] = "open", 500
	if _, err := s.processEvent(context.Background(), eventFor("evt_partial_payment", "invoice.payment_succeeded", partial, 100)); err != nil {
		t.Fatal(err)
	}
	requireAccount(t, s, 100, "free", "past_due")
	sub["status"] = "active"
	if _, err := s.processEvent(context.Background(), eventFor("evt_recovered_payment", "invoice.paid", invoiceFixture(), 101)); err != nil {
		t.Fatal(err)
	}
	if _, err := s.processEvent(context.Background(), eventFor("evt_delayed_failure", "invoice.payment_failed", invoiceFixture(), 99)); err != nil {
		t.Fatal(err)
	}
	requireAccount(t, s, 1600, "creator", "active")
	sub["status"] = "paused"
	if _, err := s.processEvent(context.Background(), eventFor("evt_paused", "customer.subscription.paused", sub, 102)); err != nil {
		t.Fatal(err)
	}
	requireAccount(t, s, 1600, "free", "paused")
	sub["status"] = "active"
	if _, err := s.processEvent(context.Background(), eventFor("evt_resumed", "customer.subscription.resumed", sub, 103)); err != nil {
		t.Fatal(err)
	}
	requireAccount(t, s, 1600, "creator", "active")
	p.subs = nil
	if _, err := s.processEvent(context.Background(), eventFor("evt_missing_source", "customer.subscription.updated", sub, time.Now().Unix())); err == nil {
		t.Fatal("missing source accepted an event snapshot")
	}
	requireAccount(t, s, 1600, "creator", "active")
}

func TestPostgresPortalPlanChangeAndScheduledCancellationPreserveCredits(t *testing.T) {
	s, p, db := billingDatabase(t)
	execute(t, db, `UPDATE users SET stripe_customer_id='cus_invoice',stripe_subscription_id='sub_invoice' WHERE id=$1`, fixtureUser)
	sub := subscriptionFixture("sub_invoice", "cus_invoice", "creator", "active", 1)
	p.subs = []object{sub}
	apply := func(id string) {
		t.Helper()
		if _, err := s.processEvent(context.Background(), eventFor(id, "customer.subscription.updated", sub, 100)); err != nil {
			t.Fatal(err)
		}
	}
	apply("evt_initial_plan")
	requireAccount(t, s, 100, "creator", "active")
	// Portal changes the actual subscription item. Its creation metadata can
	// still name the old plan and must never override the purchased price.
	sub["items"] = object{"data": []object{{"price": "price_pro", "quantity": 1, "current_period_end": 1788699999}}}
	apply("evt_portal_upgrade")
	requireAccount(t, s, 100, "pro", "active")
	proration := invoiceFixture()
	proration["id"], proration["billing_reason"] = "in_upgrade", "subscription_update"
	if _, err := s.processEvent(context.Background(), eventFor("evt_upgrade_invoice", "invoice.paid", proration, 101)); err != nil {
		t.Fatal(err)
	}
	requireAccount(t, s, 100, "pro", "active")
	sub["cancel_at_period_end"] = true
	apply("evt_scheduled_cancel")
	a := requireAccount(t, s, 100, "pro", "active")
	if !a.CancelAtPeriodEnd || !a.CurrentPeriodEnd.Valid {
		t.Fatalf("scheduled cancellation not shown: %+v", a)
	}
	sub["status"], sub["cancel_at_period_end"] = "canceled", false
	apply("evt_period_ended")
	requireAccount(t, s, 100, "free", "canceled")
	sub["status"] = "active"
	sub["items"] = object{"data": []object{{"price": "price_unmanaged", "quantity": 1}}}
	apply("evt_unmanaged_price")
	requireAccount(t, s, 100, "free", "active")
	// Multiple active subscriptions require operator review; no arbitrary
	// subscription may win because Stripe happened to list it first.
	p.subs = append(p.subs, subscriptionFixture("sub_duplicate", "cus_invoice", "agency", "active", 2))
	if _, err := s.processEvent(context.Background(), eventFor("evt_duplicate_subscription", "customer.subscription.updated", sub, 103)); err == nil {
		t.Fatal("duplicate active subscriptions were silently selected")
	}
	requireAccount(t, s, 100, "free", "active")
}

func TestPostgresPaidInvoiceLoadsAllLinePagesBeforeResolvingCredits(t *testing.T) {
	s, p, db := billingDatabase(t)
	execute(t, db, `UPDATE users SET stripe_customer_id='cus_invoice',stripe_subscription_id='sub_invoice' WHERE id=$1`, fixtureUser)
	p.subs = []object{subscriptionFixture("sub_invoice", "cus_invoice", "creator", "active", 1)}
	var cursors []string
	s.client.Transport = transportFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/v1/invoices/in_cycle/lines" {
			return p.RoundTrip(r)
		}
		cursor := r.URL.Query().Get("starting_after")
		cursors = append(cursors, cursor)
		if cursor == "" {
			return providerResponse(200, object{"data": []object{{"id": "il_note", "description": "Synthetic invoice annotation"}}, "has_more": true})
		}
		if cursor != "il_note" {
			t.Fatalf("unexpected invoice cursor %q", cursor)
		}
		return providerResponse(200, object{"data": []object{{"id": "il_recurring", "quantity": 1, "pricing": object{"price_details": object{"price": "price_creator"}}}}, "has_more": false})
	})
	invoice := invoiceFixture()
	// The partial embedded list must be replaced by the complete provider
	// result. listProvider returns []object, not the decoder's []any shape.
	invoice["lines"] = object{"data": []object{{"id": "il_partial", "price": "price_unmanaged"}}, "has_more": true}
	if _, err := s.processEvent(context.Background(), eventFor("evt_paginated_invoice", "invoice.paid", invoice, 100)); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(cursors, []string{"", "il_note"}) {
		t.Fatalf("invoice line pagination incomplete: %v", cursors)
	}
	requireAccount(t, s, 1600, "creator", "active")
	if _, err := s.processEvent(context.Background(), eventFor("evt_paginated_invoice_duplicate", "invoice.payment_succeeded", invoice, 101)); err != nil {
		t.Fatal(err)
	}
	requireAccount(t, s, 1600, "creator", "active")
}
