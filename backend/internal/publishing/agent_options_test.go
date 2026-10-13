package publishing

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/data"
)

func TestAgentOptionsUsesOwnedLiveCreatorSettingsAndSafeFailures(t *testing.T) {
	h, user, _, instagram := fixture(t)
	account := expiredTikTokAccount(t, h, user)
	creatorCalls := 0
	reject := false
	h.client = mockProvider(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v2/oauth/token/":
			_, _ = w.Write([]byte(`{"access_token":"renewed-access","refresh_token":"rotated-refresh","expires_in":86400}`))
		case "/v2/post/publish/creator_info/query/":
			creatorCalls++
			if r.Header.Get("Authorization") != "Bearer renewed-access" {
				t.Error("creator options did not use refreshed credentials")
			}
			if reject {
				_, _ = w.Write([]byte(`{"error":{"code":"creator_validation_failed","message":"provider-private-details"}}`))
				return
			}
			_, _ = w.Write([]byte(`{"data":{"privacy_level_options":["SELF_ONLY"],"comment_disabled":true,"duet_disabled":true,"stitch_disabled":false,"max_video_post_duration_sec":60,"creator_nickname":"Synthetic creator"}}`))
		default:
			t.Errorf("unexpected provider call: %s", r.URL.Path)
			w.WriteHeader(http.StatusNotFound)
		}
	})
	other, _ := data.NewUUID()
	if _, err := h.AgentOptions(context.Background(), other, account); err == nil {
		t.Fatal("foreign account exposed options")
	}
	if _, err := h.AgentOptions(context.Background(), user, instagram); err == nil {
		t.Fatal("non-TikTok options accepted")
	}
	if creatorCalls != 0 {
		t.Fatal("unauthorized request reached provider")
	}
	actual, err := h.AgentOptions(context.Background(), user, account)
	if err != nil || len(actual.PrivacyLevels) != 1 || actual.PrivacyLevels[0] != "SELF_ONLY" || !actual.CommentDisabled || !actual.DuetDisabled || actual.MaxDuration != 60 {
		t.Fatalf("live creator settings mismatch: %+v %v", actual, err)
	}
	raw, _ := json.Marshal(actual)
	if strings.Contains(string(raw), "access") || strings.Contains(string(raw), "refresh") {
		t.Fatal("credentials exposed in options")
	}
	assertRotatedTikTokCredentials(t, h, user, account)
	reject = true
	if _, err = h.AgentOptions(context.Background(), user, account); err == nil || strings.Contains(err.Error(), "private-details") || !strings.Contains(err.Error(), "Reconnect") {
		t.Fatalf("unsafe provider error: %v", err)
	}
	h.cfg.Enabled = false
	_, err = h.AgentOptions(context.Background(), user, account)
	if err == nil || err.Error() != "Provider unavailable." || creatorCalls != 2 {
		t.Fatalf("disabled provider used: calls=%d err=%v", creatorCalls, err)
	}
}
