package identity

import (
	"strings"
	"testing"
	"time"

	"github.com/pascaldekloe/jwt"
)

func TestTokenValidationRejectsInvalidClaims(t *testing.T) {
	tokens := testTokens(t)
	identity, _ := tokens.newIdentity(testUser())
	valid, _, _ := tokens.issue(identity, accessToken)
	for _, test := range []struct {
		name   string
		change func(*jwt.Claims)
	}{
		{"missing expiry", func(c *jwt.Claims) { c.Expires = nil; delete(c.Set, "exp") }},
		{"expired", func(c *jwt.Claims) { c.Expires = jwt.NewNumericTime(time.Now().Add(-time.Minute)) }},
		{"future", func(c *jwt.Claims) { c.NotBefore = jwt.NewNumericTime(time.Now().Add(time.Hour)) }},
		{"issuer", func(c *jwt.Claims) { c.Issuer = "another-app" }},
		{"audience", func(c *jwt.Claims) { c.Audiences = []string{"another-client"} }},
		{"missing audience", func(c *jwt.Claims) { c.Audiences = nil; delete(c.Set, "aud") }},
		{"integer subject", func(c *jwt.Claims) { c.Subject = "42" }},
		{"missing purpose", func(c *jwt.Claims) { delete(c.Set, "token_use") }},
		{"fractional version", func(c *jwt.Claims) { c.Set["session_version"] = 1.5 }},
		{"missing version", func(c *jwt.Claims) { delete(c.Set, "session_version") }},
		{"missing session", func(c *jwt.Claims) { delete(c.Set, "session_id") }},
		{"future sign-in", func(c *jwt.Claims) { c.Set["auth_time"] = time.Now().Add(time.Hour).Unix() }},
	} {
		t.Run(test.name, func(t *testing.T) {
			claims, err := tokens.key.Check([]byte(valid))
			if err != nil {
				t.Fatal(err)
			}
			test.change(claims)
			invalid, err := tokens.key.Sign(claims)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := tokens.verify(string(invalid), accessToken); err != ErrUnauthenticated {
				t.Fatalf("accepted: %v", err)
			}
		})
	}
	claims, _ := tokens.key.Check([]byte(valid))
	wrongAlgorithm, _ := claims.HMACSign(jwt.HS512, []byte(tokens.config.Secret))
	if _, err := tokens.verify(string(wrongAlgorithm), accessToken); err != ErrUnauthenticated {
		t.Fatal("wrong algorithm accepted")
	}
	parts := strings.Split(valid, ".")
	parts[1] = "e30"
	if _, err := tokens.verify(strings.Join(parts, "."), accessToken); err != ErrUnauthenticated {
		t.Fatal("tampering accepted")
	}
}

func TestRefreshKeepsOriginalAuthenticationTime(t *testing.T) {
	tokens := testTokens(t)
	now := time.Now().UTC().Truncate(time.Second)
	tokens.now = func() time.Time { return now }
	identity, _ := tokens.newIdentity(testUser())
	refresh, _, _ := tokens.issue(identity, refreshToken)
	now = now.Add(20 * time.Minute)
	verified, err := tokens.verify(refresh, refreshToken)
	if err != nil {
		t.Fatal(err)
	}
	access, _, _ := tokens.issue(verified, accessToken)
	current, err := tokens.verify(access, accessToken)
	if err != nil {
		t.Fatal(err)
	}
	if current.AuthenticatedAt != identity.AuthenticatedAt {
		t.Fatal("refresh extended recent authentication")
	}
}

func TestTokenLifetimes(t *testing.T) {
	tokens := testTokens(t)
	now := time.Now().UTC().Truncate(time.Second)
	tokens.now = func() time.Time { return now }
	identity, _ := tokens.newIdentity(testUser())
	access, _, _ := tokens.issue(identity, accessToken)
	refresh, _, _ := tokens.issue(identity, refreshToken)
	now = now.Add(15 * time.Minute)
	if _, err := tokens.verify(access, accessToken); err != ErrUnauthenticated {
		t.Fatal("expired access accepted")
	}
	if _, err := tokens.verify(refresh, refreshToken); err != nil {
		t.Fatal("refresh expired with access")
	}
	now = now.Add(30 * 24 * time.Hour)
	if _, err := tokens.verify(refresh, refreshToken); err != ErrUnauthenticated {
		t.Fatal("expired refresh accepted")
	}
}
