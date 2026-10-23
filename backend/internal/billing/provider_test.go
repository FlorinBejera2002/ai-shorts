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
	"net/http"
	"net/http/httptest"
	"net/url"
	"reflect"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

const fixtureUser = "11111111-1111-4111-8111-111111111111"
const fixtureOther = "22222222-2222-4222-8222-222222222222"

type transportFunc func(*http.Request) (*http.Response, error)

func (f transportFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func providerResponse(status int, value any) (*http.Response, error) {
	body, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	return &http.Response{StatusCode: status, Header: http.Header{"Content-Type": {"application/json"}}, Body: io.NopCloser(strings.NewReader(string(body)))}, nil
}
func configForTest(transport http.RoundTripper) Config {
	return Config{SecretKey: "sk_test_synthetic", WebhookSecret: "whsec_synthetic", AppURL: "https://app.example.test", APIBaseURL: "https://stripe.example.test/v1", PlanPrices: map[string]string{"creator": "price_creator", "pro": "price_pro", "agency": "price_agency"}, CreditPacks: map[string]int{"price_pack": 50}, Client: &http.Client{Transport: transport, Timeout: time.Second}}
}

// Stripe is entirely mocked. Keys and immutable form snapshots are tracked so
// retries exercise provider idempotency instead of inventing a new operation.
type stripeFixture struct {
	mu            sync.Mutex
	sessions      map[string]object
	keys          map[string]string
	forms         map[string]url.Values
	subs          []object
	invoices      []object
	checkoutLines map[string][]object
	calls         []string
	dropCreate    bool
	failDelete    bool
	failList      bool
}

func newStripeFixture() *stripeFixture {
	return &stripeFixture{sessions: map[string]object{}, keys: map[string]string{}, forms: map[string]url.Values{}, checkoutLines: map[string][]object{}}
}
func (p *stripeFixture) RoundTrip(r *http.Request) (*http.Response, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	user, password, ok := r.BasicAuth()
	if !ok || user != "sk_test_synthetic" || password != "" || r.Header.Get("Stripe-Version") != "2026-06-24.dahlia" {
		return nil, errors.New("invalid provider authorization or version")
	}
	path := strings.TrimPrefix(r.URL.Path, "/v1")
	p.calls = append(p.calls, r.Method+" "+path)
	if strings.HasPrefix(path, "/prices/") {
		return providerResponse(200, object{"id": strings.TrimPrefix(path, "/prices/"), "active": true, "type": "recurring", "currency": "usd", "unit_amount": 1900, "recurring": object{"interval": "month", "interval_count": 1}})
	}
	if r.Method == http.MethodPost && path == "/checkout/sessions" {
		if err := r.ParseForm(); err != nil {
			return nil, err
		}
		key := r.Header.Get("Idempotency-Key")
		if key == "" {
			return nil, errors.New("missing idempotency key")
		}
		id := p.keys[key]
		if id != "" {
			if !reflect.DeepEqual(p.forms[key], r.PostForm) {
				return providerResponse(400, object{"error": object{"code": "idempotency_error"}})
			}
		} else {
			id = fmt.Sprintf("cs_test_%d", len(p.sessions)+1)
			meta := object{}
			for _, name := range []string{"userId", "planId", "priceId", "locale", "checkoutGeneration"} {
				meta[name] = r.Form.Get("metadata[" + name + "]")
			}
			p.keys[key], p.forms[key] = id, r.PostForm
			p.sessions[id] = object{"id": id, "mode": r.Form.Get("mode"), "status": "open", "client_reference_id": r.Form.Get("client_reference_id"), "metadata": meta, "customer": r.Form.Get("customer"), "url": "https://checkout.stripe.com/" + id}
		}
		if p.dropCreate {
			p.dropCreate = false
			return nil, errors.New("synthetic lost response after provider created checkout")
		}
		return providerResponse(200, p.sessions[id])
	}
	if r.Method == http.MethodGet && path == "/checkout/sessions" {
		if p.failList {
			return providerResponse(503, object{"error": object{"code": "synthetic_outage"}})
		}
		rows := []object{}
		for _, session := range p.sessions {
			rows = append(rows, session)
		}
		return providerResponse(200, object{"data": rows, "has_more": false})
	}
	if strings.HasPrefix(path, "/checkout/sessions/") && strings.HasSuffix(path, "/line_items") {
		id := strings.TrimSuffix(strings.TrimPrefix(path, "/checkout/sessions/"), "/line_items")
		return providerResponse(200, object{"data": p.checkoutLines[id], "has_more": false})
	}
	if strings.HasPrefix(path, "/checkout/sessions/") {
		id := strings.TrimSuffix(strings.TrimPrefix(path, "/checkout/sessions/"), "/expire")
		if session := p.sessions[id]; session != nil {
			if strings.HasSuffix(path, "/expire") {
				session["status"] = "expired"
			}
			return providerResponse(200, session)
		}
		return providerResponse(404, object{"error": object{"code": "resource_missing"}})
	}
	if path == "/subscriptions" {
		if p.failList {
			return providerResponse(503, object{"error": object{"code": "synthetic_outage"}})
		}
		return providerResponse(200, object{"data": p.subs, "has_more": false})
	}
	if path == "/invoices" {
		return providerResponse(200, object{"data": p.invoices, "has_more": false})
	}
	if r.Method == http.MethodDelete && (strings.HasPrefix(path, "/customers/") || strings.HasPrefix(path, "/subscriptions/")) {
		if p.failDelete {
			return providerResponse(503, object{"error": object{"code": "synthetic_outage"}})
		}
		return providerResponse(200, object{"id": strings.TrimPrefix(path, "/customers/"), "deleted": true})
	}
	if path == "/billing_portal/sessions" {
		return providerResponse(200, object{"url": "https://billing.stripe.com/portal"})
	}
	return nil, fmt.Errorf("unexpected provider call: %s %s", r.Method, path)
}

func TestModeAndHostedURLBoundaries(t *testing.T) {
	cfg := configForTest(newStripeFixture())
	cfg.SecretKey = "sk_live_synthetic"
	if _, err := NewService(cfg, nil, nil); err == nil {
		t.Fatal("live key accepted in default test mode")
	}
	cfg.Mode = "live"
	if _, err := NewService(cfg, nil, nil); err != nil {
		t.Fatal(err)
	}
	for _, raw := range []string{"http://checkout.stripe.com/a", "https://checkout.stripe.com.evil.test/a", "https://checkout.stripe.com:443/a", "https://user@checkout.stripe.com/a", "https://evil.test/a"} {
		if hostedURL(raw, "checkout.stripe.com") != "" {
			t.Fatalf("unsafe hosted redirect accepted: %s", raw)
		}
	}
	if hostedURL("https://checkout.stripe.com/c/pay/synthetic", "checkout.stripe.com") == "" {
		t.Fatal("official checkout URL rejected")
	}
	var configuration string
	cfg = configForTest(transportFunc(func(r *http.Request) (*http.Response, error) {
		_ = r.ParseForm()
		configuration = r.Form.Get("configuration")
		return providerResponse(200, object{"url": "https://billing.stripe.com/p/session/synthetic"})
	}))
	cfg.PortalConfiguration = "bpc_synthetic"
	s, err := NewService(cfg, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.portal(context.Background(), "cus_synthetic", "en"); err != nil || configuration != cfg.PortalConfiguration {
		t.Fatalf("portal configuration %q: %v", configuration, err)
	}
	if s.matchesMode(object{"livemode": true}) {
		t.Fatal("live object accepted in test mode")
	}
}

func TestProviderCheckoutRestrictsPaymentsToImmediateCards(t *testing.T) {
	p := newStripeFixture()
	s, err := NewService(configForTest(p), nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	c := claimSnapshot()
	c.Generation = 7
	c.CheckoutExpiresAt = time.Now().Add(checkoutLifetime)
	if _, err := s.createProviderCheckout(context.Background(), c); err != nil {
		t.Fatal(err)
	}
	form := p.forms[checkoutKey(c.UserID, c.Generation)]
	if !reflect.DeepEqual(form["payment_method_types[0]"], []string{"card"}) || form.Has("payment_method_types[1]") || form.Get("mode") != "subscription" {
		t.Fatal("subscription Checkout enabled payment methods with delayed confirmation")
	}
}

func TestEntitlementsNeverFallBackToMetadata(t *testing.T) {
	s, _ := NewService(configForTest(newStripeFixture()), nil, nil)
	sub := subscriptionFixture("sub_synthetic", "cus_synthetic", "agency", "active", 1)
	sub["items"] = object{"data": []object{{"price": "price_unmanaged", "quantity": 1}}}
	if s.subscriptionPlan(sub) != "" {
		t.Fatal("metadata authorized unsupported subscription price")
	}
	sub["items"] = object{"data": []object{{"price": "price_creator"}, {"price": "price_agency"}}}
	if s.subscriptionPlan(sub) != "" {
		t.Fatal("multiple subscription prices authorized a plan")
	}
	invoice := invoiceFixture()
	invoice["lines"] = object{"data": []object{{"price": "price_unmanaged"}}}
	if s.invoicePlan(invoice) != "" {
		t.Fatal("metadata authorized unsupported invoice price")
	}
	invoice["lines"] = object{"data": []object{{"price": "price_creator"}, {"price": "price_unmanaged"}}}
	if s.invoicePlan(invoice) != "" {
		t.Fatal("mixed invoice authorized a credit grant")
	}
}

func TestSignatureAndWebhookBoundary(t *testing.T) {
	now := time.Unix(1788696000, 0)
	body := []byte(`{"id":"evt_example","type":"unmanaged"}`)
	sign := func(at time.Time) string {
		stamp := strconv.FormatInt(at.Unix(), 10)
		mac := hmac.New(sha256.New, []byte("whsec_synthetic"))
		mac.Write([]byte(stamp + "."))
		mac.Write(body)
		return "t=" + stamp + ",v1=deadbeef,v1=" + hex.EncodeToString(mac.Sum(nil))
	}
	if !verifySignature(body, sign(now), "whsec_synthetic", now) {
		t.Fatal("valid signature rejected")
	}
	for _, test := range []struct {
		body           []byte
		header, secret string
	}{
		{append(append([]byte{}, body...), ' '), sign(now), "whsec_synthetic"},
		{body, sign(now.Add(-301 * time.Second)), "whsec_synthetic"},
		{body, sign(now.Add(301 * time.Second)), "whsec_synthetic"},
		{body, sign(now), "wrong"},
		{body, "t=invalid,v1=bad", "whsec_synthetic"},
	} {
		if verifySignature(test.body, test.header, test.secret, now) {
			t.Fatal("invalid signature accepted")
		}
	}
	s, _ := NewService(configForTest(newStripeFixture()), nil, nil)
	s.now = func() time.Time { return now }
	for _, test := range []struct {
		body, signature string
		status          int
	}{
		{string(body), "invalid", 400},
		{strings.Repeat("x", 1024*1024+1), sign(now), 413},
	} {
		r := httptest.NewRequest(http.MethodPost, "/api/webhooks/stripe", strings.NewReader(test.body))
		r.Header.Set("Stripe-Signature", test.signature)
		w := httptest.NewRecorder()
		s.webhook(w, r)
		if w.Code != test.status {
			t.Fatalf("webhook status %d, want %d", w.Code, test.status)
		}
	}
}

func TestWebhookRejectsSignedLiveEventsInTestMode(t *testing.T) {
	s, _ := NewService(configForTest(newStripeFixture()), nil, nil)
	now := time.Unix(1788696000, 0)
	s.now = func() time.Time { return now }
	for _, body := range []string{`{"id":"evt_live","type":"invoice.paid","livemode":true}`, `{"id":"evt_missing_mode","type":"invoice.paid"}`} {
		stamp := strconv.FormatInt(now.Unix(), 10)
		mac := hmac.New(sha256.New, []byte("whsec_synthetic"))
		_, _ = mac.Write([]byte(stamp + "." + body))
		r := httptest.NewRequest(http.MethodPost, "/api/webhooks/stripe", strings.NewReader(body))
		r.Header.Set("Stripe-Signature", "t="+stamp+",v1="+hex.EncodeToString(mac.Sum(nil)))
		w := httptest.NewRecorder()
		s.webhook(w, r)
		if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "invalid_event_mode") {
			t.Fatalf("mixed mode event reached persistence: %d %s", w.Code, w.Body.String())
		}
	}
}

func TestPriceCatalogFailsClosed(t *testing.T) {
	for _, change := range []func(object){
		func(o object) { o["active"] = false }, func(o object) { o["type"] = "one_time" },
		func(o object) { o["unit_amount"] = nil }, func(o object) { o["currency"] = "US" },
		func(o object) { o["recurring"] = object{"interval": "year", "interval_count": 1} },
		func(o object) { o["recurring"] = object{"interval": "month", "interval_count": 2} },
	} {
		s, _ := NewService(configForTest(transportFunc(func(r *http.Request) (*http.Response, error) {
			o := object{"id": "price_creator", "active": true, "type": "recurring", "currency": "usd", "unit_amount": 1900, "recurring": object{"interval": "month", "interval_count": 1}}
			change(o)
			return providerResponse(200, o)
		})), nil, nil)
		if _, _, err := s.price(context.Background(), "creator"); err == nil {
			t.Fatal("invalid price accepted")
		}
	}
	p := newStripeFixture()
	s, _ := NewService(configForTest(p), nil, nil)
	w := httptest.NewRecorder()
	s.plans(w, httptest.NewRequest("GET", "/api/stripe/plans", nil))
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"currency":"USD"`) {
		t.Fatalf("catalog: %d %s", w.Code, w.Body.String())
	}
	s.cfg.PlanPrices["pro"] = "price_creator"
	if _, _, err := s.price(context.Background(), "creator"); err == nil {
		t.Fatal("ambiguous prices accepted")
	}
}

func TestProviderPaginationAndCheckoutOwnership(t *testing.T) {
	var cursors []string
	s, _ := NewService(configForTest(transportFunc(func(r *http.Request) (*http.Response, error) {
		cursor := r.URL.Query().Get("starting_after")
		cursors = append(cursors, cursor)
		if cursor == "" {
			return providerResponse(200, object{"data": []object{{"id": "first"}}, "has_more": true})
		}
		return providerResponse(200, object{"data": []object{{"id": "second"}}, "has_more": false})
	})), nil, nil)
	rows, err := s.listProvider(context.Background(), "/subscriptions", nil)
	if err != nil || len(rows) != 2 || !reflect.DeepEqual(cursors, []string{"", "first"}) {
		t.Fatalf("pagination: %v %v", rows, err)
	}
	a := account{ID: fixtureUser, CustomerID: "cus_owned", SubscriptionID: "sub_owned", Plan: "creator", SubscriptionStatus: "active", CurrentPeriodEnd: sql.NullTime{Time: time.Now().Add(time.Hour), Valid: true}}
	checkout := object{"mode": "subscription", "client_reference_id": fixtureUser, "customer": "cus_owned", "subscription": "sub_owned", "status": "complete", "payment_status": "paid", "metadata": object{"userId": fixtureUser, "planId": "creator", "priceId": "price_creator"}}
	if got := s.verifyCheckout(checkout, a).text("status"); got != "complete" {
		t.Fatal(got)
	}
	a.Plan = "free"
	if got := s.verifyCheckout(checkout, a).text("status"); got != "pending" {
		t.Fatal("completed redirect confirmed access before local synchronization")
	}
	a.SubscriptionID, a.SubscriptionStatus = "sub_previous", "canceled"
	if got := s.verifyCheckout(checkout, a).text("status"); got != "pending" {
		t.Fatal("resubscription return was rejected before webhook synchronization")
	}
	a.SubscriptionID, a.SubscriptionStatus = "sub_owned", "active"
	checkout["customer"] = "cus_foreign"
	if got := s.verifyCheckout(checkout, a).text("status"); got != "invalid" {
		t.Fatal("foreign checkout accepted")
	}
	checkout["customer"] = "cus_owned"
	checkout["client_reference_id"] = fixtureOther
	if got := s.verifyCheckout(checkout, a).text("status"); got != "invalid" {
		t.Fatal("foreign reference accepted")
	}
}
