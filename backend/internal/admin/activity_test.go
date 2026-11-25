package admin

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"sneepcut/backend-go/internal/testdb"
)

const activityPath = "/api/admin/users/5f0c3c8e-8d7f-4f62-9a6f-2a7e3c1b9d02/activity"

func TestUserActivityRequiresAdmin(t *testing.T) {
	for _, role := range []string{"anonymous", "member", "viewer"} {
		t.Run(role, func(t *testing.T) {
			token, status := "", http.StatusUnauthorized
			if role != "anonymous" {
				token, status = routingToken(t, 0), http.StatusForbidden
			}
			// No database: an authorization bypass would reach it and fail.
			response := billingAdminRequest(billingAdminHTTP(t, nil, role, BillingConfiguration{}), activityPath, token)
			if response.Code != status {
				t.Fatalf("got %d, want %d: %s", response.Code, status, response.Body.String())
			}
		})
	}
}

func TestUserActivityRejectsInvalidID(t *testing.T) {
	response := billingAdminRequest(billingAdminHTTP(t, nil, "admin", BillingConfiguration{}), "/api/admin/users/not-a-uuid/activity", routingToken(t, 0))
	if response.Code != http.StatusBadRequest {
		t.Fatalf("got %d: %s", response.Code, response.Body.String())
	}
}

func TestUserActivityTimeline(t *testing.T) {
	db := testdb.Open(t)
	const userID = "5f0c3c8e-8d7f-4f62-9a6f-2a7e3c1b9d02"
	exec := func(query string, args ...any) {
		t.Helper()
		if _, err := db.Exec(query, args...); err != nil {
			t.Fatal(err)
		}
	}
	signedOut := time.Now().Add(-2 * time.Hour).UTC().Truncate(time.Second)
	exec(`INSERT INTO users(id,email,provider,credits,plan,created_at,last_active_at) VALUES($1,'activity@example.invalid','credentials',0,'free',now()-interval '3 days',$2)`, userID, signedOut)
	exec(`INSERT INTO account_security_events(user_id,event_type,detail,created_at) VALUES($1,'login','New sign-in recorded',now()-interval '2 days')`, userID)
	exec(`INSERT INTO jobs(id,user_id,source_type,status,progress,num_clips_requested,aspect_ratio,subtitle_style,include_brand,credits_charged,created_at,completed_at)
		VALUES('7a1c3c8e-8d7f-4f62-9a6f-2a7e3c1b9d02',$1,'upload','completed',100,3,'9:16','default',false,3,now()-interval '1 day',now()-interval '23 hours')`, userID)
	exec(`INSERT INTO user_feedback(user_id,kind,category,message,created_at) VALUES($1,'idea','other','A private message',now()-interval '1 hour')`, userID)
	// Triggers: a plan change and two quick preference saves (collapsed into one).
	exec(`UPDATE users SET plan='pro' WHERE id=$1`, userID)
	exec(`INSERT INTO account_preferences(user_id,theme) VALUES($1,'dark')`, userID)
	exec(`UPDATE account_preferences SET theme='light' WHERE user_id=$1`, userID)

	handler := billingAdminHTTP(t, db, "admin", BillingConfiguration{})
	token := routingToken(t, 0)
	first := decodeActivity(t, billingAdminRequest(handler, activityPath+"?pageSize=3", token).Body.Bytes())
	if first.Total != 7 || len(first.Items) != 3 {
		t.Fatalf("first page: total %d, %d items", first.Total, len(first.Items))
	}
	if first.LastActiveAt == nil || !first.LastActiveAt.Equal(signedOut) {
		t.Fatalf("last activity must survive sign-out: %v", first.LastActiveAt)
	}
	second := decodeActivity(t, billingAdminRequest(handler, activityPath+"?pageSize=3&page=3", token).Body.Bytes())
	kinds := []string{}
	for _, page := range []activityPage{first, decodeActivity(t, billingAdminRequest(handler, activityPath+"?pageSize=3&page=2", token).Body.Bytes()), second} {
		for _, item := range page.Items {
			kinds = append(kinds, item.Kind)
			if item.Kind == "plan_changed" && item.Detail != "free → pro" {
				t.Fatalf("plan detail: %q", item.Detail)
			}
			if item.Kind == "job_completed" && item.Detail != "upload" {
				t.Fatalf("job detail: %q", item.Detail)
			}
		}
	}
	want := map[string]bool{"preferences_updated": true, "plan_changed": true, "feedback_idea": true, "job_completed": true, "job_created": true, "security_login": true, "account_created": true}
	if len(kinds) != 7 || kinds[len(kinds)-1] != "account_created" {
		t.Fatalf("timeline order: %v", kinds)
	}
	for _, kind := range kinds {
		delete(want, kind)
	}
	if len(want) != 0 {
		t.Fatalf("missing kinds %v in %v", want, kinds)
	}
	raw := billingAdminRequest(handler, activityPath, token).Body.String()
	if strings.Contains(raw, "A private message") || strings.Contains(raw, "activity@example.invalid") {
		t.Fatal("activity must not expose content or personal data")
	}
	missing := billingAdminRequest(handler, "/api/admin/users/00000000-0000-4000-8000-000000000000/activity", token)
	if missing.Code != http.StatusNotFound {
		t.Fatalf("unknown user: %d", missing.Code)
	}
}

func decodeActivity(t *testing.T, body []byte) activityPage {
	t.Helper()
	var page activityPage
	if err := json.Unmarshal(body, &page); err != nil {
		t.Fatalf("decode %s: %v", body, err)
	}
	return page
}
