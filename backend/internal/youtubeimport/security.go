package youtubeimport

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
)

func randomSecret() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func secretDigest(s string) string {
	b := sha256.Sum256([]byte(s))
	return hex.EncodeToString(b[:])
}

func newVault(key string) (cipher.AEAD, error) {
	b, err := base64.StdEncoding.DecodeString(key)
	if err != nil || len(b) != 32 {
		return nil, errors.New("YouTube import encryption key must be base64 encoding of 32 random bytes")
	}
	block, err := aes.NewCipher(b)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

// The import and owner are authenticated with the ciphertext. A token cannot be
// moved to another user's import even if a database record is modified.
func encryptToken(vault cipher.AEAD, token Token, owner string) (string, error) {
	plain, err := json.Marshal(token)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, vault.NonceSize())
	if _, err = rand.Read(nonce); err != nil {
		return "", err
	}
	return base64.RawStdEncoding.EncodeToString(vault.Seal(nonce, nonce, plain, []byte("youtube-import:"+owner))), nil
}

func decryptToken(vault cipher.AEAD, value, owner string) (Token, error) {
	var token Token
	b, err := base64.RawStdEncoding.DecodeString(value)
	if err != nil || len(b) < vault.NonceSize() {
		return token, errors.New("invalid YouTube import credentials")
	}
	plain, err := vault.Open(nil, b[:vault.NonceSize()], b[vault.NonceSize():], []byte("youtube-import:"+owner))
	if err != nil {
		return token, errors.New("invalid YouTube import credentials")
	}
	err = json.Unmarshal(plain, &token)
	return token, err
}
