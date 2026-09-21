package publishing

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/netip"
	"net/url"
	"strings"
)

func randomToken() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(b)
}
func digest(s string) string { b := sha256.Sum256([]byte(s)); return hex.EncodeToString(b[:]) }
func pkceChallenge(verifier string) string {
	b := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(b[:])
}
func newCipher(key string) (cipher.AEAD, error) {
	b, err := base64.StdEncoding.DecodeString(key)
	if err != nil || len(b) != 32 {
		return nil, errors.New("SOCIAL_TOKEN_ENCRYPTION_KEY must be base64 encoding of 32 random bytes")
	}
	block, err := aes.NewCipher(b)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}
func seal(a cipher.AEAD, value any, owner string) (string, error) {
	raw, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, a.NonceSize())
	if _, err = rand.Read(nonce); err != nil {
		return "", err
	}
	return base64.RawStdEncoding.EncodeToString(a.Seal(nonce, nonce, raw, []byte(owner))), nil
}
func unseal(a cipher.AEAD, value, owner string, out any) error {
	raw, err := base64.RawStdEncoding.DecodeString(value)
	if err != nil || len(raw) < a.NonceSize() {
		return errors.New("invalid encrypted credentials")
	}
	plain, err := a.Open(nil, raw[:a.NonceSize()], raw[a.NonceSize():], []byte(owner))
	if err != nil {
		return err
	}
	return json.Unmarshal(plain, out)
}
func publicHTTPS(raw string) bool {
	u, e := url.Parse(raw)
	if e != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil || u.Fragment != "" {
		return false
	}
	host := strings.ToLower(u.Hostname())
	if host == "localhost" || !strings.Contains(host, ".") || strings.HasSuffix(host, ".localhost") || strings.HasSuffix(host, ".local") {
		return false
	}
	if ip, err := netip.ParseAddr(host); err == nil && (ip.IsPrivate() || ip.IsLoopback() || ip.IsUnspecified() || ip.IsLinkLocalUnicast() || ip.IsMulticast()) {
		return false
	}
	return true
}
