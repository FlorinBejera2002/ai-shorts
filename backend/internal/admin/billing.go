package admin

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/julienschmidt/httprouter"

	"sneepcut/backend-go/internal/entitlements"
	"sneepcut/backend-go/internal/httpx"
)

// BillingConfiguration contains presence indicators only. It must never contain
// API keys or webhook secrets. These flags are not a provider health check.
type BillingConfiguration struct {
	Mode                string  `json:"mode"`
	ExpectedAccountID   *string `json:"expectedAccountId"`
	SecretKeyConfigured bool    `json:"secretKeyConfigured"`
	WebhookConfigured   bool    `json:"webhookConfigured"`
	PlansConfigured     bool    `json:"plansConfigured"`
	PortalConfigured    bool    `json:"portalConfigured"`
	CheckoutReady       bool    `json:"checkoutReady"`
	PortalReady         bool    `json:"portalReady"`
}

func (h *Handler) WithBillingConfiguration(configuration BillingConfiguration) *Handler {
	configuration.CheckoutReady = configuration.SecretKeyConfigured && configuration.PlansConfigured && configuration.WebhookConfigured
	configuration.PortalReady = configuration.SecretKeyConfigured && configuration.PortalConfigured
	h.billing = configuration
	return h
}

func (h *Handler) registerBilling(router *httprouter.Router) {
	router.Handler(http.MethodGet, "/api/admin/billing/overview", h.auth.RequireAdmin(h.billingOverview))
	router.Handler(http.MethodGet, "/api/admin/billing/subscriptions", h.auth.RequireAdmin(h.billingSubscriptions))
	router.Handler(http.MethodGet, "/api/admin/billing/events", h.auth.RequireAdmin(h.billingEvents))
}

const billingProfileSQL = `(NULLIF(u.stripe_customer_id,'') IS NOT NULL OR NULLIF(u.stripe_subscription_id,'') IS NOT NULL)`
const coveredSubscriptionSQL = `(NULLIF(u.stripe_subscription_id,'') IS NOT NULL AND u.stripe_subscription_status IN ('active','trialing') AND u.stripe_current_period_end>clock_timestamp())`
const attentionSubscriptionSQL = `(NULLIF(u.stripe_subscription_id,'') IS NOT NULL AND (COALESCE(u.stripe_subscription_status,'') IN ('past_due','unpaid','incomplete','paused') OR (u.stripe_subscription_status IN ('active','trialing') AND (u.stripe_current_period_end IS NULL OR u.stripe_current_period_end<=clock_timestamp()))))`

type billingAccounts struct {
	BillingProfiles        int64 `json:"billingProfiles"`
	Subscriptions          int64 `json:"subscriptions"`
	ActiveSubscriptions    int64 `json:"activeSubscriptions"`
	AttentionRequired      int64 `json:"attentionRequired"`
	ScheduledCancellations int64 `json:"scheduledCancellations"`
}

type billingPlanCount struct {
	Plan     string `json:"plan"`
	Accounts int64  `json:"accounts"`
}

type billingStatusCount struct {
	Status   string `json:"status"`
	Accounts int64  `json:"accounts"`
}

type billingEventMetrics struct {
	ProcessedTotal       int64      `json:"processedTotal"`
	ProcessedLast24Hours int64      `json:"processedLast24Hours"`
	CreditGrantsTotal    int64      `json:"creditGrantsTotal"`
	LastProcessedAt      *time.Time `json:"lastProcessedAt"`
}

type billingOverviewResponse struct {
	Configuration          BillingConfiguration `json:"configuration"`
	Accounts               billingAccounts      `json:"accounts"`
	Plans                  []billingPlanCount   `json:"plans"`
	Statuses               []billingStatusCount `json:"statuses"`
	Events                 billingEventMetrics  `json:"events"`
	EventFailuresAvailable bool                 `json:"eventFailuresAvailable"`
}

func (h *Handler) billingOverview(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	response := billingOverviewResponse{Configuration: h.billing, Plans: []billingPlanCount{}, Statuses: []billingStatusCount{}}
	err := h.db.QueryRowContext(ctx, `SELECT count(*),
		count(*) FILTER (WHERE NULLIF(u.stripe_subscription_id,'') IS NOT NULL),
		count(*) FILTER (WHERE `+coveredSubscriptionSQL+`),
		count(*) FILTER (WHERE `+attentionSubscriptionSQL+`),
		count(*) FILTER (WHERE u.stripe_cancel_at_period_end AND `+coveredSubscriptionSQL+`)
		FROM users u WHERE `+billingProfileSQL).Scan(&response.Accounts.BillingProfiles, &response.Accounts.Subscriptions, &response.Accounts.ActiveSubscriptions, &response.Accounts.AttentionRequired, &response.Accounts.ScheduledCancellations)
	if err == nil {
		err = h.readBillingPlanCounts(ctx, &response.Plans)
	}
	if err == nil {
		err = h.readBillingStatusCounts(ctx, &response.Statuses)
	}
	if err == nil {
		err = h.db.QueryRowContext(ctx, `SELECT count(*),count(*) FILTER (WHERE processed_at>=now()-interval '24 hours'),count(credit_grant_id),max(processed_at) FROM stripe_events`).Scan(&response.Events.ProcessedTotal, &response.Events.ProcessedLast24Hours, &response.Events.CreditGrantsTotal, &response.Events.LastProcessedAt)
	}
	if err != nil {
		h.fail(w, "load admin billing overview", err)
		return
	}
	httpx.JSON(w, http.StatusOK, response)
}

func (h *Handler) readBillingPlanCounts(ctx context.Context, counts *[]billingPlanCount) error {
	rows, err := h.db.QueryContext(ctx, `SELECT `+entitlements.EffectivePlanSQL+` AS effective_plan,count(*) FROM users u WHERE `+billingProfileSQL+` GROUP BY effective_plan ORDER BY effective_plan`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var item billingPlanCount
		if err := rows.Scan(&item.Plan, &item.Accounts); err != nil {
			return err
		}
		*counts = append(*counts, item)
	}
	return rows.Err()
}

func (h *Handler) readBillingStatusCounts(ctx context.Context, counts *[]billingStatusCount) error {
	rows, err := h.db.QueryContext(ctx, `SELECT COALESCE(NULLIF(u.stripe_subscription_status,''),'none'),count(*) FROM users u WHERE `+billingProfileSQL+` GROUP BY 1 ORDER BY 1`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var item billingStatusCount
		if err := rows.Scan(&item.Status, &item.Accounts); err != nil {
			return err
		}
		*counts = append(*counts, item)
	}
	return rows.Err()
}

type billingSubscription struct {
	ID                  string     `json:"id"`
	Email               string     `json:"email"`
	Name                *string    `json:"name"`
	StoredPlan          string     `json:"storedPlan"`
	EffectivePlan       string     `json:"effectivePlan"`
	Credits             int        `json:"credits"`
	SubscriptionStatus  string     `json:"subscriptionStatus"`
	CustomerID          *string    `json:"customerId"`
	SubscriptionID      *string    `json:"subscriptionId"`
	CurrentPeriodEnd    *time.Time `json:"currentPeriodEnd"`
	CancelAtPeriodEnd   bool       `json:"cancelAtPeriodEnd"`
	StateEventCreatedAt *time.Time `json:"stateEventCreatedAt"`
}

type billingSubscriptionsResponse struct {
	Items    []billingSubscription `json:"items"`
	Total    int64                 `json:"total"`
	Page     int                   `json:"page"`
	PageSize int                   `json:"pageSize"`
}

func billingSubscriptionFilter(r *http.Request) (string, []any, error) {
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if len(query) > 120 {
		return "", nil, fmt.Errorf("Search is too long")
	}
	status := r.URL.Query().Get("status")
	switch status {
	case "", "none", "active", "trialing", "past_due", "unpaid", "canceled", "incomplete", "incomplete_expired", "paused":
	default:
		return "", nil, fmt.Errorf("Invalid subscription status")
	}
	plan := r.URL.Query().Get("plan")
	switch plan {
	case "", "free", "creator", "pro", "agency":
	default:
		return "", nil, fmt.Errorf("Invalid plan")
	}
	where := []string{billingProfileSQL}
	args := make([]any, 0, 3)
	add := func(clause string, value string) {
		args = append(args, value)
		where = append(where, fmt.Sprintf(clause, len(args)))
	}
	if query != "" {
		// strpos treats wildcard characters as literal search text.
		add(`(strpos(lower(u.email),lower($%[1]d))>0 OR strpos(lower(COALESCE(u.name,'')),lower($%[1]d))>0 OR strpos(COALESCE(u.stripe_customer_id,''),$%[1]d)>0 OR strpos(COALESCE(u.stripe_subscription_id,''),$%[1]d)>0)`, query)
	}
	if status != "" {
		add(`COALESCE(NULLIF(u.stripe_subscription_status,''),'none')=$%d`, status)
	}
	if plan != "" {
		add(`(`+entitlements.EffectivePlanSQL+`)=$%d`, plan)
	}
	return strings.Join(where, " AND "), args, nil
}

func (h *Handler) billingSubscriptions(w http.ResponseWriter, r *http.Request) {
	where, args, err := billingSubscriptionFilter(r)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	page := boundedInt(r.URL.Query().Get("page"), 1, 1, 100000)
	pageSize := boundedInt(r.URL.Query().Get("pageSize"), 25, 1, 100)
	response := billingSubscriptionsResponse{Items: make([]billingSubscription, 0, pageSize), Page: page, PageSize: pageSize}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	// A separate count keeps pagination truthful even beyond the last page.
	err = h.db.QueryRowContext(ctx, `SELECT count(*) FROM users u WHERE `+where, args...).Scan(&response.Total)
	if err != nil {
		h.fail(w, "count admin billing subscriptions", err)
		return
	}
	args = append(args, pageSize, (page-1)*pageSize)
	query := fmt.Sprintf(`SELECT u.id,u.email,u.name,u.plan,%s,u.credits,COALESCE(NULLIF(u.stripe_subscription_status,''),'none'),NULLIF(u.stripe_customer_id,''),NULLIF(u.stripe_subscription_id,''),u.stripe_current_period_end,u.stripe_cancel_at_period_end,CASE WHEN u.stripe_state_event_created>0 THEN to_timestamp(u.stripe_state_event_created) END FROM users u WHERE %s ORDER BY u.created_at DESC,u.id DESC LIMIT $%d OFFSET $%d`, entitlements.EffectivePlanSQL, where, len(args)-1, len(args))
	rows, err := h.db.QueryContext(ctx, query, args...)
	if err != nil {
		h.fail(w, "list admin billing subscriptions", err)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var item billingSubscription
		if err = rows.Scan(&item.ID, &item.Email, &item.Name, &item.StoredPlan, &item.EffectivePlan, &item.Credits, &item.SubscriptionStatus, &item.CustomerID, &item.SubscriptionID, &item.CurrentPeriodEnd, &item.CancelAtPeriodEnd, &item.StateEventCreatedAt); err != nil {
			break
		}
		response.Items = append(response.Items, item)
	}
	if err == nil {
		err = rows.Err()
	}
	if err != nil {
		h.fail(w, "scan admin billing subscriptions", err)
		return
	}
	httpx.JSON(w, http.StatusOK, response)
}

type billingEvent struct {
	ID            string    `json:"id"`
	Type          string    `json:"type"`
	ProcessedAt   time.Time `json:"processedAt"`
	CreditGrantID *string   `json:"creditGrantId"`
}

func (h *Handler) billingEvents(w http.ResponseWriter, r *http.Request) {
	limit := boundedInt(r.URL.Query().Get("limit"), 25, 1, 100)
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	rows, err := h.db.QueryContext(ctx, `SELECT id,type,processed_at,credit_grant_id FROM stripe_events ORDER BY processed_at DESC,id DESC LIMIT $1`, limit)
	if err != nil {
		h.fail(w, "list admin billing events", err)
		return
	}
	defer rows.Close()
	items := make([]billingEvent, 0, limit)
	for rows.Next() {
		var item billingEvent
		if err = rows.Scan(&item.ID, &item.Type, &item.ProcessedAt, &item.CreditGrantID); err != nil {
			break
		}
		items = append(items, item)
	}
	if err == nil {
		err = rows.Err()
	}
	if err != nil {
		h.fail(w, "scan admin billing events", err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"items": items})
}
