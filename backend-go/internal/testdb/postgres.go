// Package testdb provides disposable, migrated PostgreSQL fixtures only.
package testdb

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"net/url"
	"os"
	"sneepcut/backend-go/internal/data"
	"testing"
	"time"
)

func Open(t *testing.T) *sql.DB {
	t.Helper()
	raw := os.Getenv("SNEEPCUT_TEST_DATABASE_URL")
	if raw == "" {
		t.Skip("requires SNEEPCUT_TEST_DATABASE_URL and current Alembic SNEEPCUT_TEST_SCHEMA_SQL")
	}
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatal("invalid test database URL")
	}
	if (u.Scheme != "postgres" && u.Scheme != "postgresql") || (u.Hostname() != "localhost" && u.Hostname() != "127.0.0.1" && u.Hostname() != "::1") || u.Path != "/sneepcut_integration_test" || u.Query().Has("host") || u.Query().Has("dbname") || u.Query().Has("service") {
		t.Fatal("integration tests require dedicated loopback sneepcut_integration_test database")
	}
	migration, err := os.ReadFile(os.Getenv("SNEEPCUT_TEST_SCHEMA_SQL"))
	if err != nil {
		t.Fatal("current Alembic SQL fixture is required")
	}
	open := func(dsn string) *sql.DB {
		db, err := data.Open(context.Background(), data.Config{DSN: dsn, MaxOpenConns: 12, MaxIdleConns: 2, MaxIdleTime: time.Minute})
		if err != nil {
			t.Fatal(err)
		}
		return db
	}
	admin := open(raw)
	t.Cleanup(func() { admin.Close() })
	var b [16]byte
	if _, err = rand.Read(b[:]); err != nil {
		t.Fatal(err)
	}
	schema := "test_go_features_" + hex.EncodeToString(b[:])
	if _, err = admin.Exec(`CREATE SCHEMA "` + schema + `"`); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := admin.Exec(`DROP SCHEMA "` + schema + `" CASCADE`); err != nil {
			t.Error(err)
		}
	})
	q := u.Query()
	q.Del("options")
	q.Set("search_path", schema)
	u.RawQuery = q.Encode()
	db := open(u.String())
	t.Cleanup(func() { db.Close() })
	if _, err = db.Exec(string(migration)); err != nil {
		t.Fatal(err)
	}
	return db
}
