package billing

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"mime"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/julienschmidt/httprouter"
	"sneepcut/backend-go/internal/identity"
	"sneepcut/backend-go/internal/jsonutil"
)

type Config struct {
	SecretKey, WebhookSecret, AppURL, APIBaseURL string
	PlanPrices                                   map[string]string
	CreditPacks                                  map[string]int
	Client                                       *http.Client
}
type Service struct {
	cfg    Config
	db     *sql.DB
	auth   *identity.Handler
	client *http.Client
	now    func() time.Time
}

var currencyPattern = regexp.MustCompile(`^[A-Z]{3}$`)
var uuidPattern = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
var checkoutIDPattern = regexp.MustCompile(`^cs_(?:test_|live_)?[A-Za-z0-9]+$`)
var planCredits = map[string]int{"creator": 300, "pro": 1000, "agency": 999999}

func NewService(cfg Config, db *sql.DB, auth *identity.Handler) (*Service, error) {
	cfg.SecretKey = strings.TrimSpace(cfg.SecretKey)
	cfg.WebhookSecret = strings.TrimSpace(cfg.WebhookSecret)
	if cfg.APIBaseURL == "" {
		cfg.APIBaseURL = "https://api.stripe.com/v1"
	}
	cfg.APIBaseURL = strings.TrimRight(cfg.APIBaseURL, "/")
	for _, raw := range []string{cfg.APIBaseURL, cfg.AppURL} {
		u, err := url.Parse(raw)
		if err != nil || u.Host == "" || u.User != nil || (u.Scheme != "https" && u.Scheme != "http") {
			return nil, errors.New("invalid billing endpoint configuration")
		}
	}
	app, _ := url.Parse(cfg.AppURL)
	cfg.AppURL = app.Scheme + "://" + app.Host
	prices := map[string]string{}
	for k, v := range cfg.PlanPrices {
		prices[k] = strings.TrimSpace(v)
	}
	cfg.PlanPrices = prices
	packs := map[string]int{}
	for k, v := range cfg.CreditPacks {
		if k != "" && v > 0 {
			packs[k] = v
		}
	}
	cfg.CreditPacks = packs
	client := cfg.Client
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	return &Service{cfg: cfg, db: db, auth: auth, client: client, now: time.Now}, nil
}
func (s *Service) Register(router *httprouter.Router) {
	router.Handler(http.MethodGet, "/api/stripe/plans", s.auth.Policy(s.auth.Limit(s.plans, "billing-plans", 120, time.Hour)))
	for path, route := range map[string]struct {
		method  string
		handler http.HandlerFunc
		limit   int
	}{
		"/api/stripe/billing": {http.MethodGet, s.billing, 120}, "/api/stripe/checkout": {http.MethodPost, s.checkout, 10}, "/api/stripe/portal": {http.MethodPost, s.openPortal, 20},
	} {
		router.Handler(route.method, path, s.auth.Require(s.auth.Limit(route.handler, "billing:"+path, route.limit, time.Hour)))
	}
	for _, path := range []string{"/api/stripe/plans", "/api/stripe/billing", "/api/stripe/checkout", "/api/stripe/portal"} {
		router.Handler(http.MethodOptions, path, s.auth.Policy(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) })))
	}
	router.HandlerFunc(http.MethodPost, "/api/webhooks/stripe", s.webhook)
}
func write(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "private, no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}
func failure(w http.ResponseWriter, status int, message string) {
	write(w, status, object{"error": message})
}
func readJSON(w http.ResponseWriter, r *http.Request, target any) bool {
	kind, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || kind != "application/json" {
		failure(w, 415, "content_type_required")
		return false
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1024)
	if err = jsonutil.Read(w, r, target); err != nil {
		failure(w, 400, "invalid_json")
		return false
	}
	return true
}
func terminal(status string) bool { return status == "canceled" || status == "incomplete_expired" }
func paid(plan string) bool       { _, ok := planCredits[plan]; return ok }
func normalizePlan(plan string) string {
	if paid(plan) {
		return plan
	}
	return "free"
}
func billingPath(locale string) string {
	if locale == "ro" {
		return "/ro/dashboard/billing"
	}
	return "/dashboard/billing"
}
func safeURL(raw string) string {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil {
		return ""
	}
	return parsed.String()
}
func (s *Service) planForPrice(id string) string {
	if id == "" {
		return ""
	}
	result := ""
	for plan, price := range s.cfg.PlanPrices {
		if price == id && paid(plan) {
			if result != "" {
				return ""
			}
			result = plan
		}
	}
	return result
}
func (s *Service) completePlans() bool {
	for _, plan := range []string{"creator", "pro", "agency"} {
		price := s.cfg.PlanPrices[plan]
		if price == "" || s.planForPrice(price) != plan {
			return false
		}
	}
	return true
}

type account struct {
	ID, Email, Plan, CustomerID, SubscriptionID, SubscriptionStatus string
	Credits                                                         int
	CancelAtPeriodEnd                                               bool
	CurrentPeriodEnd                                                sql.NullTime
	Generation                                                      int
}
type scanner interface{ Scan(...any) error }

const accountColumns = `id::text,email,plan,credits,COALESCE(stripe_customer_id,''),COALESCE(stripe_subscription_id,''),COALESCE(stripe_subscription_status,''),stripe_cancel_at_period_end,stripe_current_period_end,stripe_checkout_generation`

func scanAccount(row scanner) (account, error) {
	var a account
	err := row.Scan(&a.ID, &a.Email, &a.Plan, &a.Credits, &a.CustomerID, &a.SubscriptionID, &a.SubscriptionStatus, &a.CancelAtPeriodEnd, &a.CurrentPeriodEnd, &a.Generation)
	return a, err
}
func (s *Service) account(ctx context.Context, userID string) (account, error) {
	return scanAccount(s.db.QueryRowContext(ctx, `SELECT `+accountColumns+` FROM users WHERE id=$1`, userID))
}
func (s *Service) deletionPending(ctx context.Context, userID string) (bool, error) {
	var pending bool
	err := s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=$1)`, userID).Scan(&pending)
	return pending, err
}
func (s *Service) plans(w http.ResponseWriter, r *http.Request) {
	catalog := object{}
	for _, plan := range []string{"creator", "pro", "agency"} {
		_, price, err := s.price(r.Context(), plan)
		if err != nil {
			failure(w, 503, "billing_provider_unavailable")
			return
		}
		catalog[plan] = price
	}
	write(w, 200, catalog)
}
func (s *Service) openPortal(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Locale string `json:"locale"`
	}
	if !readJSON(w, r, &input) {
		return
	}
	if input.Locale != "en" && input.Locale != "ro" {
		failure(w, 400, "invalid_locale")
		return
	}
	a, err := s.account(r.Context(), identity.Current(r).User.ID)
	if err != nil {
		failure(w, 503, "billing_unavailable")
		return
	}
	if a.CustomerID == "" {
		failure(w, 409, "billing_profile_not_found")
		return
	}
	link, err := s.portal(r.Context(), a.CustomerID, input.Locale)
	if err != nil {
		failure(w, 502, "billing_provider_unavailable")
		return
	}
	write(w, 200, object{"url": link})
}
func periodEnd(subscription object) any {
	var end int64
	for _, item := range subscription.child("items").list("data") {
		end = max(end, item.number("current_period_end"))
	}
	if end == 0 {
		end = subscription.number("current_period_end")
	}
	if end == 0 {
		return nil
	}
	return time.Unix(end, 0).UTC().Format(time.RFC3339)
}
func mapSubscription(sub object) object {
	return object{"status": sub.text("status"), "cancelAtPeriodEnd": sub.boolean("cancel_at_period_end"), "currentPeriodEnd": periodEnd(sub)}
}
func (s *Service) billing(w http.ResponseWriter, r *http.Request) {
	a, err := s.account(r.Context(), identity.Current(r).User.ID)
	if err != nil {
		failure(w, 503, "billing_unavailable")
		return
	}
	var subscription any
	invoices := []object{}
	available := true
	if a.SubscriptionID != "" {
		var end any
		if a.CurrentPeriodEnd.Valid {
			end = a.CurrentPeriodEnd.Time.UTC().Format(time.RFC3339)
		}
		subscription = object{"status": a.SubscriptionStatus, "cancelAtPeriodEnd": a.CancelAtPeriodEnd, "currentPeriodEnd": end}
	}
	if a.CustomerID != "" {
		list, e := s.provider(r.Context(), http.MethodGet, "/invoices", url.Values{"customer": {a.CustomerID}, "limit": {"12"}}, "")
		if e != nil {
			available = false
		} else {
			for _, invoice := range list.list("data") {
				amount := invoice.number("amount_paid")
				if amount <= 0 {
					amount = invoice.number("total")
				}
				currency := invoice.text("currency")
				if !currencyPattern.MatchString(strings.ToUpper(currency)) {
					currency = "usd"
				}
				invoices = append(invoices, object{"id": invoice.text("id"), "number": invoice.text("number"), "status": invoice.text("status"), "createdAt": time.Unix(invoice.number("created"), 0).UTC().Format(time.RFC3339), "amount": amount, "currency": currency, "hostedUrl": nullable(safeURL(invoice.text("hosted_invoice_url"))), "pdfUrl": nullable(safeURL(invoice.text("invoice_pdf")))})
			}
		}
		var sub object
		if a.SubscriptionID != "" {
			sub, err = s.provider(r.Context(), http.MethodGet, "/subscriptions/"+url.PathEscape(a.SubscriptionID), nil, "")
		} else {
			var all []object
			all, err = s.subscriptions(r.Context(), a.CustomerID)
			for _, candidate := range all {
				if !terminal(candidate.text("status")) {
					sub = candidate
					break
				}
			}
		}
		if err != nil || (sub != nil && sub.id("customer") != a.CustomerID) {
			available = false
		} else if sub != nil {
			subscription = mapSubscription(sub)
		}
	} else if a.SubscriptionID != "" {
		available = false
	}
	var verification any
	if values, has := r.URL.Query()["checkout_session_id"]; has {
		if len(values) != 1 || !checkoutIDPattern.MatchString(values[0]) {
			verification = object{"status": "invalid", "planId": nil}
		} else {
			session, e := s.session(r.Context(), values[0])
			if e != nil {
				verification = object{"status": "unavailable"}
			} else {
				verification = s.verifyCheckout(session, a)
			}
		}
	}
	write(w, 200, object{"account": object{"credits": a.Credits, "plan": normalizePlan(a.Plan), "hasBillingProfile": a.CustomerID != ""}, "subscription": subscription, "invoices": invoices, "providerAvailable": available, "checkoutVerification": verification})
}
func (s *Service) verifyCheckout(session object, a account) object {
	meta := session.child("metadata")
	plan := s.planForPrice(meta.text("priceId"))
	customer := session.id("customer")
	subscription := session.id("subscription")
	owns := session.text("mode") == "subscription" && meta.text("userId") == a.ID && (session.text("client_reference_id") == "" || session.text("client_reference_id") == a.ID) && plan != "" && meta.text("planId") == plan && customer != "" && subscription != "" && (a.CustomerID == "" || a.CustomerID == customer) && (a.SubscriptionID == "" || a.SubscriptionID == subscription)
	if !owns || session.text("status") == "expired" {
		return object{"status": "invalid", "planId": nil}
	}
	status := "pending"
	if session.text("status") == "complete" && (session.text("payment_status") == "paid" || session.text("payment_status") == "no_payment_required") {
		status = "complete"
	}
	return object{"status": status, "planId": plan}
}
func nullable(value string) any {
	if value == "" {
		return nil
	}
	return value
}
