package billing

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

func verifySignature(body []byte, header, secret string, now time.Time) bool {
	var timestamp int64
	signatures := []string{}
	for _, part := range strings.Split(header, ",") {
		key, value, found := strings.Cut(strings.TrimSpace(part), "=")
		if !found {
			continue
		}
		if key == "t" {
			parsed, err := strconv.ParseInt(value, 10, 64)
			if err != nil {
				return false
			}
			timestamp = parsed
		}
		if key == "v1" {
			signatures = append(signatures, value)
		}
	}
	if timestamp <= 0 || now.Unix()-timestamp > 300 || timestamp-now.Unix() > 300 {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(strconv.FormatInt(timestamp, 10) + "."))
	_, _ = mac.Write(body)
	expected := mac.Sum(nil)
	for _, signature := range signatures {
		decoded, err := hex.DecodeString(signature)
		if err == nil && hmac.Equal(expected, decoded) {
			return true
		}
	}
	return false
}
func (s *Service) webhook(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1024*1024)
	body, err := io.ReadAll(r.Body)
	if err != nil {
		failure(w, 413, "request_too_large")
		return
	}
	if s.cfg.WebhookSecret == "" {
		failure(w, 503, "webhook_not_configured")
		return
	}
	if !verifySignature(body, r.Header.Get("Stripe-Signature"), s.cfg.WebhookSecret, s.now()) {
		failure(w, 400, "invalid_signature")
		return
	}
	event, err := decodeObject(body)
	if err != nil || event.text("id") == "" || event.text("type") == "" {
		failure(w, 400, "invalid_event")
		return
	}
	if live, ok := event["livemode"].(bool); !ok || live != (s.cfg.Mode == "live") {
		failure(w, 400, "invalid_event_mode")
		return
	}
	kind := event.text("type")
	data := event.child("data").child("object")
	needsConfig := strings.HasPrefix(kind, "customer.subscription.") || strings.HasPrefix(kind, "invoice.") || (strings.HasPrefix(kind, "checkout.session.") && data.text("mode") == "subscription")
	if needsConfig && !s.completePlans() {
		failure(w, 503, "billing_plans_not_configured")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	duplicate, err := s.processEvent(ctx, event)
	if err != nil {
		if s.cfg.Logger != nil {
			s.cfg.Logger.ErrorContext(ctx, "Stripe webhook processing failed", "event_id", event.text("id"), "event_type", kind, "code", processingCode(err, "processing_failed"))
		}
		failure(w, 500, "processing_failed")
		return
	}
	write(w, 200, object{"received": true, "duplicate": duplicate})
}
func grantReason(invoice object) bool {
	return invoice.text("billing_reason") == "subscription_create" || invoice.text("billing_reason") == "subscription_cycle"
}
func (s *Service) processEvent(ctx context.Context, event object) (bool, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer tx.Rollback()
	kind := event.text("type")
	data := event.child("data").child("object")
	result, err := tx.ExecContext(ctx, `INSERT INTO stripe_events(id,type) VALUES($1,$2) ON CONFLICT DO NOTHING`, event.text("id"), kind)
	if err != nil {
		return false, err
	}
	n, err := result.RowsAffected()
	if err != nil {
		return false, err
	}
	if n == 0 {
		return true, tx.Commit()
	}
	customer := data.id("customer")
	if customer != "" {
		if _, err = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,8675309))`, customer); err != nil {
			return false, err
		}
	}
	switch kind {
	case "checkout.session.completed", "checkout.session.async_payment_succeeded":
		err = s.checkoutCompleted(ctx, tx, data, event.text("id"))
	case "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "customer.subscription.paused", "customer.subscription.resumed", "customer.subscription.pending_update_applied", "customer.subscription.pending_update_expired":
		err = s.subscriptionChanged(ctx, tx, data, event.number("created"))
	case "invoice.payment_succeeded", "invoice.paid":
		err = s.invoicePaid(ctx, tx, data, event.text("id"))
		if err == nil {
			err = s.invoiceSubscriptionChanged(ctx, tx, data, event.number("created"))
		}
	case "invoice.payment_failed", "invoice.payment_action_required", "invoice.finalization_failed":
		// Refresh the subscription instead of inferring access from an invoice
		// snapshot: a delayed failure must not undo a successful payment retry.
		err = s.invoiceSubscriptionChanged(ctx, tx, data, event.number("created"))
	}
	if err != nil {
		return false, err
	}
	return false, tx.Commit()
}

// Reserve a grant only once its owner and purchased price have been validated.
// Events ignored before customer binding remain recoverable by reconciliation.
func (s *Service) creditGrant(ctx context.Context, tx *sql.Tx, eventID, source string, userID string, credits int) error {
	if source == "" || credits <= 0 {
		return errors.New("invalid credit grant")
	}
	if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,8675310))`, source); err != nil {
		return err
	}
	var exists bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM stripe_events WHERE credit_grant_id=$1)`, source).Scan(&exists); err != nil {
		return err
	}
	if exists {
		return nil
	}
	if _, err := tx.ExecContext(ctx, `UPDATE stripe_events SET credit_grant_id=$2 WHERE id=$1`, eventID, source); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, `UPDATE users SET credits=credits+$2,updated_at=now() WHERE id=$1`, userID, credits)
	return err
}
func findBillingUser(ctx context.Context, tx *sql.Tx, metadata, customer, subscription string, replace bool) (*account, error) {
	rows, err := tx.QueryContext(ctx, `SELECT `+accountColumns+` FROM users WHERE ($1<>'' AND stripe_customer_id=$1) OR ($2<>'' AND stripe_subscription_id=$2) LIMIT 2`, customer, subscription)
	if err != nil {
		return nil, err
	}
	accounts := []account{}
	for rows.Next() {
		a, e := scanAccount(rows)
		if e != nil {
			rows.Close()
			return nil, e
		}
		accounts = append(accounts, a)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	if len(accounts) > 1 {
		return nil, nil
	}
	validMetadata := uuidPattern.MatchString(metadata)
	var id string
	if len(accounts) == 1 {
		if validMetadata && accounts[0].ID != metadata {
			return nil, nil
		}
		id = accounts[0].ID
	} else if validMetadata {
		id = metadata
	} else {
		return nil, nil
	}
	a, err := scanAccount(tx.QueryRowContext(ctx, `SELECT `+accountColumns+` FROM users WHERE id=$1 FOR UPDATE`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if customer != "" && a.CustomerID != "" && customer != a.CustomerID {
		return nil, nil
	}
	if subscription != "" && a.SubscriptionID != "" && subscription != a.SubscriptionID && !replace && !terminal(a.SubscriptionStatus) {
		return nil, nil
	}
	pending, err := pendingInTransaction(ctx, tx, id)
	if err != nil {
		return nil, err
	}
	if pending {
		return nil, nil
	}
	return &a, nil
}
func (s *Service) checkoutCompleted(ctx context.Context, tx *sql.Tx, checkout object, eventID string) error {
	meta := checkout.child("metadata")
	customer := checkout.id("customer")
	subscription := checkout.id("subscription")
	a, err := findBillingUser(ctx, tx, meta.text("userId"), customer, subscription, false)
	if err != nil || a == nil {
		return err
	}
	if checkout.text("client_reference_id") != "" && checkout.text("client_reference_id") != a.ID {
		return nil
	}
	if checkout.text("mode") == "payment" {
		credits := s.cfg.CreditPacks[meta.text("priceId")]
		if checkout.text("payment_status") != "paid" || credits <= 0 {
			return nil
		}
		lines, err := s.provider(ctx, http.MethodGet, "/checkout/sessions/"+url.PathEscape(checkout.text("id"))+"/line_items", nil, "")
		if err != nil {
			return err
		}
		items := lines.list("data")
		if len(items) != 1 || lines.boolean("has_more") || items[0].id("price") != meta.text("priceId") || items[0].number("quantity") != 1 {
			return errors.New("credit pack checkout does not match configured price")
		}
		if _, err = tx.ExecContext(ctx, `UPDATE users SET stripe_customer_id=COALESCE($2,stripe_customer_id) WHERE id=$1`, a.ID, nullable(customer)); err != nil {
			return err
		}
		return s.creditGrant(ctx, tx, eventID, "checkout:"+checkout.text("id"), a.ID, credits)
	}
	plan := s.planForPrice(meta.text("priceId"))
	if checkout.text("mode") != "subscription" || plan == "" || meta.text("planId") != plan || customer == "" || subscription == "" {
		return nil
	}
	if a.SubscriptionID != "" && a.SubscriptionID != subscription && !terminal(a.SubscriptionStatus) {
		return nil
	}
	_, err = tx.ExecContext(ctx, `UPDATE users SET stripe_customer_id=$2,stripe_subscription_id=$3::text,stripe_subscription_status=CASE WHEN stripe_subscription_id IS DISTINCT FROM $3::text OR stripe_subscription_status IS NULL OR stripe_subscription_status='incomplete' THEN 'incomplete' ELSE stripe_subscription_status END WHERE id=$1`, a.ID, customer, subscription)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `DELETE FROM billing_checkout_claims WHERE user_id=$1 AND generation=$2`, a.ID, generation(meta.text("checkoutGeneration")))
	if err != nil {
		return err
	}
	return s.subscriptionChanged(ctx, tx, object{"id": subscription, "customer": customer, "metadata": meta}, 0)
}
func generation(raw string) int {
	if raw == "" || len(raw) > 9 {
		return 0
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 0 {
		return 0
	}
	return n
}
func statePriority(status string) int {
	if terminal(status) {
		return 100
	}
	switch status {
	case "past_due", "unpaid", "paused":
		return 80
	case "active", "trialing":
		return 60
	default:
		return 40
	}
}
func (s *Service) subscriptionPlan(sub object) string {
	items := sub.child("items").list("data")
	if len(items) != 1 || sub.child("items").boolean("has_more") {
		return ""
	}
	if quantity, present := items[0]["quantity"]; present && (object{"quantity": quantity}).number("quantity") != 1 {
		return ""
	}
	return s.planForPrice(items[0].id("price"))
}
func (s *Service) currentSubscription(ctx context.Context, a account, event object) (object, error) {
	rows, err := s.subscriptions(ctx, a.CustomerID)
	if err != nil {
		return nil, err
	}
	var active, newest object
	for _, sub := range rows {
		if sub.id("customer") != a.CustomerID || !s.matchesMode(sub) {
			continue
		}
		owner := sub.child("metadata").text("userId")
		if owner != a.ID && !(owner == "" && (sub.text("id") == a.SubscriptionID || sub.text("id") == event.text("id"))) {
			return nil, conflict("billing_owner_mismatch")
		}
		if newest == nil || generation(sub.child("metadata").text("checkoutGeneration")) > generation(newest.child("metadata").text("checkoutGeneration")) || (generation(sub.child("metadata").text("checkoutGeneration")) == generation(newest.child("metadata").text("checkoutGeneration")) && sub.number("created") > newest.number("created")) {
			newest = sub
		}
		if !terminal(sub.text("status")) {
			if active != nil {
				return nil, conflict("billing_multiple_subscriptions")
			}
			active = sub
		}
	}
	if active != nil {
		return active, nil
	}
	if newest != nil {
		return newest, nil
	}
	if a.SubscriptionID != "" || event.text("id") != "" {
		// Stripe retains terminal subscriptions in status=all. An empty result
		// cannot safely authorize an old webhook snapshot or a second Checkout.
		return nil, conflict("billing_subscription_not_found")
	}
	return nil, nil
}
func (s *Service) subscriptionChanged(ctx context.Context, tx *sql.Tx, event object, created int64) error {
	customer := event.id("customer")
	if customer == "" {
		return nil
	}
	a, err := findBillingUser(ctx, tx, event.child("metadata").text("userId"), customer, event.text("id"), true)
	if err != nil || a == nil {
		return err
	}
	// Callers hold the customer advisory lock, then this user's row lock.
	// Fetch Stripe only after both locks so concurrently delivered events cannot
	// apply an older provider snapshot after a newer one has been committed.
	a.CustomerID = customer
	sub, err := s.currentSubscription(ctx, *a, event)
	if err != nil || sub == nil {
		return err
	}
	var previousCreated int64
	err = tx.QueryRowContext(ctx, `SELECT stripe_state_event_created FROM users WHERE id=$1`, a.ID).Scan(&previousCreated)
	if err != nil {
		return err
	}
	gen := generation(sub.child("metadata").text("checkoutGeneration"))
	priority := statePriority(sub.text("status"))
	created = max(created, previousCreated)
	plan := "free"
	if sub.text("status") == "active" || sub.text("status") == "trialing" {
		plan = normalizePlan(s.subscriptionPlan(sub))
	}
	// The existing flag records any scheduled cancellation, including Stripe's
	// explicit cancel_at shape; current_period_end stores the bounded coverage.
	_, err = tx.ExecContext(ctx, `UPDATE users SET plan=$2,stripe_customer_id=$3,stripe_subscription_id=$4,stripe_subscription_status=$5,stripe_cancel_at_period_end=$6,stripe_current_period_end=$7,stripe_state_event_created=$8,stripe_state_event_priority=$9,stripe_state_generation=$10 WHERE id=$1`, a.ID, plan, customer, sub.text("id"), sub.text("status"), scheduledCancellation(sub), periodEnd(sub), created, priority, gen)
	return err
}

func (s *Service) invoiceSubscriptionChanged(ctx context.Context, tx *sql.Tx, invoice object, created int64) error {
	id := invoiceSubscription(invoice)
	if id == "" {
		return nil
	}
	return s.subscriptionChanged(ctx, tx, object{"id": id, "customer": invoice.id("customer"), "metadata": invoice.child("parent").child("subscription_details").child("metadata")}, created)
}
func invoiceSubscription(invoice object) string {
	if id := invoice.child("parent").child("subscription_details").id("subscription"); id != "" {
		return id
	}
	if id := invoice.id("subscription"); id != "" {
		return id
	}
	for _, line := range invoice.child("lines").list("data") {
		if id := line.id("subscription"); id != "" {
			return id
		}
	}
	return ""
}
func (s *Service) invoicePlan(invoice object) string {
	plans := map[string]bool{}
	managedLines := 0
	for _, line := range invoice.child("lines").list("data") {
		id := line.child("pricing").child("price_details").id("price")
		if id == "" {
			id = line.id("price")
		}
		if plan := s.planForPrice(id); plan != "" {
			if quantity, present := line["quantity"]; present && (object{"quantity": quantity}).number("quantity") != 1 {
				return ""
			}
			plans[plan] = true
			managedLines++
		} else if id != "" {
			return ""
		}
	}
	if len(plans) == 1 && managedLines == 1 {
		for plan := range plans {
			return plan
		}
	}
	return ""
}
func (s *Service) invoicePaid(ctx context.Context, tx *sql.Tx, invoice object, eventID string) error {
	if !grantReason(invoice) || invoice.text("status") != "paid" || invoice.number("amount_remaining") != 0 {
		return nil
	}
	if invoice.text("id") == "" {
		return errors.New("paid invoice has no identifier")
	}
	meta := invoice.child("parent").child("subscription_details").child("metadata")
	customer := invoice.id("customer")
	if invoiceSubscription(invoice) == "" {
		return nil
	}
	a, err := findBillingUser(ctx, tx, meta.text("userId"), customer, invoiceSubscription(invoice), true)
	if err != nil || a == nil {
		return err
	}
	if invoice.child("lines").boolean("has_more") {
		lines, err := s.listProvider(ctx, "/invoices/"+url.PathEscape(invoice.text("id"))+"/lines", nil)
		if err != nil {
			return err
		}
		invoice["lines"] = object{"data": lines}
	}
	plan := s.invoicePlan(invoice)
	if plan == "" {
		return errors.New("managed invoice plan cannot be resolved")
	}
	if _, err = tx.ExecContext(ctx, `UPDATE users SET stripe_customer_id=COALESCE($2,stripe_customer_id) WHERE id=$1`, a.ID, nullable(customer)); err != nil {
		return err
	}
	return s.creditGrant(ctx, tx, eventID, "invoice:"+invoice.text("id"), a.ID, planCredits[plan])
}
