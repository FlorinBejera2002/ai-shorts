package identity

import (
	"context"
	"database/sql"
	"errors"
	"golang.org/x/crypto/bcrypt"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"
)

type captureMail struct {
	mu       sync.Mutex
	messages []Mail
	fail     bool
}

func (m *captureMail) Send(ctx context.Context, v Mail) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.messages = append(m.messages, v)
	if m.fail {
		return errors.New("unavailable")
	}
	return nil
}
func (m *captureMail) token(t *testing.T) string {
	t.Helper()
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, line := range strings.Split(m.messages[len(m.messages)-1].Text, "\n") {
		if strings.HasPrefix(line, "https://") {
			u, e := url.Parse(line)
			if e != nil {
				t.Fatal(e)
			}
			return u.Query().Get("token")
		}
	}
	t.Fatal("missing token")
	return ""
}
func TestAccountLifecyclePostgres(t *testing.T) {
	db := migratedPostgres(t)
	ctx := context.Background()
	mail := &captureMail{}
	a := NewAccounts(db, AccountsConfig{AppURL: "https://app.example.invalid", RequireVerification: true, InitialCredits: 100}, mail)
	password := "OriginalGoodPass12!"
	u, err := a.Register(ctx, Registration{Email: "  OWNER@Example.invalid ", Name: " Owner ", Password: password})
	if err != nil {
		t.Fatal(err)
	}
	if !u.ActivationRequired || u.Credits != 100 || u.Email != "owner@example.invalid" {
		t.Fatalf("registration %+v", u)
	}
	service := NewService(NewPostgres(db), testTokens(t))
	if _, _, _, err = service.Login(ctx, u.Email, password); err == nil {
		t.Fatal("unverified login accepted")
	}
	if err = a.RequestToken(ctx, u.Email, "email-activation"); err != nil {
		t.Fatal(err)
	}
	token := mail.token(t)
	var saved string
	if err = db.QueryRow(`SELECT token FROM verification_tokens WHERE identifier=$1`, "email-activation:"+u.Email).Scan(&saved); err != nil || saved == token {
		t.Fatal("token must be hashed", err)
	}
	if err = a.ConsumeToken(ctx, u.Email, token, "", "email-activation"); err != nil {
		t.Fatal(err)
	}
	if err = a.ConsumeToken(ctx, u.Email, token, "", "email-activation"); err == nil {
		t.Fatal("token replay accepted")
	}
	response, refresh, _, err := service.Login(ctx, u.Email, password)
	if err != nil {
		t.Fatal(err)
	}
	if err = a.RequestToken(ctx, u.Email, "password-reset"); err != nil {
		t.Fatal(err)
	}
	old := mail.token(t)
	if err = a.RequestToken(ctx, u.Email, "password-reset"); err != nil {
		t.Fatal(err)
	}
	token = mail.token(t)
	if err = a.ConsumeToken(ctx, u.Email, old, "NewPasswordGood42!", "password-reset"); err == nil {
		t.Fatal("replaced token accepted")
	}
	if err = a.ConsumeToken(ctx, "another@example.invalid", token, "NewPasswordGood42!", "password-reset"); err == nil {
		t.Fatal("wrong email accepted")
	}
	if err = a.ConsumeToken(ctx, "", token, "NewPasswordGood42!", "password-reset"); err != nil {
		t.Fatal(err)
	}
	if _, err = service.CurrentUser(ctx, response.AccessToken); err == nil {
		t.Fatal("old access accepted")
	}
	if _, err = service.Refresh(ctx, refresh); err == nil {
		t.Fatal("old refresh accepted")
	}
	if _, _, _, err = service.Login(ctx, u.Email, password); err == nil {
		t.Fatal("old password accepted")
	}
	response, _, _, err = service.Login(ctx, u.Email, "NewPasswordGood42!")
	if err != nil {
		t.Fatal(err)
	}
	fresh, err := NewPostgres(db).FindByEmail(ctx, u.Email)
	if err != nil {
		t.Fatal(err)
	}
	if err = a.ChangePassword(ctx, fresh, "NewPasswordGood42!", "NextPasswordGood42!", "NextPasswordGood42!"); err != nil {
		t.Fatal(err)
	}
	if _, err = service.CurrentUser(ctx, response.AccessToken); err == nil {
		t.Fatal("password change did not revoke access")
	}
	mail.fail = true
	if err = a.RequestToken(ctx, u.Email, "password-reset"); err != nil {
		t.Fatal(err)
	}
	if err = db.QueryRow(`SELECT token FROM verification_tokens WHERE identifier=$1`, "password-reset:"+u.Email).Scan(&saved); !errors.Is(err, sql.ErrNoRows) {
		t.Fatal("failed delivery left usable token", err)
	}
}
func TestGoogleAccountLinkingPostgres(t *testing.T) {
	db := migratedPostgres(t)
	a := NewAccounts(db, AccountsConfig{InitialCredits: 100}, nil)
	ctx := context.Background()
	info := GoogleUserInfo{Sub: "google-1", Email: "google@example.invalid", EmailVerified: true, Name: "Google Name", Picture: "https://example.invalid/avatar.png"}
	u, err := a.GoogleUser(ctx, info)
	if err != nil {
		t.Fatal(err)
	}
	again, err := a.GoogleUser(ctx, info)
	if err != nil || again.ID != u.ID {
		t.Fatal("Google identity changed", err)
	}
	credentials, err := a.Register(ctx, Registration{Email: "credential@example.invalid", Password: "OriginalPassword42!"})
	if err != nil {
		t.Fatal(err)
	}
	info.Email = credentials.Email
	info.Sub = "new-provider-identity"
	if _, err = a.GoogleUser(ctx, info); err == nil {
		t.Fatal("unsafe automatic email linking")
	}
	info.Email = "unverified@example.invalid"
	info.EmailVerified = false
	if _, err = a.GoogleUser(ctx, info); err == nil {
		t.Fatal("unverified email accepted")
	}
	if !strings.HasPrefix(safeReturnPath("//evil.invalid"), "/dashboard") {
		t.Fatal("unsafe redirect")
	}
}
func TestPasswordValidation(t *testing.T) {
	for _, p := range []string{"short", "NoNumberOrSpecialLong", strings.Repeat("A", 73) + "a1!"} {
		if PasswordError(p) == nil {
			t.Fatal("weak password accepted")
		}
	}
	if PasswordError("StrongPassword42!") != nil {
		t.Fatal("valid password rejected")
	}
	hash, _ := bcrypt.GenerateFromPassword([]byte("StrongPassword42!"), bcrypt.MinCost)
	if bcrypt.CompareHashAndPassword(hash, []byte("StrongPassword42!")) != nil {
		t.Fatal("hash incompatible")
	}
}
func TestOAuthStateAuthentication(t *testing.T) {
	h := NewHandler(NewService(&memoryRepository{user: testUser(), sessions: map[string]time.Time{}}, testTokens(t)), HTTPConfig{}, nil)
	raw, err := h.signState(oauthState{State: strings.Repeat("a", 64), Verifier: strings.Repeat("b", 64), Expires: time.Now().Add(time.Minute).Unix()})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = h.readState(raw); err != nil {
		t.Fatal(err)
	}
	if _, err = h.readState(raw + "x"); err == nil {
		t.Fatal("tampered state accepted")
	}
	expired, _ := h.signState(oauthState{State: strings.Repeat("a", 64), Verifier: strings.Repeat("b", 64), Expires: 1})
	if _, err = h.readState(expired); err == nil {
		t.Fatal("expired state accepted")
	}
}

type canceledDelivery struct{ cancel context.CancelFunc }

func (m canceledDelivery) Send(context.Context, Mail) error {
	m.cancel()
	return context.Canceled
}

func TestCanceledDeliveryRevokesTokenPostgres(t *testing.T) {
	db := migratedPostgres(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	accounts := NewAccounts(db, AccountsConfig{AppURL: "https://app.example.invalid"}, canceledDelivery{cancel: cancel})
	_, err := accounts.Register(ctx, Registration{Email: "canceled-delivery@example.invalid", Password: "SyntheticPassword42!"})
	if err != nil {
		t.Fatal(err)
	}
	if err = accounts.RequestToken(ctx, "canceled-delivery@example.invalid", "password-reset"); err != nil {
		t.Fatal("delivery cancellation prevented token cleanup", err)
	}
	if !errors.Is(ctx.Err(), context.Canceled) {
		t.Fatal("fixture did not cancel the request during delivery")
	}
	var count int
	if err = db.QueryRow(`SELECT count(*) FROM verification_tokens WHERE identifier='password-reset:canceled-delivery@example.invalid'`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatal("failed delivery left a usable reset token after request cancellation")
	}
}
