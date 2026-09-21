package publishing

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"testing"
)

func TestTikTokOptionsFailureDistinguishesTemporaryQuotaFromReconnect(t *testing.T) {
	for _, providerErr := range []error{errTikTokCreatorTemporarilyUnavailable, fmt.Errorf("provider request: %w", errTikTokCreatorTemporarilyUnavailable)} {
		status, message := tiktokOptionsFailure(providerErr)
		if status != http.StatusTooManyRequests || !strings.Contains(message, "Try again later") || strings.Contains(strings.ToLower(message), "reconnect") {
			t.Fatalf("temporary quota response mismatch: status=%d message=%q", status, message)
		}
	}

	status, message := tiktokOptionsFailure(errors.New("provider authorization failed with secret details"))
	if status != http.StatusConflict || !strings.Contains(strings.ToLower(message), "reconnect") || strings.Contains(message, "secret details") {
		t.Fatalf("reconnect response mismatch: status=%d message=%q", status, message)
	}
}

func TestPublishingReturnURLUsesTheFrontendLocaleRoutes(t *testing.T) {
	tests := []struct {
		locale string
		want   string
	}{
		{locale: "en", want: "https://sneepcut.com/dashboard/publish?connected=tiktok"},
		{locale: "ro", want: "https://sneepcut.com/ro/dashboard/publish?connected=tiktok"},
	}
	for _, test := range tests {
		if got := publishingReturnURL("https://sneepcut.com/", test.locale, "connected", "tiktok"); got != test.want {
			t.Fatalf("locale %s returned %q, want %q", test.locale, got, test.want)
		}
	}
}
