package identity

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"math"
	"regexp"
	"time"

	"github.com/pascaldekloe/jwt"
)

const (
	accessToken  = "access"
	refreshToken = "refresh"
)

var (
	ErrUnauthenticated = errors.New("invalid authentication credentials")
	uuidPattern        = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
	sessionPattern     = regexp.MustCompile(`^[0-9a-f]{64}$`)
)

type TokenConfig struct {
	Secret          string
	Issuer          string
	Audience        string
	AccessLifetime  time.Duration
	RefreshLifetime time.Duration
}

// Tokens preserves the example's HS256 access/refresh JWT design. Token purpose
// and session version are explicit so the two token types cannot be exchanged.
type Tokens struct {
	config TokenConfig
	key    *jwt.HMAC
	now    func() time.Time
}

type tokenIdentity struct {
	UserID          string
	SessionID       string
	SessionVersion  int
	AuthenticatedAt int64
}

func NewTokens(cfg TokenConfig) (*Tokens, error) {
	if len(cfg.Secret) < 32 || cfg.Issuer == "" || cfg.Audience == "" ||
		cfg.AccessLifetime < time.Second || cfg.RefreshLifetime <= cfg.AccessLifetime {
		return nil, errors.New("JWT configuration requires a 32-byte secret, issuer/audience, and valid token lifetimes")
	}
	key, err := jwt.NewHMAC(jwt.HS256, []byte(cfg.Secret))
	if err != nil {
		return nil, err
	}
	return &Tokens{config: cfg, key: key, now: time.Now}, nil
}

func (t *Tokens) newIdentity(user User) (tokenIdentity, error) {
	var random [32]byte
	if _, err := rand.Read(random[:]); err != nil {
		return tokenIdentity{}, err
	}
	return tokenIdentity{
		UserID: user.ID, SessionID: hex.EncodeToString(random[:]),
		SessionVersion: user.SessionVersion, AuthenticatedAt: t.now().Unix(),
	}, nil
}

func (t *Tokens) issue(identity tokenIdentity, purpose string) (string, time.Time, error) {
	lifetime := t.config.AccessLifetime
	if purpose == refreshToken {
		lifetime = t.config.RefreshLifetime
	}
	now := t.now().UTC().Truncate(time.Second)
	expires := now.Add(lifetime)
	claims := jwt.Claims{
		Registered: jwt.Registered{
			Subject: identity.UserID, Issuer: t.config.Issuer,
			Audiences: []string{t.config.Audience},
			Issued:    jwt.NewNumericTime(now), NotBefore: jwt.NewNumericTime(now),
			Expires: jwt.NewNumericTime(expires),
		},
		Set: map[string]any{
			"token_use": purpose, "session_id": identity.SessionID,
			"session_version": identity.SessionVersion, "auth_time": identity.AuthenticatedAt,
		},
	}
	token, err := t.key.Sign(&claims)
	return string(token), expires, err
}

func (t *Tokens) verify(token, purpose string) (tokenIdentity, error) {
	if len(token) == 0 || len(token) > 4096 {
		return tokenIdentity{}, ErrUnauthenticated
	}
	claims, err := t.key.Check([]byte(token))
	if err != nil {
		return tokenIdentity{}, ErrUnauthenticated
	}
	now := t.now()
	version, versionOK := claims.Number("session_version")
	authTime, authOK := claims.Number("auth_time")
	sessionID, _ := claims.String("session_id")
	tokenUse, _ := claims.String("token_use")
	if claims.Expires == nil || claims.Issued == nil || claims.NotBefore == nil ||
		!claims.Valid(now) || claims.Issued.Time().After(now) ||
		!claims.Expires.Time().After(claims.Issued.Time()) ||
		claims.Issuer != t.config.Issuer || len(claims.Audiences) == 0 || !claims.AcceptAudience(t.config.Audience) ||
		tokenUse != purpose || !uuidPattern.MatchString(claims.Subject) || !sessionPattern.MatchString(sessionID) ||
		!versionOK || version < 0 || version > math.MaxInt32 || math.Trunc(version) != version ||
		!authOK || authTime <= 0 || authTime > float64(now.Unix()) || math.Trunc(authTime) != authTime {
		return tokenIdentity{}, ErrUnauthenticated
	}
	return tokenIdentity{
		UserID: claims.Subject, SessionID: sessionID, SessionVersion: int(version),
		AuthenticatedAt: int64(authTime),
	}, nil
}
