package identity

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/sha256"
	"database/sql"
	"encoding/base32"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/lib/pq"
)

type MFASetup struct {
	Secret      string `json:"secret"`
	Provisioner string `json:"provisionerUri"`
}

func (a *Accounts) mfaCipher() (cipher.AEAD, error) {
	block, err := aes.NewCipher(a.securityKey[:])
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

func (a *Accounts) sealMFA(secret string) (string, error) {
	box, err := a.mfaCipher()
	if err != nil {
		return "", err
	}
	nonce := make([]byte, box.NonceSize())
	if _, err = rand.Read(nonce); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(box.Seal(nonce, nonce, []byte(secret), []byte("sneepcut-account-mfa"))), nil
}

func (a *Accounts) openMFA(encoded string) (string, error) {
	box, err := a.mfaCipher()
	if err != nil {
		return "", err
	}
	value, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil || len(value) < box.NonceSize() {
		return "", ErrUnauthenticated
	}
	plain, err := box.Open(nil, value[:box.NonceSize()], value[box.NonceSize():], []byte("sneepcut-account-mfa"))
	if err != nil {
		return "", ErrUnauthenticated
	}
	return string(plain), nil
}

func normalizeSecondFactor(code string) string {
	return strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(code), "-", ""))
}

func totpCode(secret string, at time.Time) (string, error) {
	key, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(strings.ToUpper(secret))
	if err != nil {
		return "", err
	}
	var counter [8]byte
	binary.BigEndian.PutUint64(counter[:], uint64(at.Unix()/30))
	mac := hmac.New(sha1.New, key)
	_, _ = mac.Write(counter[:])
	sum := mac.Sum(nil)
	offset := sum[len(sum)-1] & 0x0f
	value := (uint32(sum[offset])&0x7f)<<24 | uint32(sum[offset+1])<<16 | uint32(sum[offset+2])<<8 | uint32(sum[offset+3])
	return fmt.Sprintf("%06d", value%1000000), nil
}

func validTOTP(secret, candidate string, now time.Time) bool {
	candidate = normalizeSecondFactor(candidate)
	if len(candidate) != 6 {
		return false
	}
	for offset := -1; offset <= 1; offset++ {
		code, err := totpCode(secret, now.Add(time.Duration(offset)*30*time.Second))
		if err == nil && hmac.Equal([]byte(code), []byte(candidate)) {
			return true
		}
	}
	return false
}

func (a *Accounts) recoveryDigest(code string) string {
	mac := hmac.New(sha256.New, a.securityKey[:])
	_, _ = mac.Write([]byte(normalizeSecondFactor(code)))
	return hex.EncodeToString(mac.Sum(nil))
}

func (a *Accounts) newRecoveryCodes() ([]string, []string, error) {
	codes, hashes := make([]string, 10), make([]string, 10)
	for i := range codes {
		var raw [10]byte
		if _, err := rand.Read(raw[:]); err != nil {
			return nil, nil, err
		}
		compact := base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(raw[:])
		codes[i] = compact[:4] + "-" + compact[4:8] + "-" + compact[8:12] + "-" + compact[12:16]
		hashes[i] = a.recoveryDigest(codes[i])
	}
	return codes, hashes, nil
}

func (a *Accounts) BeginMFA(ctx context.Context, user User) (MFASetup, error) {
	if user.MFAEnabled {
		return MFASetup{}, invalid("Two-factor authentication is already enabled")
	}
	var raw [20]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return MFASetup{}, err
	}
	secret := base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(raw[:])
	sealed, err := a.sealMFA(secret)
	if err != nil {
		return MFASetup{}, err
	}
	result, err := a.db.ExecContext(ctx, `INSERT INTO account_mfa(user_id,secret_ciphertext,recovery_code_hashes,enabled,pending_expires_at,updated_at)
		VALUES($1,$2,'{}',false,now()+interval '10 minutes',now())
		ON CONFLICT(user_id) DO UPDATE SET secret_ciphertext=excluded.secret_ciphertext,recovery_code_hashes='{}',pending_expires_at=excluded.pending_expires_at,updated_at=now()
		WHERE NOT account_mfa.enabled`, user.ID, sealed)
	if err != nil {
		return MFASetup{}, err
	}
	if affected, rowsErr := result.RowsAffected(); rowsErr != nil || affected != 1 {
		return MFASetup{}, invalid("Two-factor authentication is already enabled")
	}
	issuer := url.QueryEscape("Sneepcut")
	label := url.PathEscape("Sneepcut:" + user.Email)
	return MFASetup{Secret: secret, Provisioner: "otpauth://totp/" + label + "?secret=" + secret + "&issuer=" + issuer + "&algorithm=SHA1&digits=6&period=30"}, nil
}

func (a *Accounts) EnableMFA(ctx context.Context, userID, currentSession, code string) ([]string, error) {
	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var sealed string
	err = tx.QueryRowContext(ctx, `SELECT secret_ciphertext FROM account_mfa WHERE user_id=$1 AND NOT enabled AND pending_expires_at>now() FOR UPDATE`, userID).Scan(&sealed)
	if err != nil {
		return nil, invalid("Start two-factor setup again")
	}
	secret, err := a.openMFA(sealed)
	if err != nil || !validTOTP(secret, code, time.Now()) {
		return nil, invalid("Verification code is invalid")
	}
	codes, hashes, err := a.newRecoveryCodes()
	if err != nil {
		return nil, err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE account_mfa SET enabled=true,recovery_code_hashes=$2,pending_expires_at=NULL,enabled_at=now(),updated_at=now() WHERE user_id=$1`, userID, pq.Array(hashes)); err != nil {
		return nil, err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE users SET mfa_enabled=true,updated_at=now() WHERE id=$1`, userID); err != nil {
		return nil, err
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM sessions WHERE user_id=$1 AND session_token<>$2`, userID, sessionKey(currentSession)); err != nil {
		return nil, err
	}
	_, _ = tx.ExecContext(ctx, `INSERT INTO account_security_events(user_id,event_type,detail) VALUES($1,'mfa_enabled','Two-factor authentication enabled')`, userID)
	return codes, tx.Commit()
}

func (a *Accounts) VerifySecondFactor(ctx context.Context, userID, code string) error {
	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var sealed string
	var hashes pq.StringArray
	err = tx.QueryRowContext(ctx, `SELECT secret_ciphertext,recovery_code_hashes FROM account_mfa WHERE user_id=$1 AND enabled FOR UPDATE`, userID).Scan(&sealed, &hashes)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrUnauthenticated
	}
	if err != nil {
		return err
	}
	secret, err := a.openMFA(sealed)
	if err != nil {
		return ErrUnauthenticated
	}
	if validTOTP(secret, code, time.Now()) {
		return tx.Commit()
	}
	digest := a.recoveryDigest(code)
	for index, hash := range hashes {
		if hmac.Equal([]byte(hash), []byte(digest)) {
			hashes = append(hashes[:index], hashes[index+1:]...)
			if _, err = tx.ExecContext(ctx, `UPDATE account_mfa SET recovery_code_hashes=$2,updated_at=now() WHERE user_id=$1`, userID, pq.Array(hashes)); err != nil {
				return err
			}
			return tx.Commit()
		}
	}
	return ErrUnauthenticated
}

func (a *Accounts) DisableMFA(ctx context.Context, userID, code string) error {
	if err := a.VerifySecondFactor(ctx, userID, code); err != nil {
		return invalid("Verification code is invalid")
	}
	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `DELETE FROM account_mfa WHERE user_id=$1`, userID); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE users SET mfa_enabled=false,updated_at=now() WHERE id=$1`, userID); err != nil {
		return err
	}
	_, _ = tx.ExecContext(ctx, `INSERT INTO account_security_events(user_id,event_type,detail) VALUES($1,'mfa_disabled','Two-factor authentication disabled')`, userID)
	return tx.Commit()
}

func (a *Accounts) RegenerateRecoveryCodes(ctx context.Context, userID, code string) ([]string, error) {
	if err := a.VerifySecondFactor(ctx, userID, code); err != nil {
		return nil, invalid("Verification code is invalid")
	}
	codes, hashes, err := a.newRecoveryCodes()
	if err != nil {
		return nil, err
	}
	_, err = a.db.ExecContext(ctx, `UPDATE account_mfa SET recovery_code_hashes=$2,updated_at=now() WHERE user_id=$1 AND enabled`, userID, pq.Array(hashes))
	return codes, err
}
