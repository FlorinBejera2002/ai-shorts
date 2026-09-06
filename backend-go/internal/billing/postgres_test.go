package billing

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"sneepcut/backend-go/internal/testdb"
)

func billingDatabase(t *testing.T) (*Service, *stripeFixture, *sql.DB) {
	t.Helper()
	db := testdb.Open(t)
	_, err := db.Exec(`INSERT INTO users(id,email,provider,credits,plan) VALUES($1,'synthetic@example.test','credentials',100,'free'),($2,'synthetic-other@example.test','credentials',100,'free')`, fixtureUser, fixtureOther)
	if err != nil {
		t.Fatal(err)
	}
	p := newStripeFixture()
	s, err := NewService(configForTest(p), db, nil)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 9, 6, 12, 0, 0, 0, time.UTC)
	s.now = func() time.Time { return now }
	return s, p, db
}
func execute(t *testing.T, db *sql.DB, query string, args ...any) {
	t.Helper()
	if _, err := db.Exec(query, args...); err != nil {
		t.Fatal(err)
	}
}
func requireBillingError(t *testing.T, err error, code string) {
	t.Helper()
	var e *Error
	if !errors.As(err, &e) || e.Code != code || e.Status != 409 {
		t.Fatalf("got %v, want %s", err, code)
	}
}
func claimSnapshot() claim {
	return claim{UserID: fixtureUser, PlanID: "creator", PriceID: "price_creator", Locale: "ro", CustomerEmail: "snapshot@example.test", SuccessURL: "https://app.example.test/ro/dashboard/billing?checkout_session_id={CHECKOUT_SESSION_ID}", CancelURL: "https://app.example.test/ro/dashboard/billing?canceled=true"}
}
func checkoutForClaim(c claim, id, status string) object {
	return object{"id": id, "mode": "subscription", "status": status, "client_reference_id": c.UserID, "customer": "cus_recovered", "subscription": "sub_recovered", "url": "https://checkout.stripe.test/" + id, "metadata": object{"userId": c.UserID, "planId": c.PlanID, "priceId": c.PriceID, "checkoutGeneration": fmt.Sprint(c.Generation)}}
}
func eventFor(id, kind string, data object, created int64) object {
	// Pass through JSON to reproduce expandable objects and numeric decoding.
	raw, _ := json.Marshal(object{"id": id, "type": kind, "created": created, "data": object{"object": data}})
	event, _ := decodeObject(raw)
	return event
}
func requireAccount(t *testing.T, s *Service, credits int, plan, subStatus string) account {
	t.Helper()
	a, err := s.account(context.Background(), fixtureUser)
	if err != nil || a.Credits != credits || a.Plan != plan || a.SubscriptionStatus != subStatus {
		t.Fatalf("account %+v; err %v", a, err)
	}
	return a
}

func TestPostgresConcurrentCheckoutCreatesOneProviderOperation(t *testing.T) {
	s, p, _ := billingDatabase(t)
	var wg sync.WaitGroup
	errs := make(chan error, 12)
	for range 12 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := s.startCheckout(context.Background(), fixtureUser, "creator", "en")
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			requireBillingError(t, err, "checkout_in_progress")
		}
	}
	if len(p.sessions) != 1 || len(p.keys) != 1 {
		t.Fatalf("duplicate provider operations: %d", len(p.sessions))
	}
	c, err := s.loadClaim(context.Background(), fixtureUser)
	if err != nil || c.Generation != 1 || c.SessionID == "" {
		t.Fatalf("claim %+v: %v", c, err)
	}
	result, err := s.startCheckout(context.Background(), fixtureUser, "creator", "en")
	if err != nil || result.text("url") != p.sessions[c.SessionID].text("url") {
		t.Fatalf("reuse: %v %v", result, err)
	}
	// A different plan expires the original session before rotating generation.
	if _, err = s.startCheckout(context.Background(), fixtureUser, "pro", "en"); err != nil {
		t.Fatal(err)
	}
	next, err := s.loadClaim(context.Background(), fixtureUser)
	if err != nil || next.Generation != 2 || p.sessions[c.SessionID].text("status") != "expired" || len(p.sessions) != 2 {
		t.Fatalf("plan switch: %+v %v", next, err)
	}
}

func TestPostgresLostCheckoutResponseReplaysImmutableSnapshot(t *testing.T) {
	s, p, db := billingDatabase(t)
	p.dropCreate = true
	if _, err := s.startCheckout(context.Background(), fixtureUser, "creator", "ro"); err == nil {
		t.Fatal("expected lost response")
	}
	before, err := s.loadClaim(context.Background(), fixtureUser)
	if err != nil || before.SessionID != "" {
		t.Fatalf("claim lost: %+v %v", before, err)
	}
	// Changes in config and account state must not alter a previously sent form.
	execute(t, db, `UPDATE users SET email='changed@example.test' WHERE id=$1`, fixtureUser)
	s.cfg.PlanPrices["creator"] = "price_creator_new"
	now := s.now().Add(3 * time.Minute)
	s.now = func() time.Time { return now }
	if _, err = s.startCheckout(context.Background(), fixtureUser, "creator", "en"); err != nil {
		t.Fatal(err)
	}
	after, err := s.loadClaim(context.Background(), fixtureUser)
	if err != nil || after.Generation != before.Generation || after.CustomerEmail != before.CustomerEmail || after.PriceID != before.PriceID || after.Locale != before.Locale || !after.CheckoutExpiresAt.Equal(before.CheckoutExpiresAt) || after.SessionID == "" || len(p.sessions) != 1 {
		t.Fatalf("immutable replay changed %+v -> %+v (%v)", before, after, err)
	}
}

func TestPostgresUnknownCheckoutWaitsAndFindsCompletedPayment(t *testing.T) {
	s, p, db := billingDatabase(t)
	c, owned, err := s.claimOrLoad(context.Background(), claimSnapshot())
	if err != nil || !owned {
		t.Fatal(err)
	}
	now := c.CheckoutExpiresAt.Add(-20 * time.Minute)
	s.now = func() time.Time { return now }
	_, err = s.startCheckout(context.Background(), fixtureUser, "pro", "en")
	requireBillingError(t, err, "checkout_in_progress")
	if len(p.sessions) != 0 {
		t.Fatal("recreated checkout inside expiry cutoff")
	}
	retained, err := s.loadClaim(context.Background(), fixtureUser)
	if err != nil || retained.Generation != c.Generation {
		t.Fatal("unknown claim released")
	}
	now = c.CheckoutExpiresAt.Add(3 * time.Minute)
	p.failList = true
	if _, err = s.startCheckout(context.Background(), fixtureUser, "pro", "en"); err == nil {
		t.Fatal("provider outage accepted as no checkout")
	}
	retained, err = s.loadClaim(context.Background(), fixtureUser)
	if err != nil || retained.Generation != c.Generation {
		t.Fatal("provider outage discarded claim")
	}
	p.failList = false
	now = now.Add(3 * time.Minute)
	p.sessions["cs_test_completed"] = checkoutForClaim(c, "cs_test_completed", "complete")
	_, err = s.startCheckout(context.Background(), fixtureUser, "pro", "en")
	requireBillingError(t, err, "checkout_processing")
	retained, err = s.loadClaim(context.Background(), fixtureUser)
	if err != nil || retained.Generation != c.Generation || retained.SessionID != "cs_test_completed" {
		t.Fatalf("completed checkout lost %+v %v", retained, err)
	}
	// The deletion marker must suppress webhook grants and preserve the recovered
	// paid checkout until its customer has been canceled.
	execute(t, db, `INSERT INTO account_deletion_requests(user_id) VALUES($1)`, fixtureUser)
	p.failDelete = true
	if err = s.CancelForDeletion(context.Background(), fixtureUser); err == nil {
		t.Fatal("cleanup outage accepted")
	}
	cp, err := s.checkpoint(context.Background(), fixtureUser)
	if err != nil || cp.Completed || cp.CustomerID != "cus_recovered" {
		t.Fatalf("durable recovery %+v %v", cp, err)
	}
	if _, err = s.loadClaim(context.Background(), fixtureUser); err != nil {
		t.Fatal("claim released before cancellation")
	}
	p.failDelete = false
	if err = s.CancelForDeletion(context.Background(), fixtureUser); err != nil {
		t.Fatal(err)
	}
	cp, _ = s.checkpoint(context.Background(), fixtureUser)
	if !cp.Completed {
		t.Fatal("cancellation not certified")
	}
	if _, err = s.loadClaim(context.Background(), fixtureUser); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("closed claim remains: %v", err)
	}
	a := requireAccount(t, s, 100, "free", "canceled")
	if a.CustomerID != "cus_recovered" || a.SubscriptionID != "sub_recovered" {
		t.Fatal("provider tombstones lost")
	}
}

func TestPostgresDeletionWaitsForLeaseThenRecoversLostResponse(t *testing.T) {
	s, p, db := billingDatabase(t)
	p.dropCreate = true
	_, _ = s.startCheckout(context.Background(), fixtureUser, "creator", "ro")
	c, err := s.loadClaim(context.Background(), fixtureUser)
	if err != nil {
		t.Fatal(err)
	}
	execute(t, db, `INSERT INTO account_deletion_requests(user_id) VALUES($1)`, fixtureUser)
	requireBillingError(t, s.CancelForDeletion(context.Background(), fixtureUser), "checkout_reconciliation_pending")
	if len(p.keys) != 1 {
		t.Fatal("active lease replayed")
	}
	now := s.now().Add(3 * time.Minute)
	s.now = func() time.Time { return now }
	if err = s.CancelForDeletion(context.Background(), fixtureUser); err != nil {
		t.Fatal(err)
	}
	if len(p.keys) != 1 || p.sessions[p.keys[checkoutKey(fixtureUser, c.Generation)]].text("status") != "expired" {
		t.Fatal("recovered open checkout was not expired")
	}
	_, err = s.startCheckout(context.Background(), fixtureUser, "creator", "ro")
	requireBillingError(t, err, "account_deletion_in_progress")
}

func TestPostgresDeletionAdoptsPartialCheckpointWithoutOverwritingResources(t *testing.T) {
	s, p, db := billingDatabase(t)
	execute(t, db, `UPDATE users SET stripe_customer_id='cus_partial',stripe_subscription_id='sub_partial',stripe_subscription_status='active',plan='creator' WHERE id=$1`, fixtureUser)
	execute(t, db, `INSERT INTO account_deletion_requests(user_id,stripe_subscription_id) VALUES($1,'sub_partial')`, fixtureUser)
	if err := s.CancelForDeletion(context.Background(), fixtureUser); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(strings.Join(p.calls, "\n"), "DELETE /customers/cus_partial") {
		t.Fatal("missing customer was not adopted")
	}
	before := len(p.calls)
	if err := s.CancelForDeletion(context.Background(), fixtureUser); err != nil {
		t.Fatal(err)
	}
	if len(p.calls) != before {
		t.Fatal("completed cancellation called provider again")
	}
	// An outstanding resource is never silently replaced with a different one.
	execute(t, db, `UPDATE account_deletion_requests SET billing_cancellation_completed=false,stripe_customer_id='cus_outstanding',stripe_subscription_id=NULL WHERE user_id=$1`, fixtureUser)
	cp, err := s.refreshCheckpoint(context.Background(), fixtureUser)
	if err != nil || cp.CustomerID != "cus_outstanding" || cp.SubscriptionID != "sub_partial" {
		t.Fatalf("outstanding snapshot overwritten: %+v %v", cp, err)
	}
}

func TestPostgresDeletionReopensCompletedCheckpointForRecoveredCustomer(t *testing.T) {
	s, p, db := billingDatabase(t)
	execute(t, db, `UPDATE users SET stripe_customer_id='cus_already_deleted',stripe_subscription_id='sub_already_deleted',stripe_subscription_status='canceled' WHERE id=$1`, fixtureUser)
	execute(t, db, `INSERT INTO account_deletion_requests(user_id,stripe_customer_id,stripe_subscription_id,billing_cancellation_completed) VALUES($1,'cus_already_deleted','sub_already_deleted',true)`, fixtureUser)
	// Simulate a durable checkout created just before the deletion marker.
	c := claimSnapshot()
	c.Generation = 3
	c.Token = strings.Repeat("a", 64)
	c.CreatedAt = s.now().Add(-3 * time.Hour)
	c.CheckoutExpiresAt = s.now().Add(-time.Hour)
	c.LeaseExpiresAt = s.now().Add(-time.Minute)
	execute(t, db, `INSERT INTO billing_checkout_claims(user_id,token,plan_id,price_id,locale,customer_id,customer_email,success_url,cancel_url,generation,session_id,lease_expires_at,checkout_expires_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, claimArgs(c)...)
	p.sessions["cs_test_recovered"] = checkoutForClaim(c, "cs_test_recovered", "complete")
	if err := s.CancelForDeletion(context.Background(), fixtureUser); err != nil {
		t.Fatal(err)
	}
	cp, err := s.checkpoint(context.Background(), fixtureUser)
	if err != nil || !cp.Completed || cp.CustomerID != "cus_recovered" || cp.SubscriptionID != "sub_recovered" {
		t.Fatalf("checkpoint: %+v %v", cp, err)
	}
	if !strings.Contains(strings.Join(p.calls, "\n"), "DELETE /customers/cus_recovered") {
		t.Fatal("recovered customer never canceled")
	}
}

func invoiceFixture() object {
	return object{"id": "in_cycle", "customer": "cus_invoice", "billing_reason": "subscription_cycle", "parent": object{"subscription_details": object{"subscription": "sub_invoice", "metadata": object{"userId": fixtureUser, "planId": "creator"}}}, "lines": object{"data": []object{{"pricing": object{"price_details": object{"price": "price_creator"}}}}}}
}
func TestPostgresConcurrentInvoiceAndPackCreditLedger(t *testing.T) {
	s, _, db := billingDatabase(t)
	execute(t, db, `UPDATE users SET stripe_customer_id='cus_invoice',stripe_subscription_id='sub_invoice',stripe_subscription_status='canceled' WHERE id=$1`, fixtureUser)
	invoice := invoiceFixture()
	var wg sync.WaitGroup
	errs := make(chan error, 12)
	for i := range 12 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := s.processEvent(context.Background(), eventFor(fmt.Sprintf("evt_invoice_%d", i), "invoice.payment_succeeded", invoice, 100))
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	requireAccount(t, s, 400, "free", "canceled")
	var count int
	if err := db.QueryRow(`SELECT count(*) FROM stripe_events`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("credit ledger entries %d: %v", count, err)
	}
	// The same checkout can arrive under distinct event IDs, but grants once.
	pack := object{"id": "cs_test_pack", "mode": "payment", "payment_status": "paid", "customer": "cus_invoice", "metadata": object{"userId": fixtureUser, "priceId": "price_pack"}}
	for _, id := range []string{"evt_pack_a", "evt_pack_b", "evt_pack_a"} {
		if _, err := s.processEvent(context.Background(), eventFor(id, "checkout.session.completed", pack, 101)); err != nil {
			t.Fatal(err)
		}
	}
	requireAccount(t, s, 450, "free", "canceled")
	invoice["billing_reason"] = "subscription_update"
	invoice["id"] = "in_proration"
	if _, err := s.processEvent(context.Background(), eventFor("evt_proration", "invoice.payment_succeeded", invoice, 102)); err != nil {
		t.Fatal(err)
	}
	requireAccount(t, s, 450, "free", "canceled")
}

func TestPostgresWebhookFailureRollsBackLedgerAndRejectsForeignOwner(t *testing.T) {
	s, _, db := billingDatabase(t)
	execute(t, db, `UPDATE users SET stripe_customer_id='cus_invoice',stripe_subscription_id='sub_invoice',stripe_subscription_status='active' WHERE id=$1`, fixtureUser)
	broken := invoiceFixture()
	broken["parent"] = object{"subscription_details": object{"subscription": "sub_invoice"}}
	broken["lines"] = object{"data": []object{}}
	if _, err := s.processEvent(context.Background(), eventFor("evt_retry", "invoice.payment_succeeded", broken, 100)); err == nil {
		t.Fatal("unresolved managed invoice accepted")
	}
	var count int
	if err := db.QueryRow(`SELECT count(*) FROM stripe_events WHERE id='evt_retry'`).Scan(&count); err != nil || count != 0 {
		t.Fatal("failed transaction committed ledger")
	}
	if _, err := s.processEvent(context.Background(), eventFor("evt_retry", "invoice.payment_succeeded", invoiceFixture(), 100)); err != nil {
		t.Fatal(err)
	}
	requireAccount(t, s, 400, "free", "active")
	foreign := invoiceFixture()
	foreign["id"] = "in_foreign"
	foreign.child("parent").child("subscription_details")["metadata"] = object{"userId": fixtureOther, "planId": "creator"}
	if _, err := s.processEvent(context.Background(), eventFor("evt_foreign", "invoice.payment_succeeded", foreign, 101)); err != nil {
		t.Fatal(err)
	}
	requireAccount(t, s, 400, "free", "active")
	other, err := s.account(context.Background(), fixtureOther)
	if err != nil || other.Credits != 100 {
		t.Fatal("foreign metadata credited another user")
	}
	execute(t, db, `INSERT INTO account_deletion_requests(user_id) VALUES($1)`, fixtureUser)
	pending := invoiceFixture()
	pending["id"] = "in_during_deletion"
	if _, err = s.processEvent(context.Background(), eventFor("evt_deletion", "invoice.payment_succeeded", pending, 102)); err != nil {
		t.Fatal(err)
	}
	requireAccount(t, s, 400, "free", "active")
}

func TestPostgresSubscriptionReconciliationAndOrdering(t *testing.T) {
	s, p, db := billingDatabase(t)
	newSub := object{"id": "sub_new", "customer": "cus_owner", "status": "active", "metadata": object{"userId": fixtureUser, "planId": "pro", "checkoutGeneration": "2"}, "items": object{"data": []object{{"price": "price_pro", "current_period_end": 1788699999}}}}
	oldSub := object{"id": "sub_old", "customer": "cus_owner", "status": "canceled", "metadata": object{"userId": fixtureUser, "planId": "creator", "checkoutGeneration": "1"}, "items": object{"data": []object{{"price": "price_creator"}}}}
	p.subs = []object{newSub, oldSub}
	if _, err := s.processEvent(context.Background(), eventFor("evt_delayed_cancel", "customer.subscription.deleted", oldSub, 200)); err != nil {
		t.Fatal(err)
	}
	a := requireAccount(t, s, 100, "pro", "active")
	if a.SubscriptionID != "sub_new" || !a.CurrentPeriodEnd.Valid {
		t.Fatal("provider state not adopted")
	}
	p.subs = nil
	if _, err := s.processEvent(context.Background(), eventFor("evt_old_generation", "customer.subscription.updated", oldSub, 999)); err != nil {
		t.Fatal(err)
	}
	requireAccount(t, s, 100, "pro", "active")
	newSub["status"] = "canceled"
	if _, err := s.processEvent(context.Background(), eventFor("evt_current_cancel", "customer.subscription.deleted", newSub, 300)); err != nil {
		t.Fatal(err)
	}
	newSub["status"] = "active"
	if _, err := s.processEvent(context.Background(), eventFor("evt_stale_active", "customer.subscription.updated", newSub, 250)); err != nil {
		t.Fatal(err)
	}
	if _, err := s.processEvent(context.Background(), eventFor("evt_same_second_active", "customer.subscription.updated", newSub, 300)); err != nil {
		t.Fatal(err)
	}
	requireAccount(t, s, 100, "free", "canceled")
	// Authoritative provider state repairs a stale timestamp at the same generation.
	p.subs = []object{newSub}
	if _, err := s.processEvent(context.Background(), eventFor("evt_provider_repair", "customer.subscription.updated", newSub, 250)); err != nil {
		t.Fatal(err)
	}
	requireAccount(t, s, 100, "pro", "active")
	var generation int
	var created int64
	var priority int
	if err := db.QueryRow(`SELECT stripe_state_generation,stripe_state_event_created,stripe_state_event_priority FROM users WHERE id=$1`, fixtureUser).Scan(&generation, &created, &priority); err != nil || !reflect.DeepEqual([]int64{int64(generation), created, int64(priority)}, []int64{2, 300, 60}) {
		t.Fatalf("ordering state: %d %d %d %v", generation, created, priority, err)
	}
}
