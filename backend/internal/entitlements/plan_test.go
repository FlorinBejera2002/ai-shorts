package entitlements

import (
	"testing"
	"time"
)

func TestEffectivePlanRequiresCurrentVerifiedStripeCoverage(t *testing.T) {
	now := time.Date(2026, 10, 21, 12, 0, 0, 0, time.UTC)
	for _, tc := range []struct {
		name, role, subscription, status string
		end                              time.Time
		want                             string
	}{
		{"current paid period", "member", "sub_paid", "active", now.Add(time.Hour), "agency"},
		{"legacy trial still current", "member", "sub_trial", "trialing", now.Add(time.Hour), "agency"},
		{"lost cancellation callback", "member", "sub_expired", "active", now.Add(-time.Second), "free"},
		{"exact period boundary", "member", "sub_boundary", "active", now, "free"},
		{"unverified period", "member", "sub_missing", "active", time.Time{}, "free"},
		{"failed payment before period end", "member", "sub_failed", "past_due", now.Add(time.Hour), "free"},
		{"manual grant", "member", "", "", time.Time{}, "agency"},
		{"admin independent access", "admin", "sub_expired", "canceled", now.Add(-time.Hour), "agency"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := EffectivePlan("agency", tc.role, tc.subscription, tc.status, tc.end, now); got != tc.want {
				t.Fatalf("effective plan %q, want %q", got, tc.want)
			}
		})
	}
}
