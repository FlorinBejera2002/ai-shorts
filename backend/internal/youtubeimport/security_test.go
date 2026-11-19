package youtubeimport

import (
	"encoding/base64"
	"strings"
	"testing"
	"time"
)

func TestCredentialsAreBoundToUserAndImport(t *testing.T) {
	vault, err := newVault(base64.StdEncoding.EncodeToString(make([]byte, 32)))
	if err != nil {
		t.Fatal(err)
	}
	token := Token{AccessToken: "sensitive-access", RefreshToken: "sensitive-refresh", ExpiresAt: time.Now().Add(time.Hour)}
	encrypted, err := encryptToken(vault, token, "user-one:import-one")
	if err != nil || strings.Contains(encrypted, token.AccessToken) || strings.Contains(encrypted, token.RefreshToken) {
		t.Fatal("credentials must be encrypted")
	}
	decoded, err := decryptToken(vault, encrypted, "user-one:import-one")
	if err != nil || decoded.AccessToken != token.AccessToken || decoded.RefreshToken != token.RefreshToken {
		t.Fatal("credential round trip failed")
	}
	for _, owner := range []string{"user-two:import-one", "user-one:import-two"} {
		if _, err := decryptToken(vault, encrypted, owner); err == nil {
			t.Fatalf("credentials could be moved to %s", owner)
		}
	}
	if _, err := decryptToken(vault, encrypted[:len(encrypted)-2]+"xx", "user-one:import-one"); err == nil {
		t.Fatal("modified credentials were accepted")
	}
}

func TestVisibilityConsentNeverExpandsPermissions(t *testing.T) {
	for _, input := range [][]string{nil, {}, {"public", "public"}, {"all"}, {"public", "private", "unlisted", "public"}} {
		if _, err := requestedResources(input); err == nil {
			t.Fatalf("accepted invalid visibility choice %v", input)
		}
	}
	resources, err := requestedResources([]string{"public", "unlisted"})
	if err != nil || len(resources) != 2 || resources[0] != PublicVideos || resources[1] != UnlistedVideos {
		t.Fatal("visibility choices changed")
	}
	granted := GrantedResources(scopePrefix+PublicVideos+" "+scopePrefix+PrivateVideos, resources)
	if len(granted) != 1 || granted[0] != PublicVideos {
		t.Fatal("partial consent expanded the requested resource set")
	}
}

func TestReturnLocationDoesNotAcceptAnExternalRedirect(t *testing.T) {
	for _, locale := range []string{"https://outside.invalid", "//outside.invalid", "/ro/../../", "en"} {
		if actual := returnURL("https://sneepcut.example.invalid", locale, "success"); actual != "https://sneepcut.example.invalid/dashboard/create?mode=youtube&youtubeImport=success" {
			t.Fatalf("unexpected callback location %q", actual)
		}
	}
}
