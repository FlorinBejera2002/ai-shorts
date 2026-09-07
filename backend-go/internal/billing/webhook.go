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
	kind := event.text("type")
	data := event.child("data").child("object")
	needsConfig := strings.HasPrefix(kind, "customer.subscription.") || kind == "invoice.payment_succeeded" || (kind == "checkout.session.completed" && data.text("mode") == "subscription")
	if needsConfig && !s.completePlans() {
		failure(w, 503, "billing_plans_not_configured")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	duplicate, err := s.processEvent(ctx, event)
	if err != nil {
		failure(w, 500, "processing_failed")
		return
	}
	write(w, 200, object{"received": true, "duplicate": duplicate})
}
func grantReason(invoice object) bool {
	return invoice.text("billing_reason") == "subscription_create" || invoice.text("billing_reason") == "subscription_cycle"
}
func (s *Service) grantID(kind string, data object) any {
	if kind == "invoice.payment_succeeded" && grantReason(data) && data.text("id") != "" {
		return "invoice:" + data.text("id")
	}
	if kind == "checkout.session.completed" && data.text("mode") == "payment" && data.text("payment_status") == "paid" && s.cfg.CreditPacks[data.child("metadata").text("priceId")] > 0 {
		return "checkout:" + data.text("id")
	}
	return nil
}
func (s *Service) processEvent(ctx context.Context, event object) (bool, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer tx.Rollback()
	kind := event.text("type")
	data := event.child("data").child("object")
	result, err := tx.ExecContext(ctx, `INSERT INTO stripe_events(id,type,credit_grant_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, event.text("id"), kind, s.grantID(kind, data))
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
	case "checkout.session.completed":
		err = s.checkoutCompleted(ctx, tx, data)
	case "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted":
		err = s.subscriptionChanged(ctx, tx, data, event.number("created"))
	case "invoice.payment_succeeded":
		err = s.invoicePaid(ctx, tx, data)
		// A failed invoice never overrides authoritative subscription lifecycle state.
	}
	if err != nil {
		return false, err
	}
	return false, tx.Commit()
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
func (s *Service) checkoutCompleted(ctx context.Context, tx *sql.Tx, checkout object) error {
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
		_, err = tx.ExecContext(ctx, `UPDATE users SET credits=credits+$2,stripe_customer_id=COALESCE($3,stripe_customer_id) WHERE id=$1`, a.ID, credits, nullable(customer))
		return err
	}
	plan := s.planForPrice(meta.text("priceId"))
	if checkout.text("mode") != "subscription" || plan == "" || meta.text("planId") != plan || customer == "" || subscription == "" {
		return nil
	}
	if a.SubscriptionID != "" && a.SubscriptionID != subscription {
		return nil
	}
	_, err = tx.ExecContext(ctx, `UPDATE users SET stripe_customer_id=$2,stripe_subscription_id=$3,stripe_subscription_status=CASE WHEN stripe_subscription_id IS DISTINCT FROM $3 OR stripe_subscription_status IS NULL OR stripe_subscription_status='incomplete' THEN 'incomplete' ELSE stripe_subscription_status END WHERE id=$1`, a.ID, customer, subscription)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `DELETE FROM billing_checkout_claims WHERE user_id=$1 AND generation=$2`, a.ID, generation(meta.text("checkoutGeneration")))
	return err
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
	if len(items) > 0 {
		if plan := s.planForPrice(items[0].id("price")); plan != "" {
			return plan
		}
	}
	meta := sub.child("metadata")
	if uuidPattern.MatchString(meta.text("userId")) && paid(meta.text("planId")) {
		return meta.text("planId")
	}
	return ""
}
func (s *Service) currentSubscription(ctx context.Context, event object) (object, bool, error) {
	customer := event.id("customer")
	userID := event.child("metadata").text("userId")
	if customer == "" || !uuidPattern.MatchString(userID) {
		return event, false, nil
	}
	rows, err := s.subscriptions(ctx, customer)
	if err != nil {
		return nil, false, err
	}
	var active, terminalMatch, newest object
	for _, sub := range rows {
		if sub.child("metadata").text("userId") != userID || s.subscriptionPlan(sub) == "" {
			continue
		}
		if newest == nil {
			newest = sub
		}
		if sub.text("id") == event.text("id") {
			terminalMatch = sub
		}
		if !terminal(sub.text("status")) && (active == nil || generation(sub.child("metadata").text("checkoutGeneration")) > generation(active.child("metadata").text("checkoutGeneration"))) {
			active = sub
		}
	}
	if active != nil {
		return active, true, nil
	}
	if terminalMatch != nil {
		return terminalMatch, true, nil
	}
	if newest != nil {
		return newest, true, nil
	}
	return event, false, nil
}
func (s *Service) subscriptionChanged(ctx context.Context, tx *sql.Tx, event object, created int64) error {
	sub, fromProvider, err := s.currentSubscription(ctx, event)
	if err != nil {
		return err
	}
	customer := sub.id("customer")
	if customer == "" {
		return nil
	}
	a, err := findBillingUser(ctx, tx, sub.child("metadata").text("userId"), customer, sub.text("id"), true)
	if err != nil || a == nil {
		return err
	}
	var previousGeneration, previousPriority int
	var previousCreated int64
	err = tx.QueryRowContext(ctx, `SELECT stripe_state_generation,stripe_state_event_created,stripe_state_event_priority FROM users WHERE id=$1`, a.ID).Scan(&previousGeneration, &previousCreated, &previousPriority)
	if err != nil {
		return err
	}
	gen := generation(sub.child("metadata").text("checkoutGeneration"))
	priority := statePriority(sub.text("status"))
	if gen < previousGeneration {
		return nil
	}
	if gen == previousGeneration && !fromProvider && (created < previousCreated || (created == previousCreated && priority < previousPriority)) {
		return nil
	}
	if gen == previousGeneration && fromProvider {
		created = max(created, previousCreated)
	}
	plan := "free"
	if sub.text("status") == "active" || sub.text("status") == "trialing" {
		plan = normalizePlan(s.subscriptionPlan(sub))
	}
	_, err = tx.ExecContext(ctx, `UPDATE users SET plan=$2,stripe_customer_id=$3,stripe_subscription_id=$4,stripe_subscription_status=$5,stripe_cancel_at_period_end=$6,stripe_current_period_end=$7,stripe_state_event_created=$8,stripe_state_event_priority=$9,stripe_state_generation=$10 WHERE id=$1`, a.ID, plan, customer, sub.text("id"), sub.text("status"), sub.boolean("cancel_at_period_end"), periodEnd(sub), created, priority, gen)
	return err
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
	for _, line := range invoice.child("lines").list("data") {
		id := line.child("pricing").child("price_details").id("price")
		if id == "" {
			id = line.id("price")
		}
		if plan := s.planForPrice(id); plan != "" {
			plans[plan] = true
		}
	}
	if len(plans) == 1 {
		for plan := range plans {
			return plan
		}
	}
	if len(plans) > 1 {
		return ""
	}
	meta := invoice.child("parent").child("subscription_details").child("metadata")
	if uuidPattern.MatchString(meta.text("userId")) && paid(meta.text("planId")) {
		return meta.text("planId")
	}
	return ""
}
func (s *Service) invoicePaid(ctx context.Context, tx *sql.Tx, invoice object) error {
	if !grantReason(invoice) {
		return nil
	}
	meta := invoice.child("parent").child("subscription_details").child("metadata")
	customer := invoice.id("customer")
	a, err := findBillingUser(ctx, tx, meta.text("userId"), customer, invoiceSubscription(invoice), false)
	if err != nil || a == nil {
		return err
	}
	plan := s.invoicePlan(invoice)
	if plan == "" {
		return errors.New("managed invoice plan cannot be resolved")
	}
	_, err = tx.ExecContext(ctx, `UPDATE users SET credits=credits+$2,stripe_customer_id=COALESCE($3,stripe_customer_id) WHERE id=$1`, a.ID, planCredits[plan], nullable(customer))
	return err
}
