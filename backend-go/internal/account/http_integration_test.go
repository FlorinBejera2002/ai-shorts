package account

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/julienschmidt/httprouter"
	"sneepcut/backend-go/internal/billing"
	"sneepcut/backend-go/internal/identity"
	"sneepcut/backend-go/internal/testdb"
)

func TestPostgresAuthenticatedSettingsAndDeletionRetryHTTP(t *testing.T) {
	db := testdb.Open(t)
	user := seedAccount(t, db)
	tokens, err := identity.NewTokens(identity.TokenConfig{Secret: strings.Repeat("x", 40), Issuer: "test", Audience: "test", AccessLifetime: time.Minute, RefreshLifetime: time.Hour})
	if err != nil {
		t.Fatal(err)
	}
	service := identity.NewService(identity.NewPostgres(db), tokens)
	session, _, _, err := service.Login(context.Background(), user+"@example.invalid", testPassword)
	if err != nil {
		t.Fatal(err)
	}
	auth := identity.NewHandler(service, identity.HTTPConfig{}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	provider := &fakeBilling{db: db, err: &billing.Error{Status: 409, Code: "checkout_reconciliation_pending", RetryAfterSeconds: 12}}
	r := httprouter.New()
	New(db, auth, &fakeCleanup{}, provider, Config{}).Register(r)
	call := func(method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+session.AccessToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}
	w := call("PATCH", "/api/user/profile", `{"name":"  Ana   Maria  "}`)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"name":"Ana Maria"`) {
		t.Fatal(w.Code, w.Body.String())
	}
	w = call("GET", "/api/user/credits", "")
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"credits":100`) {
		t.Fatal(w.Code, w.Body.String())
	}
	w = call("GET", "/api/user/data", "")
	if w.Code != 200 || !strings.Contains(w.Header().Get("Content-Disposition"), "sneepcut-data-export.json") || strings.Contains(w.Body.String(), testHash) {
		t.Fatal(w.Code, w.Body.String())
	}
	input, _ := json.Marshal(deletionInput(user))
	w = call("DELETE", "/api/user/data", string(input))
	if w.Code != 409 || w.Header().Get("Retry-After") != "12" || !strings.Contains(w.Body.String(), "checkout_reconciliation_pending") {
		t.Fatal(w.Code, w.Header(), w.Body.String())
	}
	w = call("GET", "/api/user/profile", "")
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"deletionPending":true`) {
		t.Fatal("settings unavailable for retry", w.Code, w.Body.String())
	}
	w = call("GET", "/api/user/credits", "")
	if w.Code == 200 {
		t.Fatal("frozen account accepted ordinary feature requests")
	}
	w = call("GET", "/api/user/data", "")
	if w.Code != 200 {
		t.Fatal("owner cannot export while deletion is pending", w.Code)
	}
	provider.err = nil
	w = call("DELETE", "/api/user/data", string(input))
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"deleted":true`) {
		t.Fatal(w.Code, w.Body.String())
	}
	w = call("GET", "/api/user/profile", "")
	if w.Code != 401 {
		t.Fatal("deleted sessions remain usable", w.Code)
	}
}

func TestPostgresAccountUsesNativeBillingCancellationBeforeFinalization(t *testing.T) {
	db := testdb.Open(t)
	user := seedAccount(t, db)
	if _, err := db.Exec(`UPDATE users SET plan='pro',stripe_customer_id='cus_fixture',stripe_subscription_id='sub_fixture',stripe_subscription_status='active' WHERE id=$1`, user); err != nil {
		t.Fatal(err)
	}
	calls := 0
	stripe := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.Method != "DELETE" || r.URL.Path != "/customers/cus_fixture" {
			t.Errorf("unexpected provider operation %s %s", r.Method, r.URL.Path)
			w.WriteHeader(500)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"cus_fixture","deleted":true}`))
	}))
	defer stripe.Close()
	provider, err := billing.NewService(billing.Config{SecretKey: "sk_test_fixture", APIBaseURL: stripe.URL, AppURL: "https://app.example.invalid"}, db, nil)
	if err != nil {
		t.Fatal(err)
	}
	cleanup := &fakeCleanup{run: func(ctx context.Context, id string) {
		var done bool
		if err := db.QueryRowContext(ctx, `SELECT billing_cancellation_completed FROM account_deletion_requests WHERE user_id=$1`, id).Scan(&done); err != nil || !done {
			t.Error("media cleanup preceded billing checkpoint", err)
		}
	}}
	h := New(db, passAuth{}, cleanup, provider, Config{})
	if err = h.deleteAccount(context.Background(), user, 1, deletionInput(user)); err != nil {
		t.Fatal(err)
	}
	if calls != 1 {
		t.Fatal("provider cancellation count", calls)
	}
	if done, _ := h.finished(context.Background(), user); !done {
		t.Fatal("account finalization incomplete")
	}
}
