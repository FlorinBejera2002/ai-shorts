package identity

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"
	"sneepcut/backend-go/internal/data"
)

type AccountError struct {
	Status  int
	Message string
}

func (e *AccountError) Error() string { return e.Message }
func invalid(message string) error    { return &AccountError{http.StatusBadRequest, message} }

type Mail struct{ To, Subject, Text, Key string }
type Mailer interface {
	Send(context.Context, Mail) error
}
type AccountsConfig struct {
	AppURL              string
	RequireVerification bool
	InitialCredits      int
	SecurityKey         string
}
type Accounts struct {
	db          *sql.DB
	config      AccountsConfig
	mailer      Mailer
	securityKey [32]byte
}

func NewAccounts(db *sql.DB, cfg AccountsConfig, mailer Mailer) *Accounts {
	return &Accounts{db: db, config: cfg, mailer: mailer, securityKey: sha256.Sum256([]byte("sneepcut-mfa:" + cfg.SecurityKey))}
}
func (h *Handler) SetAccounts(accounts *Accounts) { h.accounts = accounts }

var emailPattern = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)
var upperPattern = regexp.MustCompile(`[A-Z]`)
var lowerPattern = regexp.MustCompile(`[a-z]`)
var digitPattern = regexp.MustCompile(`[0-9]`)
var specialPattern = regexp.MustCompile("[!@#$%^&*()_+\\-=\\[\\]{};':\"\\\\|,.<>/?]")

func ValidEmail(email string) bool { return len(email) <= 255 && emailPattern.MatchString(email) }
func PasswordError(password string) error {
	if utf8.RuneCountInString(password) < 12 {
		return invalid("Password must be at least 12 characters")
	}
	if len(password) > 72 {
		return invalid("Password must be 72 UTF-8 bytes or fewer")
	}
	if !upperPattern.MatchString(password) || !lowerPattern.MatchString(password) || !digitPattern.MatchString(password) || !specialPattern.MatchString(password) {
		return invalid("Password must include uppercase and lowercase letters, a digit and a special character")
	}
	return nil
}

type Registration struct {
	Email    string `json:"email"`
	Name     string `json:"name"`
	Password string `json:"password"`
}

func (a *Accounts) Register(ctx context.Context, input Registration) (User, error) {
	input.Email = strings.ToLower(strings.TrimSpace(input.Email))
	input.Name = strings.TrimSpace(input.Name)
	if !ValidEmail(input.Email) || utf8.RuneCountInString(input.Name) > 80 {
		return User{}, invalid("Name or email is invalid")
	}
	if err := PasswordError(input.Password); err != nil {
		return User{}, err
	}
	if a.config.RequireVerification && a.mailer == nil {
		return User{}, &AccountError{503, "Registration email is temporarily unavailable"}
	}
	if input.Name == "" {
		input.Name = strings.Split(input.Email, "@")[0]
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), 12)
	if err != nil {
		return User{}, err
	}
	id, err := data.NewUUID()
	if err != nil {
		return User{}, err
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	_, err = a.db.ExecContext(ctx, `INSERT INTO users (id,email,name,provider,password_hash,credits,plan,email_activation_required) VALUES ($1,$2,$3,'credentials',$4,$5,'free',$6)`, id, input.Email, input.Name, string(hash), a.config.InitialCredits, a.config.RequireVerification)
	if err != nil {
		var duplicate *pq.Error
		if errors.As(err, &duplicate) && duplicate.Code == "23505" {
			return User{}, &AccountError{409, "Email already registered"}
		}
		return User{}, err
	}
	return NewPostgres(a.db).FindByEmail(ctx, input.Email)
}

func tokenDigest(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
func randomToken() (string, error) {
	var b [32]byte
	_, err := rand.Read(b[:])
	return hex.EncodeToString(b[:]), err
}

// RequestToken keeps unknown accounts and delivery failures indistinguishable.
// Configuration failure is checked before looking up an address.
func (a *Accounts) RequestToken(ctx context.Context, email, kind string) error {
	email = strings.ToLower(strings.TrimSpace(email))
	if !ValidEmail(email) {
		return invalid("Email is invalid")
	}
	if a.mailer == nil {
		return &AccountError{503, "Account email is temporarily unavailable"}
	}
	var exists bool
	err := a.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM users u WHERE email=$1 AND NOT EXISTS(SELECT 1 FROM account_deletion_requests d WHERE d.user_id=u.id))`, email).Scan(&exists)
	if err != nil {
		return err
	}
	if !exists {
		return nil
	}
	token, err := randomToken()
	if err != nil {
		return err
	}
	digest := tokenDigest(token)
	identifier := kind + ":" + email
	path, subject, duration := "/reset-password", "Reset your Sneepcut password", time.Hour
	if kind == "email-activation" {
		path, subject, duration = "/activate", "Verify your Sneepcut email", 24*time.Hour
	}
	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	// Lock the owner so concurrent requests cannot both create a usable token.
	var id string
	if err = tx.QueryRowContext(ctx, `SELECT id FROM users WHERE email=$1 FOR UPDATE`, email).Scan(&id); errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM verification_tokens WHERE identifier=$1`, identifier); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO verification_tokens(identifier,token,expires) VALUES($1,$2,$3)`, identifier, digest, time.Now().Add(duration)); err != nil {
		return err
	}
	if err = tx.Commit(); err != nil {
		return err
	}
	link, err := url.Parse(a.config.AppURL)
	if err != nil {
		return err
	}
	link.Path = path
	link.RawQuery = url.Values{"token": {token}, "email": {email}}.Encode()
	err = a.mailer.Send(ctx, Mail{To: email, Subject: subject, Text: "Use this link to continue:\n\n" + link.String() + "\n\nThis link expires in " + duration.String() + ". If you did not request this, you can ignore this email.", Key: kind + "/" + digest})
	if err != nil {
		// Do not revoke a newer request issued during provider work.
		// Delivery can fail because the browser disconnected. Give revocation
		// its own short deadline so cancellation cannot leave this token usable.
		cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 3*time.Second)
		defer cancel()
		_, cleanupErr := a.db.ExecContext(cleanupCtx, `DELETE FROM verification_tokens WHERE identifier=$1 AND token=$2`, identifier, digest)
		return cleanupErr
	}
	return nil
}

func (a *Accounts) ConsumeToken(ctx context.Context, email, token, password, kind string) error {
	if !sessionPattern.MatchString(strings.ToLower(token)) {
		return invalid("Invalid or expired link")
	}
	email = strings.ToLower(strings.TrimSpace(email))
	if email != "" && !ValidEmail(email) {
		return invalid("Email is invalid")
	}
	var hash []byte
	var err error
	if kind == "password-reset" {
		if err = PasswordError(password); err != nil {
			return err
		}
		hash, err = bcrypt.GenerateFromPassword([]byte(password), 12)
		if err != nil {
			return err
		}
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var identifier string
	err = tx.QueryRowContext(ctx, `DELETE FROM verification_tokens WHERE token=$1 AND identifier LIKE $2 AND ($3='' OR identifier=$4) AND expires>now() RETURNING identifier`, tokenDigest(token), kind+":%", email, kind+":"+email).Scan(&identifier)
	if errors.Is(err, sql.ErrNoRows) {
		return invalid("Invalid or expired link")
	}
	if err != nil {
		return err
	}
	email = strings.TrimPrefix(identifier, kind+":")
	var id string
	if kind == "password-reset" {
		err = tx.QueryRowContext(ctx, `UPDATE users u SET password_hash=$1,session_version=session_version+1,updated_at=now() WHERE email=$2 AND NOT EXISTS(SELECT 1 FROM account_deletion_requests d WHERE d.user_id=u.id) RETURNING id`, string(hash), email).Scan(&id)
	} else {
		err = tx.QueryRowContext(ctx, `UPDATE users u SET email_verified=COALESCE(email_verified,now()),email_activation_required=false,updated_at=now() WHERE email=$1 AND NOT EXISTS(SELECT 1 FROM account_deletion_requests d WHERE d.user_id=u.id) RETURNING id`, email).Scan(&id)
	}
	if errors.Is(err, sql.ErrNoRows) {
		return invalid("Invalid or expired link")
	}
	if err != nil {
		return err
	}
	if kind == "password-reset" {
		if _, err = tx.ExecContext(ctx, `DELETE FROM sessions WHERE user_id=$1`, id); err != nil {
			return err
		}
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM verification_tokens WHERE identifier=$1`, identifier); err != nil {
		return err
	}
	return tx.Commit()
}

func (a *Accounts) ChangePassword(ctx context.Context, user User, current, password, confirmation string) error {
	if current == "" || len(current) > 72 {
		return invalid("Current password is required")
	}
	if password != confirmation {
		return invalid("Password confirmation does not match")
	}
	if password == current {
		return invalid("New password must be different from the current password")
	}
	if err := PasswordError(password); err != nil {
		return err
	}
	if user.PasswordHash == "" {
		return &AccountError{409, "Password changes are managed by your sign-in provider"}
	}
	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(current)) != nil {
		return invalid("Current password is incorrect")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		return err
	}
	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(ctx, `UPDATE users u SET password_hash=$1,session_version=session_version+1,updated_at=now() WHERE id=$2 AND password_hash=$3 AND session_version=$4 AND NOT EXISTS(SELECT 1 FROM account_deletion_requests d WHERE d.user_id=u.id)`, string(hash), user.ID, user.PasswordHash, user.SessionVersion)
	if err != nil {
		return err
	}
	n, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if n != 1 {
		return ErrUnauthenticated
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM sessions WHERE user_id=$1`, user.ID); err != nil {
		return err
	}
	return tx.Commit()
}
