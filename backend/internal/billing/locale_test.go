package billing

import "testing"

func TestBillingPathKeepsSpanishLocalePrefix(t *testing.T) {
	for locale, want := range map[string]string{"en": "/dashboard/billing", "ro": "/ro/dashboard/billing", "es": "/es/dashboard/billing"} {
		if got := billingPath(locale); got != want {
			t.Fatalf("billingPath(%q) = %q, want %q", locale, got, want)
		}
	}
}
