package identity

import (
	"context"
	"testing"
	"time"
)

type secondFactorStub struct {
	want  string
	calls int
}

func (s *secondFactorStub) VerifySecondFactor(_ context.Context, _ string, code string) error {
	s.calls++
	if code != s.want {
		return ErrUnauthenticated
	}
	return nil
}

func TestTOTPMatchesRFC6238CompatibleWindow(t *testing.T) {
	secret := "JBSWY3DPEHPK3PXP"
	at := time.Unix(1_700_000_000, 0)
	code, err := totpCode(secret, at)
	if err != nil {
		t.Fatal(err)
	}
	if !validTOTP(secret, code, at) || !validTOTP(secret, code, at.Add(30*time.Second)) {
		t.Fatal("valid code was rejected inside the allowed clock-skew window")
	}
	if validTOTP(secret, "0000000", at) || validTOTP("not-base32", code, at) {
		t.Fatal("invalid code or secret was accepted")
	}
}

func TestMFASecretsAndRecoveryCodesAreProtected(t *testing.T) {
	accounts := NewAccounts(nil, AccountsConfig{SecurityKey: "test-only-key"}, nil)
	sealed, err := accounts.sealMFA("SECRET")
	if err != nil {
		t.Fatal(err)
	}
	if sealed == "SECRET" {
		t.Fatal("MFA secret was stored in plaintext")
	}
	opened, err := accounts.openMFA(sealed)
	if err != nil || opened != "SECRET" {
		t.Fatalf("secret round trip failed: %q %v", opened, err)
	}
	codes, hashes, err := accounts.newRecoveryCodes()
	if err != nil || len(codes) != 10 || len(hashes) != 10 {
		t.Fatalf("unexpected recovery codes: %d %d %v", len(codes), len(hashes), err)
	}
	seen := map[string]bool{}
	for index, code := range codes {
		if seen[code] || code == hashes[index] || accounts.recoveryDigest(code) != hashes[index] {
			t.Fatal("recovery codes are not unique and securely digested")
		}
		seen[code] = true
	}
}

func TestLoginRequiresConfiguredSecondFactor(t *testing.T) {
	repository := &memoryRepository{user: testUser(), sessions: make(map[string]time.Time)}
	repository.user.MFAEnabled = true
	service := NewService(repository, testTokens(t))
	verifier := &secondFactorStub{want: "123456"}
	service.SetSecondFactor(verifier)

	if _, _, _, err := service.Login(context.Background(), repository.user.Email, testPassword); err != ErrSecondFactorRequired {
		t.Fatalf("missing factor: %v", err)
	}
	if _, _, _, err := service.Login(context.Background(), repository.user.Email, testPassword, "wrong"); err != ErrUnauthenticated {
		t.Fatalf("invalid factor: %v", err)
	}
	if _, _, _, err := service.Login(context.Background(), repository.user.Email, testPassword, "123456"); err != nil {
		t.Fatalf("valid factor: %v", err)
	}
	if verifier.calls != 2 || len(repository.sessions) != 1 {
		t.Fatalf("unexpected verification/session count: %d %d", verifier.calls, len(repository.sessions))
	}
}
