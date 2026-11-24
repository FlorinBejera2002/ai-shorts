package youtubechannel

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
)

const maxPageTokenLength = 512

// newVault builds the AES-GCM sealer used for grants and browser state. It
// shares the application's social token key, which must be 32 random bytes.
func newVault(key string) (cipher.AEAD, error) {
	raw, err := base64.StdEncoding.DecodeString(key)
	if err != nil || len(raw) != 32 {
		return nil, errors.New("YouTube channel encryption key must be base64 encoding of 32 random bytes")
	}
	block, err := aes.NewCipher(raw)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

// seal encrypts value and binds the ciphertext to purpose, so a credential
// cannot be moved to another user or reused as browser state.
func seal(vault cipher.AEAD, value any, purpose string) (string, error) {
	plain, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, vault.NonceSize())
	if _, err = rand.Read(nonce); err != nil {
		return "", err
	}
	return base64.RawStdEncoding.EncodeToString(vault.Seal(nonce, nonce, plain, []byte(purpose))), nil
}

func open(vault cipher.AEAD, encoded, purpose string, out any) error {
	raw, err := base64.RawStdEncoding.DecodeString(encoded)
	if err != nil || len(raw) < vault.NonceSize() {
		return errors.New("invalid YouTube channel sealed value")
	}
	plain, err := vault.Open(nil, raw[:vault.NonceSize()], raw[vault.NonceSize():], []byte(purpose))
	if err != nil {
		return errors.New("invalid YouTube channel sealed value")
	}
	return json.Unmarshal(plain, out)
}

func credentialPurpose(userID string) string {
	return "youtube-channel-credentials:" + userID
}

func randomSecret() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// validPageToken accepts the opaque tokens YouTube returns and nothing else.
func validPageToken(token string) bool {
	if len(token) > maxPageTokenLength {
		return false
	}
	for _, c := range token {
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '-' || c == '_') {
			return false
		}
	}
	return true
}
