package identity

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/httpapi"
)

// The runner generates SQL from the current Alembic migrations. Each test owns
// a random schema in the dedicated loopback test database, never public data.
func migratedPostgres(t *testing.T) *sql.DB {
	t.Helper()
	raw := os.Getenv("SNEEPCUT_TEST_DATABASE_URL")
	if raw == "" {
		t.Skip("run python3 scripts/test-auth-integration.py for PostgreSQL verification")
	}
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatal("invalid test database URL")
	}
	if (u.Scheme != "postgres" && u.Scheme != "postgresql") ||
		(u.Hostname() != "localhost" && u.Hostname() != "127.0.0.1" && u.Hostname() != "::1") ||
		u.Path != "/sneepcut_integration_test" || u.Query().Has("host") || u.Query().Has("dbname") || u.Query().Has("service") {
		t.Fatal("integration tests require the dedicated loopback sneepcut_integration_test database")
	}
	migration, err := os.ReadFile(os.Getenv("SNEEPCUT_TEST_SCHEMA_SQL"))
	if err != nil {
		t.Fatal("SNEEPCUT_TEST_SCHEMA_SQL must contain SQL generated from current Alembic migrations")
	}
	open := func(dsn string) *sql.DB {
		db, err := data.Open(context.Background(), data.Config{DSN: dsn, MaxOpenConns: 5, MaxIdleConns: 2, MaxIdleTime: time.Minute})
		if err != nil {
			t.Fatal("cannot connect to integration database")
		}
		return db
	}
	admin := open(raw)
	t.Cleanup(func() { admin.Close() })
	var random [16]byte
	if _, err := rand.Read(random[:]); err != nil {
		t.Fatal(err)
	}
	schema := "test_go_auth_" + hex.EncodeToString(random[:])
	if _, err := admin.Exec(`CREATE SCHEMA "` + schema + `"`); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := admin.Exec(`DROP SCHEMA "` + schema + `" CASCADE`); err != nil {
			t.Error(err)
		}
	})
	query := u.Query()
	query.Del("options")
	query.Set("search_path", schema)
	u.RawQuery = query.Encode()
	db := open(u.String())
	t.Cleanup(func() { db.Close() })
	if _, err := db.Exec(string(migration)); err != nil {
		t.Fatalf("apply Alembic SQL: %v", err)
	}
	return db
}

func TestPostgresAuthLifecycle(t *testing.T) {
	db := migratedPostgres(t)
	user := testUser()
	exec := func(query string, args ...any) {
		t.Helper()
		if _, err := db.Exec(query, args...); err != nil {
			t.Fatal(err)
		}
	}
	exec(`INSERT INTO users (id,email,provider,password_hash,credits,plan) VALUES ($1,$2,'credentials',$3,100,'free')`, user.ID, user.Email, user.PasswordHash)
	repository := NewPostgres(db)
	service := NewService(repository, testTokens(t))
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	handler := httpapi.New(logger, "test", "test", NewHandler(service, HTTPConfig{AllowedOrigins: []string{"https://app.example.invalid"}}, logger).Register)
	response, cookie := loginHTTP(t, handler)
	if response.User.Name != nil || response.User.ProfilePic != nil || response.User.EmailVerified != nil || response.User.CreatedAt.IsZero() {
		t.Fatal("nullable/timestamp schema mapping lost")
	}
	var key string
	if err := db.QueryRow(`SELECT session_token FROM sessions WHERE user_id=$1`, user.ID).Scan(&key); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(key, "go-jwt:") || strings.Contains(key, ".") {
		t.Fatal("session must store only a namespaced random ID")
	}
	if w := call(handler, http.MethodGet, "/v1/auth/me", "", nil, response.AccessToken); w.Code != 200 {
		t.Fatalf("me: %d %s", w.Code, w.Body.String())
	}
	if w := call(handler, http.MethodPost, "/v1/auth/refresh", "{}", cookie, ""); w.Code != 200 {
		t.Fatalf("refresh: %d", w.Code)
	}
	// Current DB state, including viewer role and entitlements, overrides login state.
	exec(`UPDATE users SET credits=37, access_role='viewer' WHERE id=$1`, user.ID)
	current, err := service.CurrentUser(context.Background(), response.AccessToken)
	if err != nil || current.User.Credits != 37 || current.User.AccessRole != "viewer" {
		t.Fatalf("stale profile: %v", err)
	}
	if w := call(handler, http.MethodPost, "/v1/auth/logout", "{}", cookie, ""); w.Code != 200 {
		t.Fatalf("logout: %d", w.Code)
	}
	if _, err := service.Refresh(context.Background(), cookie.Value); err != ErrUnauthenticated {
		t.Fatalf("revoked refresh: %v", err)
	}
	if _, err := service.CurrentUser(context.Background(), response.AccessToken); err != ErrUnauthenticated {
		t.Fatalf("revoked access: %v", err)
	}

	response, cookie = loginHTTP(t, handler)
	stale, _ := repository.FindByEmail(context.Background(), user.Email)
	exec(`UPDATE users SET session_version=session_version+1 WHERE id=$1`, user.ID)
	if err := repository.CreateSession(context.Background(), strings.Repeat("a", 64), stale, time.Now().Add(time.Hour)); err != ErrUnauthenticated {
		t.Fatalf("stale login created session: %v", err)
	}
	if _, err := service.Refresh(context.Background(), cookie.Value); err != ErrUnauthenticated {
		t.Fatalf("password version: %v", err)
	}
	response, cookie = loginHTTP(t, handler)
	stale, _ = repository.FindByEmail(context.Background(), user.Email)
	exec(`INSERT INTO account_deletion_requests (user_id) VALUES ($1)`, user.ID)
	if err := repository.CreateSession(context.Background(), strings.Repeat("b", 64), stale, time.Now().Add(time.Hour)); err != ErrUnauthenticated {
		t.Fatalf("deleting user created session: %v", err)
	}
	if _, err := service.CurrentUser(context.Background(), response.AccessToken); err != ErrUnauthenticated {
		t.Fatalf("deleting access: %v", err)
	}
	if refreshed, err := service.Refresh(context.Background(), cookie.Value); err != nil || !refreshed.User.DeletionPending {
		t.Fatalf("deleting refresh must allow restricted retry session: %v", err)
	}
	if loggedIn, _, _, err := service.Login(context.Background(), user.Email, testPassword); err != nil || !loggedIn.User.DeletionPending {
		t.Fatalf("deleting account cannot sign in to retry: %v", err)
	}
	exec(`DELETE FROM users WHERE id=$1`, user.ID)
	var count int
	if err := db.QueryRow(`SELECT count(*) FROM sessions`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("session cascade: count %d err %v", count, err)
	}
}
