//go:build stripe_sandbox

package billing

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/julienschmidt/httprouter"
	"golang.org/x/crypto/bcrypt"
	"sneepcut/backend-go/internal/identity"
	"sneepcut/backend-go/internal/testdb"
)

// This suite performs real TEST-MODE Stripe operations. It is deliberately
// excluded from ordinary go test. Run only against an explicitly confirmed
// account and the dedicated, disposable integration database:
// go test -tags stripe_sandbox ./internal/billing -run '^TestStripeSandbox$' -v -timeout 35m
// Required environment: STRIPE_SANDBOX_RUN=1, STRIPE_EXPECTED_ACCOUNT_ID,
// STRIPE_SECRET_KEY, STRIPE_PRICE_{CREATOR,PRO,AGENCY}, SNEEPCUT_TEST_DATABASE_URL,
// SNEEPCUT_TEST_SCHEMA_SQL. Secrets must be loaded into the process environment.
// Optional STRIPE_SANDBOX_BROWSER_HOLD_SECONDS (1..1800) keeps a loopback server
// open for hosted Checkout/SCA browser exercises until POST /sandbox/finish.
// The local signed replay exercises the real handler; it is not evidence of
// Stripe-to-public-endpoint delivery. Forward genuine events with Stripe CLI
// and STRIPE_SANDBOX_WEBHOOK_SECRET to verify that separate delivery path.
func TestStripeSandbox(t *testing.T) {
	for _, key := range []string{"STRIPE_EXPECTED_ACCOUNT_ID", "STRIPE_SECRET_KEY", "STRIPE_PRICE_CREATOR", "STRIPE_PRICE_PRO", "STRIPE_PRICE_AGENCY", "SNEEPCUT_TEST_DATABASE_URL", "SNEEPCUT_TEST_SCHEMA_SQL"} {
		if strings.TrimSpace(os.Getenv(key)) == "" {
			t.Fatalf("sandbox requires process environment variable %s", key)
		}
	}
	if os.Getenv("STRIPE_SANDBOX_RUN") != "1" {
		t.Fatal("sandbox requires explicit STRIPE_SANDBOX_RUN=1")
	}
	secret := strings.TrimSpace(os.Getenv("STRIPE_SECRET_KEY"))
	if !strings.HasPrefix(secret, "sk_test_") && !strings.HasPrefix(secret, "rk_test_") {
		t.Fatal("sandbox refuses every key outside Stripe test mode")
	}
	port := os.Getenv("STRIPE_SANDBOX_PORT")
	if port == "" {
		port = "58081"
	}
	if n, err := strconv.Atoi(port); err != nil || n < 1024 || n > 65535 {
		t.Fatal("invalid sandbox loopback port")
	}
	webhookSecret := os.Getenv("STRIPE_SANDBOX_WEBHOOK_SECRET")
	if webhookSecret == "" {
		token, err := newToken()
		if err != nil {
			t.Fatal("cannot generate local webhook signing secret")
		}
		webhookSecret = "whsec_" + token
	}
	cfg := Config{SecretKey: secret, WebhookSecret: webhookSecret, Mode: "test", AppURL: "http://127.0.0.1:" + port, PortalConfiguration: os.Getenv("STRIPE_PORTAL_CONFIGURATION"), PlanPrices: map[string]string{}}
	for _, plan := range []string{"creator", "pro", "agency"} {
		cfg.PlanPrices[plan] = strings.TrimSpace(os.Getenv("STRIPE_PRICE_" + strings.ToUpper(plan)))
	}
	s, err := NewService(cfg, nil, nil)
	if err != nil {
		t.Fatal("sandbox configuration rejected")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Minute)
	defer cancel()
	account := sandboxRequest(t, s, ctx, http.MethodGet, "/account", nil)
	if account.text("id") != os.Getenv("STRIPE_EXPECTED_ACCOUNT_ID") || !strings.HasPrefix(account.text("id"), "acct_") {
		t.Fatal("Stripe account identity does not match the explicitly expected account")
	}
	balance := sandboxRequest(t, s, ctx, http.MethodGet, "/balance", nil)
	if live, ok := balance["livemode"].(bool); !ok || live {
		t.Fatal("Stripe did not confirm test mode before sandbox mutations")
	}
	for _, plan := range []string{"creator", "pro", "agency"} {
		if _, _, err := s.price(ctx, plan); err != nil {
			t.Fatalf("configured %s price failed sandbox validation", plan)
		}
	}
	t.Logf("Confirmed Stripe test account %s", account.text("id"))
	// testdb.Open rejects non-loopback databases and every database name other
	// than sneepcut_integration_test; its schema is new and automatically removed.
	db := testdb.Open(t)
	s.db = db
	run, err := newToken()
	if err != nil {
		t.Fatal("cannot generate sandbox run identity")
	}
	h := newSandboxHTTP(t, s, db, run[:16], port)
	t.Cleanup(h.cleanup)
	t.Logf("Sandbox browser harness: %s/sandbox", s.cfg.AppURL)
	t.Logf("Local webhook receiver: %s/api/webhooks/stripe", s.cfg.AppURL)
	clock := sandboxRequest(t, s, ctx, http.MethodPost, "/test_helpers/test_clocks", url.Values{"frozen_time": {strconv.FormatInt(time.Now().Unix(), 10)}, "name": {"Sneep Cut synthetic " + h.run}})
	h.clock = clock.text("id")
	if !strings.HasPrefix(h.clock, "clock_") {
		t.Fatal("Stripe test clock was not created")
	}
	user, customer := h.customer(t, ctx, "success", h.clock, "pm_card_visa")
	sub := sandboxRequest(t, s, ctx, http.MethodPost, "/subscriptions", sandboxSubscriptionForm(s, user, customer, "creator"))
	if sub.text("status") != "active" {
		t.Fatal("synthetic successful payment did not activate the subscription")
	}
	h.reconcile(t, ctx, user, "creator", 100+planCredits["creator"])
	invoice := sandboxRequest(t, s, ctx, http.MethodGet, "/invoices/"+url.PathEscape(sub.id("latest_invoice")), nil)
	if invoice.text("status") != "paid" {
		t.Fatal("synthetic initial invoice did not settle")
	}
	h.replay(t, invoice, "invoice.paid", "initial_paid")
	h.replay(t, invoice, "invoice.paid", "initial_paid")
	h.reconcile(t, ctx, user, "creator", 100+planCredits["creator"])
	t.Log("PASS: real initial payment, activation, local signed webhook duplicate, missed-delivery reconciliation")
	if os.Getenv("STRIPE_SANDBOX_VERIFY_DELIVERY") == "1" {
		h.verifyInterruptedDelivery(t, ctx, sub, user)
	}
	for _, scenario := range []struct{ name, method, intent string }{{"decline", "pm_card_chargeCustomerFail", "requires_payment_method"}, {"sca", "pm_card_threeDSecure2Required", "requires_action"}} {
		id, cus := h.customer(t, ctx, scenario.name, h.clock, scenario.method)
		failed := sandboxRequest(t, s, ctx, http.MethodPost, "/subscriptions", sandboxSubscriptionForm(s, id, cus, "creator"))
		if failed.text("status") != "incomplete" {
			t.Fatalf("%s scenario did not remain incomplete", scenario.name)
		}
		intents := sandboxRequest(t, s, ctx, http.MethodGet, "/payment_intents", url.Values{"customer": {cus}, "limit": {"1"}}).list("data")
		if len(intents) != 1 || intents[0].text("status") != scenario.intent {
			t.Fatalf("%s scenario did not produce the expected payment authentication state", scenario.name)
		}
		h.reconcile(t, ctx, id, "free", 100)
		t.Logf("PASS: real %s payment state; no paid access or credits", scenario.name)
	}
	h.advance(t, ctx, periodEndUnix(sub)+7200)
	h.reconcileEventually(t, ctx, user, "creator", 100+2*planCredits["creator"])
	t.Log("PASS: real test-clock renewal and one cycle credit grant")
	h.paymentMethod(t, ctx, customer, "pm_card_chargeCustomerFail")
	sub = sandboxRequest(t, s, ctx, http.MethodGet, "/subscriptions/"+url.PathEscape(sub.text("id")), nil)
	h.advance(t, ctx, periodEndUnix(sub)+7200)
	h.reconcileEventually(t, ctx, user, "free", 100+2*planCredits["creator"])
	h.replay(t, sub, "customer.subscription.updated", "stale_active_after_failure")
	h.reconcile(t, ctx, user, "free", 100+2*planCredits["creator"])
	t.Log("PASS: real failed renewal removes paid access and preserves earned credits")
	h.paymentMethod(t, ctx, customer, "pm_card_visa")
	open := sandboxRequest(t, s, ctx, http.MethodGet, "/invoices", url.Values{"customer": {customer}, "subscription": {sub.text("id")}, "status": {"open"}, "limit": {"1"}}).list("data")
	if len(open) != 1 {
		t.Fatal("failed renewal invoice cannot be located")
	}
	sandboxRequest(t, s, ctx, http.MethodPost, "/invoices/"+url.PathEscape(open[0].text("id"))+"/pay", url.Values{})
	h.reconcileEventually(t, ctx, user, "creator", 100+3*planCredits["creator"])
	sub = sandboxRequest(t, s, ctx, http.MethodGet, "/subscriptions/"+url.PathEscape(sub.text("id")), nil)
	items := sub.child("items").list("data")
	if len(items) != 1 {
		t.Fatal("synthetic managed subscription has unexpected items")
	}
	sub = sandboxRequest(t, s, ctx, http.MethodPost, "/subscriptions/"+url.PathEscape(sub.text("id")), url.Values{"items[0][id]": {items[0].text("id")}, "items[0][price]": {s.cfg.PlanPrices["pro"]}, "proration_behavior": {"none"}})
	h.reconcile(t, ctx, user, "pro", 100+3*planCredits["creator"])
	sub = sandboxRequest(t, s, ctx, http.MethodPost, "/subscriptions/"+url.PathEscape(sub.text("id")), url.Values{"cancel_at_period_end": {"true"}})
	h.reconcile(t, ctx, user, "pro", 100+3*planCredits["creator"])
	a, err := s.account(ctx, user)
	if err != nil || !a.CancelAtPeriodEnd {
		t.Fatal("scheduled cancellation did not synchronize")
	}
	h.advance(t, ctx, periodEndUnix(sub)+7200)
	h.reconcileEventually(t, ctx, user, "free", 100+3*planCredits["creator"])
	t.Log("PASS: real payment recovery, price change, scheduled cancellation and expiration")
	if raw := os.Getenv("STRIPE_SANDBOX_BROWSER_HOLD_SECONDS"); raw != "" && raw != "0" {
		seconds, err := strconv.Atoi(raw)
		if err != nil || seconds < 1 || seconds > 1800 {
			t.Fatal("browser hold duration must be 1..1800 seconds")
		}
		t.Log("Automated sandbox scenarios passed; waiting for explicit browser finish")
		select {
		case <-h.finished:
		case <-time.After(time.Duration(seconds) * time.Second):
			t.Fatal("browser verification timed out without explicit finish")
		}
	}
}

func sandboxRequest(t *testing.T, s *Service, ctx context.Context, method, path string, form url.Values) object {
	t.Helper()
	value, err := s.provider(ctx, method, path, form, "")
	if err != nil {
		// providerError contains only HTTP status/code; never log request bodies,
		// authorization, client_secret, payment method details or full responses.
		if failure, ok := err.(*providerError); ok {
			t.Fatalf("Stripe sandbox %s %s failed: HTTP %d code=%s", method, path, failure.Status, failure.Code)
		}
		t.Fatalf("Stripe sandbox %s %s unavailable", method, path)
	}
	return value
}

func sandboxSubscriptionForm(s *Service, user, customer, plan string) url.Values {
	// Unlike hosted Checkout, this fixture has no browser to confirm the first
	// PaymentIntent. allow_incomplete attempts the attached test card now and
	// preserves incomplete state for real declines or authentication challenges.
	return url.Values{"customer": {customer}, "items[0][price]": {s.cfg.PlanPrices[plan]}, "payment_behavior": {"allow_incomplete"}, "payment_settings[payment_method_types][0]": {"card"}, "metadata[userId]": {user}, "metadata[planId]": {plan}, "metadata[priceId]": {s.cfg.PlanPrices[plan]}, "metadata[checkoutGeneration]": {"1"}}
}

func periodEndUnix(sub object) int64 {
	for _, item := range sub.child("items").list("data") {
		if end := item.number("current_period_end"); end > 0 {
			return end
		}
	}
	return sub.number("current_period_end")
}

type sandboxHTTP struct {
	t                  *testing.T
	s                  *Service
	db                 *sql.DB
	run                string
	clock              string
	server             *httptest.Server
	router             *httprouter.Router
	auth               *identity.Service
	finished           chan struct{}
	finish             sync.Once
	mu                 sync.Mutex
	customers          []string
	sessions           map[string]string
	pausedDeliveries   atomic.Bool
	rejectedDeliveries atomic.Int64
	rejectedEventIDs   sync.Map
}

func (h *sandboxHTTP) verifyInterruptedDelivery(t *testing.T, ctx context.Context, sub object, user string) {
	t.Helper()
	h.pausedDeliveries.Store(true)
	defer h.pausedDeliveries.Store(false)
	sandboxRequest(t, h.s, ctx, http.MethodPost, "/subscriptions/"+url.PathEscape(sub.text("id")), url.Values{"metadata[sneepcut_delivery_probe]": {h.run}})
	deadline := time.Now().Add(45 * time.Second)
	for h.rejectedDeliveries.Load() == 0 && time.Now().Before(deadline) {
		time.Sleep(time.Second)
	}
	if h.rejectedDeliveries.Load() == 0 {
		t.Fatal("genuine Stripe CLI delivery did not reach the paused receiver")
	}
	var event object
	for time.Now().Before(deadline) {
		for _, candidate := range sandboxRequest(t, h.s, ctx, http.MethodGet, "/events", url.Values{"type": {"customer.subscription.updated"}, "limit": {"100"}}).list("data") {
			data := candidate.child("data").child("object")
			if data.text("id") == sub.text("id") && data.child("metadata").text("sneepcut_delivery_probe") == h.run {
				event = candidate
				break
			}
		}
		if event != nil {
			break
		}
		time.Sleep(time.Second)
	}
	if event == nil {
		t.Fatal("interrupted genuine Stripe event could not be retrieved")
	}
	for time.Now().Before(deadline) {
		if _, rejected := h.rejectedEventIDs.Load(event.text("id")); rejected {
			break
		}
		time.Sleep(time.Second)
	}
	if _, rejected := h.rejectedEventIDs.Load(event.text("id")); !rejected {
		t.Fatal("expected genuine event did not receive the simulated503")
	}
	h.pausedDeliveries.Store(false)
	for attempt := 0; attempt < 2; attempt++ {
		body, err := json.Marshal(event)
		if err != nil {
			t.Fatal("cannot encode genuine Stripe event for local replay")
		}
		stamp := strconv.FormatInt(time.Now().Unix(), 10)
		mac := hmac.New(sha256.New, []byte(h.s.cfg.WebhookSecret))
		_, _ = mac.Write(append([]byte(stamp+"."), body...))
		request, err := http.NewRequestWithContext(ctx, http.MethodPost, h.s.cfg.AppURL+"/api/webhooks/stripe", strings.NewReader(string(body)))
		if err != nil {
			t.Fatal("cannot construct local event replay")
		}
		request.Header.Set("Stripe-Signature", "t="+stamp+",v1="+hex.EncodeToString(mac.Sum(nil)))
		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatal("cannot deliver local event replay")
		}
		payload, err := io.ReadAll(io.LimitReader(response.Body, 4096))
		response.Body.Close()
		result, decodeErr := decodeObject(payload)
		if err != nil || decodeErr != nil || response.StatusCode != 200 || (attempt == 1 && !result.boolean("duplicate")) {
			t.Fatal("genuine event recovery or exact-ID deduplication failed")
		}
	}
	h.reconcile(t, ctx, user, "creator", 100+planCredits["creator"])
	t.Logf("PASS: genuine Stripe CLI delivery rejected with503; locally re-signed original event %s recovered and duplicate accepted exactly once", event.text("id"))
}

func newSandboxHTTP(t *testing.T, s *Service, db *sql.DB, run, port string) *sandboxHTTP {
	t.Helper()
	token, err := newToken()
	if err != nil {
		t.Fatal("cannot generate synthetic authentication configuration")
	}
	tokens, err := identity.NewTokens(identity.TokenConfig{Secret: token, Issuer: "stripe-sandbox", Audience: "stripe-sandbox", AccessLifetime: time.Hour, RefreshLifetime: 2 * time.Hour})
	if err != nil {
		t.Fatal("cannot configure synthetic authentication")
	}
	auth := identity.NewService(identity.NewPostgres(db), tokens)
	s.auth = identity.NewHandler(auth, identity.HTTPConfig{AllowedOrigins: []string{s.cfg.AppURL}}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	h := &sandboxHTTP{t: t, s: s, db: db, run: run, router: httprouter.New(), auth: auth, finished: make(chan struct{}), sessions: map[string]string{}}
	s.Register(h.router)
	listener, err := net.Listen("tcp", "127.0.0.1:"+port)
	if err != nil {
		t.Fatal("cannot bind sandbox loopback server")
	}
	h.server = httptest.NewUnstartedServer(http.HandlerFunc(h.serve))
	h.server.Listener = listener
	h.server.Start()
	return h
}

func (h *sandboxHTTP) customer(t *testing.T, ctx context.Context, scenario, clock, method string) (string, string) {
	t.Helper()
	user, customer, err := h.createCustomer(ctx, scenario, clock)
	if err != nil {
		t.Fatal("cannot create isolated synthetic Stripe customer")
	}
	if method != "" {
		h.paymentMethod(t, ctx, customer, method)
	}
	return user, customer
}

func (h *sandboxHTTP) createCustomer(ctx context.Context, scenario, clock string) (string, string, error) {
	token, err := newToken()
	if err != nil {
		return "", "", errors.New("cannot generate synthetic account")
	}
	user := fmt.Sprintf("%s-%s-4%s-8%s-%s", token[:8], token[8:12], token[13:16], token[17:20], token[20:32])
	email := "stripe-" + h.run + "-" + token[:8] + "@example.invalid"
	hash, err := bcrypt.GenerateFromPassword([]byte("synthetic-sandbox-password"), bcrypt.MinCost)
	if err != nil {
		return "", "", errors.New("cannot hash synthetic account password")
	}
	if _, err = h.db.ExecContext(ctx, `INSERT INTO users(id,email,provider,password_hash,credits,plan) VALUES($1,$2,'credentials',$3,100,'free')`, user, email, string(hash)); err != nil {
		return "", "", errors.New("cannot create isolated synthetic account")
	}
	form := url.Values{"email": {email}, "name": {"Sneep Cut synthetic " + scenario}, "metadata[sneepcut_sandbox_run]": {h.run}, "metadata[userId]": {user}}
	if clock != "" {
		form.Set("test_clock", clock)
	}
	customer, err := h.s.provider(ctx, http.MethodPost, "/customers", form, "")
	if err != nil {
		return "", "", err
	}
	id := customer.text("id")
	if !strings.HasPrefix(id, "cus_") || customer.boolean("livemode") {
		return "", "", errors.New("synthetic customer was not confirmed in test mode")
	}
	h.mu.Lock()
	h.customers = append(h.customers, id)
	h.mu.Unlock()
	if _, err = h.db.ExecContext(ctx, `UPDATE users SET stripe_customer_id=$2 WHERE id=$1`, user, id); err != nil {
		return "", "", errors.New("cannot bind synthetic customer to isolated account")
	}
	return user, id, nil
}

func (h *sandboxHTTP) paymentMethod(t *testing.T, ctx context.Context, customer, method string) {
	t.Helper()
	attached := sandboxRequest(t, h.s, ctx, http.MethodPost, "/payment_methods/"+url.PathEscape(method)+"/attach", url.Values{"customer": {customer}})
	sandboxRequest(t, h.s, ctx, http.MethodPost, "/customers/"+url.PathEscape(customer), url.Values{"invoice_settings[default_payment_method]": {attached.text("id")}})
}

func (h *sandboxHTTP) reconcile(t *testing.T, ctx context.Context, user, plan string, credits int) {
	t.Helper()
	if err := h.s.Reconcile(ctx, user); err != nil {
		t.Fatalf("real sandbox reconciliation failed: %s", processingCode(err, "provider_unavailable"))
	}
	a, err := h.s.account(ctx, user)
	if err != nil || a.Plan != plan || a.Credits != credits {
		t.Fatalf("sandbox state mismatch: expected plan=%s credits=%d; got plan=%s credits=%d", plan, credits, a.Plan, a.Credits)
	}
}

func (h *sandboxHTTP) reconcileEventually(t *testing.T, ctx context.Context, user, plan string, credits int) {
	t.Helper()
	deadline := time.Now().Add(time.Minute)
	for time.Now().Before(deadline) {
		if err := h.s.Reconcile(ctx, user); err != nil {
			t.Fatalf("real sandbox reconciliation failed: %s", processingCode(err, "provider_unavailable"))
		}
		a, err := h.s.account(ctx, user)
		if err == nil && a.Plan == plan && a.Credits == credits {
			return
		}
		select {
		case <-ctx.Done():
			t.Fatal("sandbox lifecycle verification deadline exceeded")
		case <-time.After(time.Second):
		}
	}
	t.Fatal("Stripe did not reach the expected reconciled lifecycle state")
}

func (h *sandboxHTTP) advance(t *testing.T, ctx context.Context, frozen int64) {
	t.Helper()
	if frozen <= 0 {
		t.Fatal("subscription did not expose a billing period")
	}
	clock := sandboxRequest(t, h.s, ctx, http.MethodPost, "/test_helpers/test_clocks/"+url.PathEscape(h.clock)+"/advance", url.Values{"frozen_time": {strconv.FormatInt(frozen, 10)}})
	for clock.text("status") != "ready" {
		select {
		case <-ctx.Done():
			t.Fatal("Stripe test clock did not finish advancing")
		case <-time.After(time.Second):
		}
		clock = sandboxRequest(t, h.s, ctx, http.MethodGet, "/test_helpers/test_clocks/"+url.PathEscape(h.clock), nil)
	}
}

func (h *sandboxHTTP) replay(t *testing.T, data object, kind, suffix string) {
	t.Helper()
	body, err := json.Marshal(object{"id": "evt_sneepcut_" + h.run + "_" + suffix, "type": kind, "created": time.Now().Unix(), "livemode": false, "data": object{"object": data}})
	if err != nil {
		t.Fatal("cannot encode local signed replay")
	}
	stamp := strconv.FormatInt(time.Now().Unix(), 10)
	mac := hmac.New(sha256.New, []byte(h.s.cfg.WebhookSecret))
	_, _ = mac.Write(append([]byte(stamp+"."), body...))
	r := httptest.NewRequest(http.MethodPost, "/api/webhooks/stripe", strings.NewReader(string(body)))
	r.Header.Set("Stripe-Signature", "t="+stamp+",v1="+hex.EncodeToString(mac.Sum(nil)))
	w := httptest.NewRecorder()
	h.router.ServeHTTP(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("local signed replay failed with HTTP %d", w.Code)
	}
}

func (h *sandboxHTTP) serve(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if r.URL.Path == "/api/webhooks/stripe" && h.pausedDeliveries.Load() {
		body, err := io.ReadAll(io.LimitReader(r.Body, 1024*1024))
		event, decodeErr := decodeObject(body)
		if err != nil || decodeErr != nil || !verifySignature(body, r.Header.Get("Stripe-Signature"), h.s.cfg.WebhookSecret, time.Now()) {
			http.Error(w, "invalid probe signature", http.StatusBadRequest)
			return
		}
		h.rejectedEventIDs.Store(event.text("id"), true)
		h.rejectedDeliveries.Add(1)
		http.Error(w, "synthetic transport interruption", http.StatusServiceUnavailable)
		return
	}
	if r.Method != http.MethodGet && r.Header.Get("Origin") != "" && r.Header.Get("Origin") != h.s.cfg.AppURL {
		http.Error(w, "origin rejected", http.StatusForbidden)
		return
	}
	switch r.URL.Path {
	case "/sandbox", "/dashboard/billing", "/ro/dashboard/billing":
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = io.WriteString(w, sandboxPage)
	case "/sandbox/start":
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		// A distinct account/customer per browser scenario isolates decline,
		// abandoned, SCA and successful hosted Checkout exercises.
		user, _, err := h.createCustomer(r.Context(), "hosted-checkout", "")
		if err != nil {
			h.t.Error("hosted Checkout synthetic customer setup failed")
			http.Error(w, "synthetic customer setup failed", 500)
			return
		}
		var email string
		if err := h.db.QueryRowContext(r.Context(), `SELECT email FROM users WHERE id=$1`, user).Scan(&email); err != nil {
			http.Error(w, "synthetic account unavailable", 500)
			return
		}
		login, _, _, err := h.auth.Login(r.Context(), email, "synthetic-sandbox-password")
		if err != nil {
			http.Error(w, "synthetic login failed", 500)
			return
		}
		cookie, err := newToken()
		if err != nil {
			http.Error(w, "synthetic session failed", 500)
			return
		}
		h.mu.Lock()
		h.sessions[cookie] = login.AccessToken
		h.mu.Unlock()
		http.SetCookie(w, &http.Cookie{Name: "sneepcut_sandbox", Value: cookie, Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode})
		proxy := httptest.NewRequest(http.MethodPost, "/api/stripe/checkout", strings.NewReader(`{"planId":"creator","locale":"en"}`))
		proxy.Header.Set("Content-Type", "application/json")
		proxy.Header.Set("Authorization", "Bearer "+login.AccessToken)
		result := httptest.NewRecorder()
		h.router.ServeHTTP(result, proxy)
		if result.Code == http.StatusOK {
			if response, err := decodeObject(result.Body.Bytes()); err == nil && hostedURL(response.text("url"), "checkout.stripe.com") != "" {
				h.t.Log("Hosted Checkout opened for an isolated synthetic account")
			}
		}
		for key, values := range result.Header() {
			for _, value := range values {
				w.Header().Add(key, value)
			}
		}
		w.WriteHeader(result.Code)
		_, _ = w.Write(result.Body.Bytes())
	case "/sandbox/billing", "/sandbox/reconcile", "/sandbox/portal":
		if (r.URL.Path == "/sandbox/billing" && r.Method != http.MethodGet) || (r.URL.Path != "/sandbox/billing" && r.Method != http.MethodPost) {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		cookie, err := r.Cookie("sneepcut_sandbox")
		if err != nil {
			http.Error(w, "start a hosted Checkout scenario first", 401)
			return
		}
		h.mu.Lock()
		token := h.sessions[cookie.Value]
		h.mu.Unlock()
		if token == "" {
			http.Error(w, "synthetic session unavailable", 401)
			return
		}
		target, method, body := "/api/stripe/billing", http.MethodGet, ""
		if r.URL.Path == "/sandbox/reconcile" {
			target, method, body = "/api/stripe/reconcile", http.MethodPost, "{}"
		} else if r.URL.Path == "/sandbox/portal" {
			target, method, body = "/api/stripe/portal", http.MethodPost, `{"locale":"en"}`
		}
		if r.URL.RawQuery != "" {
			target += "?" + r.URL.RawQuery
		}
		proxy := httptest.NewRequest(method, target, strings.NewReader(body))
		proxy.Header.Set("Content-Type", "application/json")
		proxy.Header.Set("Authorization", "Bearer "+token)
		h.router.ServeHTTP(w, proxy)
	case "/sandbox/finish":
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		h.finish.Do(func() { close(h.finished) })
		write(w, 200, object{"finished": true})
	default:
		h.router.ServeHTTP(w, r)
	}
}

func (h *sandboxHTTP) cleanup() {
	h.server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	rows, err := h.db.QueryContext(ctx, `SELECT session_id FROM billing_checkout_claims WHERE session_id IS NOT NULL`)
	if err == nil {
		var sessions []string
		for rows.Next() {
			var id string
			if rows.Scan(&id) == nil {
				sessions = append(sessions, id)
			}
		}
		rows.Close()
		for _, id := range sessions {
			if session, err := h.s.session(ctx, id); err == nil && session.text("status") == "open" {
				if err := h.s.expire(ctx, id); err != nil {
					h.t.Error("synthetic Checkout cleanup failed")
				}
			}
		}
	}
	if h.clock != "" {
		if _, err := h.s.provider(ctx, http.MethodDelete, "/test_helpers/test_clocks/"+url.PathEscape(h.clock), nil, ""); err != nil {
			h.t.Error("synthetic test clock cleanup failed")
		}
	}
	h.mu.Lock()
	customers := append([]string{}, h.customers...)
	h.mu.Unlock()
	for _, id := range customers {
		customer, err := h.s.provider(ctx, http.MethodGet, "/customers/"+url.PathEscape(id), nil, "")
		if missingResource(err) || (err == nil && customer.boolean("deleted")) {
			continue
		}
		if err != nil || customer.boolean("livemode") || customer.child("metadata").text("sneepcut_sandbox_run") != h.run {
			h.t.Error("synthetic customer cleanup refused: ownership could not be confirmed")
			continue
		}
		if _, err = h.s.provider(ctx, http.MethodDelete, "/customers/"+url.PathEscape(id), nil, ""); err != nil {
			h.t.Error("synthetic customer cleanup failed")
		}
	}
}

const sandboxPage = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Sneep Cut Stripe sandbox</title><style>body{max-width:760px;margin:48px auto;padding:0 20px;font:16px system-ui;color:#111}button{padding:10px 16px;border:1px solid #bbb;border-radius:6px;background:#fff;margin:5px;cursor:pointer}button:first-of-type{background:#111;color:#fff}pre{white-space:pre-wrap;background:#f3f3f3;padding:20px;border-radius:6px}</style><h1>Stripe sandbox · synthetic account</h1><p>Each new Checkout uses a new isolated synthetic account. Use Stripe test cards only.</p><button id="start">Start new hosted Checkout</button><button id="refresh">Reconcile and refresh</button><button id="portal">Customer Portal</button><pre id="status">Ready.</pre><script>const status=document.getElementById('status');async function call(path,method='POST'){const response=await fetch(path,{method,headers:{'Content-Type':'application/json'},body:method==='POST'?'{}':undefined});const text=await response.text();if(!response.ok)throw Error(text);return JSON.parse(text)}async function refresh(){try{await call('/sandbox/reconcile');const state=await call('/sandbox/billing'+location.search,'GET');status.textContent=JSON.stringify(state,null,2)}catch(error){status.textContent=error.message}}document.getElementById('start').onclick=async()=>{try{status.textContent='Opening secure Stripe Checkout…';const data=await call('/sandbox/start');location.assign(data.url)}catch(error){status.textContent=error.message}};document.getElementById('refresh').onclick=refresh;document.getElementById('portal').onclick=async()=>{try{const data=await call('/sandbox/portal');location.assign(data.url)}catch(error){status.textContent=error.message}};if(location.search)refresh();</script></html>`
