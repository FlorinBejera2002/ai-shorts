package identity

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// User maps the current Sneepcut schema, not the example's integer-ID schema.
// Only public profile/entitlement fields are serialized in auth responses.
type User struct {
	ID                 string     `json:"id"`
	Email              string     `json:"email"`
	Name               *string    `json:"name"`
	ProfilePic         *string    `json:"profile_pic"`
	Credits            int        `json:"credits"`
	Plan               string     `json:"plan"`
	AccessRole         string     `json:"access_role"`
	EmailVerified      *time.Time `json:"email_verified"`
	CreatedAt          time.Time  `json:"created_at"`
	PasswordHash       string     `json:"-"`
	SessionVersion     int        `json:"-"`
	DeletionPending    bool       `json:"deletion_pending"`
	ActivationRequired bool       `json:"-"`
}

type Session struct {
	User    User
	Expires time.Time
}

type Repository interface {
	FindByEmail(context.Context, string) (User, error)
	CreateSession(context.Context, string, User, time.Time) error
	FindSession(context.Context, string) (Session, error)
	DeleteSession(context.Context, string) error
}

type Postgres struct {
	db *sql.DB
}

func NewPostgres(db *sql.DB) *Postgres { return &Postgres{db: db} }

const userColumns = `u.id, u.email, u.name, u.avatar_url, u.credits, u.plan,
	u.access_role, u.email_verified, u.created_at, COALESCE(u.password_hash, ''),
	u.session_version, EXISTS (SELECT 1 FROM account_deletion_requests d WHERE d.user_id = u.id),u.email_activation_required`

func userDest(u *User) []any {
	return []any{&u.ID, &u.Email, &u.Name, &u.ProfilePic, &u.Credits, &u.Plan,
		&u.AccessRole, &u.EmailVerified, &u.CreatedAt, &u.PasswordHash,
		&u.SessionVersion, &u.DeletionPending, &u.ActivationRequired}
}

func (p *Postgres) FindByEmail(ctx context.Context, email string) (User, error) {
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	var user User
	err := p.db.QueryRowContext(ctx, `SELECT `+userColumns+` FROM users u WHERE u.email = $1`, email).Scan(userDest(&user)...)
	if errors.Is(err, sql.ErrNoRows) {
		err = ErrUnauthenticated
	}
	return user, err
}

// Auth.js currently uses JWT sessions. Namespace Go session IDs in the existing
// sessions table; neither raw JWTs nor a new users schema are stored here.
func sessionKey(id string) string { return "go-jwt:" + id }

func (p *Postgres) CreateSession(ctx context.Context, id string, user User, expires time.Time) error {
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	result, err := p.db.ExecContext(ctx, `INSERT INTO sessions (session_token, user_id, expires)
		SELECT $1, u.id, $2 FROM users u WHERE u.id = $3 AND u.session_version = $4
		AND NOT u.email_activation_required
		AND (EXISTS (SELECT 1 FROM account_deletion_requests d WHERE d.user_id = u.id))=$5`,
		sessionKey(id), expires, user.ID, user.SessionVersion, user.DeletionPending)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err == nil && count != 1 {
		return ErrUnauthenticated
	}
	return err
}

func (p *Postgres) FindSession(ctx context.Context, id string) (Session, error) {
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	var session Session
	dest := append(userDest(&session.User), &session.Expires)
	err := p.db.QueryRowContext(ctx, `SELECT `+userColumns+`, s.expires FROM sessions s
		JOIN users u ON u.id = s.user_id WHERE s.session_token = $1`, sessionKey(id)).Scan(dest...)
	if errors.Is(err, sql.ErrNoRows) {
		err = ErrUnauthenticated
	}
	return session, err
}

func (p *Postgres) DeleteSession(ctx context.Context, id string) error {
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	_, err := p.db.ExecContext(ctx, `DELETE FROM sessions WHERE session_token = $1`, sessionKey(id))
	return err
}
