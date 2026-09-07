package identity

import (
	"context"
	"errors"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// Public dummy hash, with the example's bcrypt cost, for unknown-user work.
const dummyPasswordHash = "$2b$12$tVLZOBSvFOx2sp4u1B6nT.0lG9HQ0XjxYkW72YPuUc1cQTsKGvCY2"

type Service struct {
	repository Repository
	tokens     *Tokens
}

type AuthResponse struct {
	AccessToken     string `json:"access_token"`
	User            User   `json:"user"`
	AuthenticatedAt int64  `json:"authenticated_at"`
}

func NewService(repository Repository, tokens *Tokens) *Service {
	return &Service{repository: repository, tokens: tokens}
}

func (s *Service) Login(ctx context.Context, email, password string) (AuthResponse, string, time.Time, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" || len(email) > 255 || len(password) == 0 || len(password) > 72 {
		return AuthResponse{}, "", time.Time{}, ErrUnauthenticated
	}
	user, err := s.repository.FindByEmail(ctx, email)
	if err != nil && !errors.Is(err, ErrUnauthenticated) {
		return AuthResponse{}, "", time.Time{}, err
	}
	hash := user.PasswordHash
	if hash == "" {
		hash = dummyPasswordHash
	}
	passwordErr := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	if err != nil || user.PasswordHash == "" || passwordErr != nil || !activeUser(user) {
		return AuthResponse{}, "", time.Time{}, ErrUnauthenticated
	}
	return s.loginUser(ctx, user)
}

func (s *Service) loginUser(ctx context.Context, user User) (AuthResponse, string, time.Time, error) {
	if !activeUser(user) {
		return AuthResponse{}, "", time.Time{}, ErrUnauthenticated
	}
	identity, err := s.tokens.newIdentity(user)
	if err != nil {
		return AuthResponse{}, "", time.Time{}, err
	}
	access, _, err := s.tokens.issue(identity, accessToken)
	if err != nil {
		return AuthResponse{}, "", time.Time{}, err
	}
	refresh, expires, err := s.tokens.issue(identity, refreshToken)
	if err != nil {
		return AuthResponse{}, "", time.Time{}, err
	}
	if err = s.repository.CreateSession(ctx, identity.SessionID, user, expires); err != nil {
		return AuthResponse{}, "", time.Time{}, err
	}
	return AuthResponse{AccessToken: access, User: user, AuthenticatedAt: identity.AuthenticatedAt}, refresh, expires, nil
}

func activeUser(user User) bool {
	return !user.ActivationRequired && (user.AccessRole == "member" || user.AccessRole == "viewer")
}

func (s *Service) authenticate(ctx context.Context, token, purpose string, allowDeletion ...bool) (User, tokenIdentity, error) {
	identity, err := s.tokens.verify(token, purpose)
	if err != nil {
		return User{}, tokenIdentity{}, err
	}
	session, err := s.repository.FindSession(ctx, identity.SessionID)
	if err != nil {
		return User{}, tokenIdentity{}, err
	}
	deletionAllowed := len(allowDeletion) > 0 && allowDeletion[0]
	if session.User.ID != identity.UserID || session.User.SessionVersion != identity.SessionVersion ||
		!s.tokens.now().Before(session.Expires) ||
		(session.User.DeletionPending && !deletionAllowed) ||
		session.User.ActivationRequired ||
		(session.User.AccessRole != "member" && session.User.AccessRole != "viewer") {
		return User{}, tokenIdentity{}, ErrUnauthenticated
	}
	return session.User, identity, nil
}

func (s *Service) currentUserForDeletion(ctx context.Context, token string) (AuthResponse, error) {
	user, identity, err := s.authenticate(ctx, token, accessToken, true)
	return AuthResponse{User: user, AuthenticatedAt: identity.AuthenticatedAt}, err
}

func (s *Service) Refresh(ctx context.Context, token string) (AuthResponse, error) {
	user, identity, err := s.authenticate(ctx, token, refreshToken, true)
	if err != nil {
		return AuthResponse{}, err
	}
	// Refresh issues only a new access JWT, preserving the example's original
	// refresh expiry and the time of actual sign-in for recent-auth checks.
	access, _, err := s.tokens.issue(identity, accessToken)
	return AuthResponse{AccessToken: access, User: user, AuthenticatedAt: identity.AuthenticatedAt}, err
}

func (s *Service) CurrentUser(ctx context.Context, token string) (AuthResponse, error) {
	user, identity, err := s.authenticate(ctx, token, accessToken)
	return AuthResponse{User: user, AuthenticatedAt: identity.AuthenticatedAt}, err
}

func (s *Service) Logout(ctx context.Context, token string) error {
	identity, err := s.tokens.verify(token, refreshToken)
	if err != nil {
		return nil // Missing/expired cookie still gets cleared by the handler.
	}
	return s.repository.DeleteSession(ctx, identity.SessionID)
}
