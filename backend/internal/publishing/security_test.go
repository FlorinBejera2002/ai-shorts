package publishing

import (
	"encoding/base64"
	"strings"
	"testing"
)

func TestCredentialEncryptionBoundToOwner(t *testing.T) {
	a, e := newCipher(base64.StdEncoding.EncodeToString(make([]byte, 32)))
	if e != nil {
		t.Fatal(e)
	}
	token := Credentials{AccessToken: "synthetic-secret"}
	encrypted, e := seal(a, token, "user:provider:account")
	if e != nil {
		t.Fatal(e)
	}
	if strings.Contains(encrypted, token.AccessToken) {
		t.Fatal("plaintext token")
	}
	var decoded Credentials
	if e = unseal(a, encrypted, "another-user", &decoded); e == nil {
		t.Fatal("cross-owner decryption accepted")
	}
	if e = unseal(a, encrypted, "user:provider:account", &decoded); e != nil || decoded.AccessToken != token.AccessToken {
		t.Fatal("roundtrip failed")
	}
	if _, e = newCipher("short"); e == nil {
		t.Fatal("weak key accepted")
	}
}
func TestPublishingInputRequiresConfirmationAndUniqueDestinations(t *testing.T) {
	in := postInput{ClipID: "00000000-0000-4000-8000-000000000001", AccountIDs: []string{"00000000-0000-4000-8000-000000000002"}, IdempotencyKey: "00000000-0000-4000-8000-000000000003"}
	if validateInput(&in) {
		t.Fatal("unconfirmed")
	}
	in.Confirmed = true
	if !validateInput(&in) {
		t.Fatal("valid input rejected")
	}
	in.AccountIDs = append(in.AccountIDs, in.AccountIDs[0])
	if validateInput(&in) {
		t.Fatal("duplicate accepted")
	}
}

func TestPublishingCaptionLimitUsesUTF16CodeUnits(t *testing.T) {
	in := postInput{
		ClipID:         "00000000-0000-4000-8000-000000000001",
		AccountIDs:     []string{"00000000-0000-4000-8000-000000000002"},
		IdempotencyKey: "00000000-0000-4000-8000-000000000003",
		Confirmed:      true,
		Caption:        strings.Repeat("a", 2198) + "🎬",
	}
	if !validateInput(&in) {
		t.Fatal("2200 UTF-16 code units were rejected")
	}
	in.Caption += "a"
	if validateInput(&in) {
		t.Fatal("caption over 2200 UTF-16 code units was accepted")
	}
}
