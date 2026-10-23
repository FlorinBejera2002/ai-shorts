package billing

import (
	"context"
	"database/sql"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/julienschmidt/httprouter"
	"golang.org/x/crypto/bcrypt"
	"sneepcut/backend-go/internal/brand"
	"sneepcut/backend-go/internal/identity"
)

func billingHTTPFixture(t *testing.T, s *Service, db *sql.DB) (*httprouter.Router, string) {
	t.Helper()
	hash, err := bcrypt.GenerateFromPassword([]byte("synthetic-password"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	execute(t, db, `UPDATE users SET password_hash=$2 WHERE id=$1`, fixtureUser, string(hash))
	tokens, err := identity.NewTokens(identity.TokenConfig{Secret: strings.Repeat("synthetic", 8), Issuer: "billing-test", Audience: "billing-test", AccessLifetime: time.Minute, RefreshLifetime: time.Hour})
	if err != nil {
		t.Fatal(err)
	}
	authService := identity.NewService(identity.NewPostgres(db), tokens)
	login, _, _, err := authService.Login(context.Background(), "synthetic@example.test", "synthetic-password")
	if err != nil {
		t.Fatal(err)
	}
	s.auth = identity.NewHandler(authService, identity.HTTPConfig{}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	router := httprouter.New()
	s.Register(router)
	return router, login.AccessToken
}

func billingHTTPRequest(router *httprouter.Router, method, target, body, token string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, target, strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	router.ServeHTTP(w, r)
	return w
}

func TestPostgresBillingHTTPRejectsForeignOwnershipAndUnauthenticatedRequests(t *testing.T) {
	s, p, db := billingDatabase(t)
	execute(t, db, `UPDATE users SET credits=777,plan='pro',stripe_customer_id='cus_foreign',stripe_subscription_id='sub_foreign',stripe_subscription_status='active' WHERE id=$1`, fixtureOther)
	router, bearer := billingHTTPFixture(t, s, db)
	request := func(method, target, body, token string) *httptest.ResponseRecorder {
		return billingHTTPRequest(router, method, target, body, token)
	}
	for _, route := range []struct{ method, path string }{{"GET", "/api/stripe/billing"}, {"POST", "/api/stripe/checkout"}, {"POST", "/api/stripe/portal"}, {"POST", "/api/stripe/reconcile"}} {
		if w := request(route.method, route.path, "{}", ""); w.Code != http.StatusUnauthorized {
			t.Fatalf("unauthenticated %s: %d %s", route.path, w.Code, w.Body.String())
		}
	}
	w := request("GET", "/api/stripe/billing?userId="+fixtureOther+"&customer=cus_foreign", "", bearer)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"credits":100`) || strings.Contains(w.Body.String(), `777`) {
		t.Fatalf("foreign billing query changed owner: %d %s", w.Code, w.Body.String())
	}
	if response, err := decodeObject(w.Body.Bytes()); err != nil || response.text("mode") != "test" {
		t.Fatal("billing response must disclose the configured test mode")
	}
	for _, route := range []struct{ path, body string }{
		{"/api/stripe/checkout", `{"planId":"creator","locale":"en","userId":"` + fixtureOther + `","priceId":"price_foreign","amount":1}`},
		{"/api/stripe/portal", `{"locale":"en","customerId":"cus_foreign"}`},
		{"/api/stripe/reconcile", `{"userId":"` + fixtureOther + `","customerId":"cus_foreign"}`},
	} {
		if w := request("POST", route.path, route.body, bearer); w.Code != http.StatusBadRequest {
			t.Fatalf("foreign mutation %s accepted: %d %s", route.path, w.Code, w.Body.String())
		}
	}
	if w := request("POST", "/api/stripe/reconcile", "{}", bearer); w.Code != http.StatusOK {
		t.Fatalf("self reconciliation: %d %s", w.Code, w.Body.String())
	}
	p.sessions["cs_test_foreign"] = object{"id": "cs_test_foreign", "mode": "subscription", "status": "complete", "payment_status": "paid", "customer": "cus_foreign", "subscription": "sub_foreign", "client_reference_id": fixtureOther, "metadata": object{"userId": fixtureOther, "planId": "pro", "priceId": "price_pro"}}
	w = request("GET", "/api/stripe/billing?checkout_session_id=cs_test_foreign", "", bearer)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"status":"invalid"`) {
		t.Fatalf("foreign checkout accepted: %d %s", w.Code, w.Body.String())
	}
	requireAccount(t, s, 100, "free", "")
	other, err := s.account(context.Background(), fixtureOther)
	if err != nil || other.Credits != 777 || other.Plan != "pro" || other.CustomerID != "cus_foreign" {
		t.Fatalf("foreign account modified: %+v %v", other, err)
	}
}

func TestPostgresMissedWebhookCoverageExpiresAndReconciliationRestoresAccess(t *testing.T) {
	s, p, db := billingDatabase(t)
	s.now = time.Now
	execute(t, db, `UPDATE users SET plan='agency',stripe_customer_id='cus_expiry',stripe_subscription_id='sub_expiry',stripe_subscription_status='active',stripe_current_period_end=now()+interval '1 hour' WHERE id=$1`, fixtureUser)
	router, bearer := billingHTTPFixture(t, s, db)
	brands := brand.NewRepository(db)
	if err := brands.Update(context.Background(), fixtureUser, map[string]any{"hidePlatformBadge": true}); err != nil {
		t.Fatal("current paid period lost its white-label entitlement", err)
	}
	assertPlan := func(want string, credits int) {
		t.Helper()
		w := billingHTTPRequest(router, "GET", "/api/stripe/billing", "", bearer)
		if w.Code != http.StatusOK {
			t.Fatalf("billing response failed: %d %s", w.Code, w.Body.String())
		}
		response, err := decodeObject(w.Body.Bytes())
		if err != nil || response.child("account").text("plan") != want || response.child("account").number("credits") != int64(credits) {
			t.Fatalf("billing effective access mismatch: %s", w.Body.String())
		}
		user, err := identity.NewPostgres(db).FindByEmail(context.Background(), "synthetic@example.test")
		if err != nil || user.Plan != want || user.Credits != credits {
			t.Fatalf("authenticated user entitlement mismatch: plan=%s credits=%d error=%v", user.Plan, user.Credits, err)
		}
	}
	assertPlan("agency", 100)
	// Simulate crossing the last verified coverage boundary without receiving
	// any cancellation, payment failure or renewal callback from Stripe.
	execute(t, db, `UPDATE users SET stripe_current_period_end=now()-interval '1 second' WHERE id=$1`, fixtureUser)
	assertPlan("free", 100)
	if err := brands.Update(context.Background(), fixtureUser, map[string]any{"hidePlatformBadge": true}); !errors.Is(err, brand.ErrPlan) {
		t.Fatalf("expired Stripe coverage authorized a protected brand mutation: %v", err)
	}
	requireAccount(t, s, 100, "agency", "active") // Raw financial state remains available for recovery.
	sub := subscriptionFixture("sub_expiry", "cus_expiry", "agency", "active", 1)
	sub.child("items").list("data")[0]["current_period_end"] = time.Now().Add(30 * 24 * time.Hour).Unix()
	p.subs = []object{sub}
	invoice := invoiceFixture()
	invoice["id"], invoice["customer"] = "in_expiry_renewal", "cus_expiry"
	invoice.child("parent").child("subscription_details")["subscription"] = "sub_expiry"
	invoice["lines"] = object{"data": []object{{"pricing": object{"price_details": object{"price": "price_agency"}}}}}
	p.invoices = []object{invoice}
	if err := s.Reconcile(context.Background(), fixtureUser); err != nil {
		t.Fatal(err)
	}
	assertPlan("agency", 100+planCredits["agency"])
	if err := brands.Update(context.Background(), fixtureUser, map[string]any{"hidePlatformBadge": true}); err != nil {
		t.Fatal("verified renewed coverage did not restore protected access", err)
	}
}

func TestPostgresPortalExplicitCancellationBoundsNoticeAndAccessCoverage(t *testing.T) {
	s, p, db := billingDatabase(t)
	s.now = time.Now
	cancelAt := time.Now().Add(time.Hour).Unix()
	sub := subscriptionFixture("sub_explicit_cancel", "cus_explicit_cancel", "agency", "active", 1)
	sub["cancel_at_period_end"], sub["cancel_at"] = false, cancelAt
	sub.child("items").list("data")[0]["current_period_end"] = time.Now().Add(48 * time.Hour).Unix()
	p.subs = []object{sub}
	if _, err := s.processEvent(context.Background(), eventFor("evt_explicit_cancel", "customer.subscription.updated", sub, time.Now().Unix())); err != nil {
		t.Fatal(err)
	}
	a := requireAccount(t, s, 100, "agency", "active")
	if !a.CancelAtPeriodEnd || !a.CurrentPeriodEnd.Valid || a.CurrentPeriodEnd.Time.Unix() != cancelAt {
		t.Fatalf("explicit portal cancellation was not bounded: %+v", a)
	}
	router, bearer := billingHTTPFixture(t, s, db)
	w := billingHTTPRequest(router, "GET", "/api/stripe/billing", "", bearer)
	response, err := decodeObject(w.Body.Bytes())
	if err != nil || w.Code != http.StatusOK || !response.child("subscription").boolean("cancelAtPeriodEnd") || response.child("subscription").text("currentPeriodEnd") != time.Unix(cancelAt, 0).UTC().Format(time.RFC3339) || response.child("account").text("plan") != "agency" {
		t.Fatalf("billing notice still reports renewal: %d %s", w.Code, w.Body.String())
	}
	// If the terminal callback is delayed beyond cancel_at, the later billing
	// period must not extend paid access beyond that explicit cancellation.
	sub["cancel_at"] = time.Now().Add(-time.Second).Unix()
	if _, err := s.processEvent(context.Background(), eventFor("evt_cancel_boundary", "customer.subscription.updated", sub, time.Now().Unix())); err != nil {
		t.Fatal(err)
	}
	w = billingHTTPRequest(router, "GET", "/api/stripe/billing", "", bearer)
	response, err = decodeObject(w.Body.Bytes())
	if err != nil || w.Code != http.StatusOK || response.child("account").text("plan") != "free" || response.child("account").number("credits") != 100 {
		t.Fatalf("explicit cancellation did not expire effective access: %d %s", w.Code, w.Body.String())
	}
	requireAccount(t, s, 100, "agency", "active")
}
