package account

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/julienschmidt/httprouter"
	"sneepcut/backend-go/internal/identity"
	"sneepcut/backend-go/internal/testdb"
)

func TestAdminAccountDeletionStillLimitsPasswordGuesses(t *testing.T) {
	db := testdb.Open(t)
	user := seedAccount(t, db)
	if _, err := db.Exec(`UPDATE users SET access_role='admin' WHERE id=$1`, user); err != nil {
		t.Fatal(err)
	}
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
	router := httprouter.New()
	New(db, auth, nil, nil, Config{}).Register(router)
	input := deletionInput(user)
	wrongPassword := "incorrect-password"
	input.CurrentPassword = &wrongPassword
	body, err := json.Marshal(input)
	if err != nil {
		t.Fatal(err)
	}
	for attempt := 0; attempt < 6; attempt++ {
		req := httptest.NewRequest("DELETE", "/api/user/data", strings.NewReader(string(body)))
		req.Header.Set("Authorization", "Bearer "+session.AccessToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		want := 403
		if attempt == 5 {
			want = 429
		}
		if w.Code != want {
			t.Fatalf("admin deletion attempt %d: %d %s", attempt+1, w.Code, w.Body.String())
		}
	}
	var pending bool
	if err := db.QueryRow(`SELECT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=$1)`, user).Scan(&pending); err != nil || pending {
		t.Fatalf("invalid password started account deletion: %v %v", pending, err)
	}
}
