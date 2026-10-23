package admin

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/julienschmidt/httprouter"

	"sneepcut/backend-go/internal/identity"
	"sneepcut/backend-go/internal/testdb"
)

func billingAdminHTTP(t *testing.T, db *sql.DB, role string, configuration BillingConfiguration) http.Handler {
	t.Helper()
	tokens, err := identity.NewTokens(identity.TokenConfig{Secret: routingTestSecret, Issuer: "routing-test", Audience: "routing-test", AccessLifetime: time.Hour, RefreshLifetime: 2 * time.Hour})
	if err != nil {
		t.Fatal(err)
	}
	auth := identity.NewHandler(identity.NewService(routingIdentityRepository{role: role}, tokens), identity.HTTPConfig{}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	router := httprouter.New()
	New(db, auth).WithBillingConfiguration(configuration).Register(router)
	return router
}

func billingAdminRequest(handler http.Handler, path, token string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(http.MethodGet, path, nil)
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func TestBillingRequiresAdminOnEveryRead(t *testing.T) {
	for _, path := range []string{"/api/admin/billing/overview", "/api/admin/billing/subscriptions", "/api/admin/billing/events"} {
		for _, role := range []string{"anonymous", "member", "viewer"} {
			t.Run(path+"/"+role, func(t *testing.T) {
				token, status := "", http.StatusUnauthorized
				if role != "anonymous" {
					token, status = routingToken(t, 0), http.StatusForbidden
				}
				// No database: an authorization bypass would reach it and fail.
				response := billingAdminRequest(billingAdminHTTP(t, nil, role, BillingConfiguration{}), path, token)
				if response.Code != status {
					t.Fatalf("got %d, want %d: %s", response.Code, status, response.Body.String())
				}
			})
		}
	}
}

func TestBillingRejectsInvalidFiltersBeforeQuerying(t *testing.T) {
	handler := billingAdminHTTP(t, nil, "admin", BillingConfiguration{})
	for _, query := range []string{"status=made_up", "plan=enterprise", "q=" + strings.Repeat("x", 121)} {
		response := billingAdminRequest(handler, "/api/admin/billing/subscriptions?"+query, routingToken(t, 11*time.Minute))
		if response.Code != http.StatusBadRequest {
			t.Fatalf("invalid filter accepted: %d %s", response.Code, response.Body.String())
		}
	}
}

func TestBillingDatabaseFailuresStayPrivate(t *testing.T) {
	for _, path := range []string{"overview", "subscriptions", "events"} {
		t.Run(path, func(t *testing.T) {
			db, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			mock.ExpectQuery("SELECT").WillReturnError(errors.New("private database connection credential"))
			response := billingAdminRequest(billingAdminHTTP(t, db, "admin", BillingConfiguration{}), "/api/admin/billing/"+path, routingToken(t, 0))
			if response.Code != http.StatusInternalServerError || strings.Contains(response.Body.String(), "credential") {
				t.Fatalf("database failure not handled privately: %d %s", response.Code, response.Body.String())
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestBillingConfigurationReadinessIsDerived(t *testing.T) {
	for _, test := range []struct {
		configuration    BillingConfiguration
		checkout, portal bool
	}{
		{BillingConfiguration{CheckoutReady: true, PortalReady: true}, false, false},
		{BillingConfiguration{SecretKeyConfigured: true, PlansConfigured: true, PortalConfigured: true}, false, true},
		{BillingConfiguration{SecretKeyConfigured: true, PlansConfigured: true, WebhookConfigured: true, PortalConfigured: true}, true, true},
	} {
		h := New(nil, nil).WithBillingConfiguration(test.configuration)
		if h.billing.CheckoutReady != test.checkout || h.billing.PortalReady != test.portal {
			t.Fatalf("caller could override readiness: %+v", h.billing)
		}
	}
}

func TestBillingPostgresReadsCoveragePaginationAndLedger(t *testing.T) {
	db := testdb.Open(t)
	exec := func(query string, args ...any) {
		t.Helper()
		if _, err := db.Exec(query, args...); err != nil {
			t.Fatal(err)
		}
	}
	for index, fixture := range []struct {
		email, plan, role, customer, subscription, status, period string
		credits                                                   int
		cancel                                                    bool
	}{
		{"excluded@example.test", "free", "member", "", "", "", "NULL", 100, false},
		{"creator@example.test", "creator", "member", "cus_creator", "sub_creator", "active", "now()+interval '1 day'", 1500, false},
		{"expired@example.test", "pro", "member", "cus_expired", "sub_expired", "active", "now()-interval '1 day'", 700, false},
		{"agency@example.test", "agency", "member", "cus_agency", "sub_agency", "active", "now()+interval '1 day'", 20000, true},
		{"pastdue@example.test", "pro", "member", "cus_pastdue", "sub_pastdue", "past_due", "now()+interval '1 day'", 600, false},
		{"literal%name@example.test", "free", "member", "cus_only", "", "", "NULL", 50, false},
		{"manual@example.test", "pro", "member", "cus_manual", "", "", "NULL", 333, false},
		{"admin@example.test", "agency", "admin", "cus_admin", "sub_admin", "active", "now()-interval '1 day'", 999, false},
	} {
		exec(`INSERT INTO users(email,provider,plan,access_role,credits,stripe_customer_id,stripe_subscription_id,stripe_subscription_status,stripe_current_period_end,stripe_cancel_at_period_end,stripe_state_event_created,id) VALUES($1,'credentials',$2,$3,$4,NULLIF($5,''),NULLIF($6,''),NULLIF($7,''),`+fixture.period+`,$8,1234567890,$9)`, fixture.email, fixture.plan, fixture.role, fixture.credits, fixture.customer, fixture.subscription, fixture.status, fixture.cancel, fmt.Sprintf("00000000-0000-4000-8000-%012d", index+1))
	}
	exec(`INSERT INTO stripe_events(id,type,credit_grant_id,processed_at) VALUES ('evt_old','customer.subscription.updated',NULL,now()-interval '2 days'),('evt_paid','invoice.paid','invoice:in_synthetic',now()),('reconcile:synthetic','invoice.paid','invoice:in_recovered',now())`)
	accountID := "acct_synthetic"
	handler := billingAdminHTTP(t, db, "admin", BillingConfiguration{Mode: "test", ExpectedAccountID: &accountID, SecretKeyConfigured: true, PlansConfigured: true, WebhookConfigured: true, PortalConfigured: true})
	get := func(path string, result any) {
		t.Helper()
		response := billingAdminRequest(handler, path, routingToken(t, 11*time.Minute))
		if response.Code != http.StatusOK {
			t.Fatalf("admin read failed: %d %s", response.Code, response.Body.String())
		}
		if err := json.Unmarshal(response.Body.Bytes(), result); err != nil {
			t.Fatal(err)
		}
	}
	var overview billingOverviewResponse
	get("/api/admin/billing/overview", &overview)
	if overview.Accounts != (billingAccounts{BillingProfiles: 7, Subscriptions: 5, ActiveSubscriptions: 2, AttentionRequired: 3, ScheduledCancellations: 1}) {
		t.Fatalf("incorrect coverage counts: %+v", overview.Accounts)
	}
	if overview.Events.ProcessedTotal != 3 || overview.Events.ProcessedLast24Hours != 2 || overview.Events.CreditGrantsTotal != 2 || overview.Events.LastProcessedAt == nil || overview.EventFailuresAvailable {
		t.Fatalf("ledger was misrepresented: %+v", overview)
	}
	if !overview.Configuration.CheckoutReady || !overview.Configuration.PortalReady || overview.Configuration.ExpectedAccountID == nil || *overview.Configuration.ExpectedAccountID != accountID {
		t.Fatalf("configuration presence indicators missing: %+v", overview.Configuration)
	}
	plans := make(map[string]int64)
	for _, item := range overview.Plans {
		plans[item.Plan] = item.Accounts
	}
	if plans["free"] != 3 || plans["creator"] != 1 || plans["pro"] != 1 || plans["agency"] != 2 {
		t.Fatalf("shared effective plan rules not applied: %+v", plans)
	}
	statuses := make(map[string]int64)
	for _, item := range overview.Statuses {
		statuses[item.Status] = item.Accounts
	}
	if statuses["none"] != 2 || statuses["active"] != 4 || statuses["past_due"] != 1 {
		t.Fatalf("raw Stripe statuses were altered: %+v", statuses)
	}
	var first, second, beyond billingSubscriptionsResponse
	get("/api/admin/billing/subscriptions?page=1&pageSize=2", &first)
	get("/api/admin/billing/subscriptions?page=2&pageSize=2", &second)
	get("/api/admin/billing/subscriptions?page=100&pageSize=2", &beyond)
	if first.Total != 7 || first.PageSize != 2 || len(first.Items) != 2 || len(second.Items) != 2 || first.Items[0].ID == second.Items[0].ID || beyond.Total != 7 || len(beyond.Items) != 0 {
		t.Fatalf("pagination lost total or repeated rows: first=%+v second=%+v beyond=%+v", first, second, beyond)
	}
	var expired billingSubscriptionsResponse
	get("/api/admin/billing/subscriptions?q=EXPIRED&plan=free&status=active", &expired)
	if expired.Total != 1 || len(expired.Items) != 1 || expired.Items[0].StoredPlan != "pro" || expired.Items[0].EffectivePlan != "free" || expired.Items[0].Credits != 700 || expired.Items[0].StateEventCreatedAt == nil || expired.Items[0].StateEventCreatedAt.Unix() != 1234567890 {
		t.Fatalf("expired coverage or credit balance misrepresented: %+v", expired)
	}
	for _, test := range []struct {
		query string
		count int64
	}{{"%", 1}, {"' OR 1=1 --", 0}, {"cus_only", 1}, {"sub_creator", 1}} {
		var result billingSubscriptionsResponse
		get("/api/admin/billing/subscriptions?q="+url.QueryEscape(test.query), &result)
		if result.Total != test.count {
			t.Fatalf("literal parameterized search %q got %d", test.query, result.Total)
		}
	}
	var events struct {
		Items []billingEvent `json:"items"`
	}
	get("/api/admin/billing/events?limit=1", &events)
	if len(events.Items) != 1 || events.Items[0].ID == "evt_old" || events.Items[0].CreditGrantID == nil {
		t.Fatalf("recent committed ledger not returned: %+v", events.Items)
	}
	var credits int
	if err := db.QueryRow(`SELECT credits FROM users WHERE email='expired@example.test'`).Scan(&credits); err != nil || credits != 700 {
		t.Fatalf("read path mutated earned credits: %d %v", credits, err)
	}
}
