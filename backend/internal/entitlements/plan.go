// Package entitlements bounds paid feature access by verified Stripe coverage.
// It never changes financial subscription state or earned credit balances.
package entitlements

import "time"

// EffectivePlanSQL is the effective plan expression for a users table aliased u.
// Keep this aligned with EffectivePlan. The database clock also bounds access
// for workers and mutations that do not pass through authenticated HTTP reads.
const EffectivePlanSQL = `CASE
	WHEN u.access_role='admin' OR NULLIF(u.stripe_subscription_id,'') IS NULL THEN u.plan
	WHEN u.stripe_subscription_status IN ('active','trialing') AND u.stripe_current_period_end>clock_timestamp() THEN u.plan
	ELSE 'free' END`

// EffectivePlan preserves manual/non-Stripe grants and admin access. Stripe
// feature access needs a verified future period; missing or expired coverage
// cannot remain paid forever after a lost renewal/failure/cancellation webhook.
func EffectivePlan(plan, role, subscriptionID, status string, periodEnd, now time.Time) string {
	if role == "admin" || subscriptionID == "" {
		return plan
	}
	if (status == "active" || status == "trialing") && !periodEnd.IsZero() && now.Before(periodEnd) {
		return plan
	}
	return "free"
}
