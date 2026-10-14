package airouting

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"reflect"
	"sync"
	"testing"
	"time"

	"github.com/lib/pq"

	"sneepcut/backend-go/internal/aiprovider"
	"sneepcut/backend-go/internal/migrate"
	"sneepcut/backend-go/migrations"
)

func routingIntegrationDatabases(t *testing.T) (*sql.DB, *sql.DB) {
	t.Helper()
	raw := os.Getenv("SNEEPCUT_TEST_DATABASE_URL")
	if raw == "" {
		t.Skip("requires dedicated loopback SNEEPCUT_TEST_DATABASE_URL")
	}
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatal("invalid test database URL")
	}
	if (u.Scheme != "postgres" && u.Scheme != "postgresql") || (u.Hostname() != "localhost" && u.Hostname() != "127.0.0.1" && u.Hostname() != "::1") || u.Path != "/sneepcut_integration_test" || u.Query().Has("host") || u.Query().Has("hostaddr") || u.Query().Has("dbname") || u.Query().Has("service") {
		t.Fatal("AI routing integration tests require dedicated loopback sneepcut_integration_test database")
	}
	open := func(dsn string) *sql.DB {
		t.Helper()
		db, err := sql.Open("postgres", dsn)
		if err != nil {
			t.Fatal(err)
		}
		db.SetMaxOpenConns(8)
		t.Cleanup(func() { db.Close() })
		return db
	}
	admin := open(raw)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	var database string
	if err := admin.QueryRowContext(ctx, `SELECT current_database()`).Scan(&database); err != nil || database != "sneepcut_integration_test" {
		t.Fatalf("dedicated integration database was not confirmed: %v", err)
	}
	var random [16]byte
	if _, err := rand.Read(random[:]); err != nil {
		t.Fatal(err)
	}
	schema := "test_ai_routing_" + hex.EncodeToString(random[:])
	if _, err := admin.ExecContext(ctx, `CREATE SCHEMA `+pq.QuoteIdentifier(schema)); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if _, err := admin.ExecContext(ctx, `DROP SCHEMA `+pq.QuoteIdentifier(schema)+` CASCADE`); err != nil {
			t.Error(err)
		}
	})
	query := u.Query()
	query.Del("options")
	query.Set("search_path", schema)
	u.RawQuery = query.Encode()
	db, observer := open(u.String()), open(u.String())
	chain, err := migrations.All()
	if err != nil {
		t.Fatal(err)
	}
	for range 2 {
		if revision, err := migrate.Up(ctx, db); err != nil || revision != chain[len(chain)-1].Revision {
			t.Fatalf("migration chain failed: revision=%s error=%v", revision, err)
		}
	}
	return db, observer
}

func TestPostgresRoutingMigrationAndStore(t *testing.T) {
	db, observer := routingIntegrationDatabases(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	const actor = "00000000-0000-4000-8000-000000000001"
	if _, err := db.ExecContext(ctx, `INSERT INTO users(id,email,provider,credits,plan,access_role) VALUES($1,'ai-routing@example.invalid','credentials',0,'free','admin')`, actor); err != nil {
		t.Fatal(err)
	}
	store, otherProcess := NewStore(db), NewStore(observer)
	initial, err := store.Load(ctx)
	if err != nil || initial.Version != 0 || len(initial.Routes) != 0 {
		t.Fatalf("initial migration configuration: %+v, %v", initial, err)
	}
	routes := map[aiprovider.Task]Route{aiprovider.TaskStoryPlanning: {Provider: "openrouter", Model: "example/planner"}}
	saved, err := store.Save(ctx, 0, routes, actor, "Test independent stage planning")
	if err != nil || saved.Version != 1 {
		t.Fatalf("save failed: %+v, %v", saved, err)
	}
	visible, err := otherProcess.Load(ctx)
	if err != nil || !reflect.DeepEqual(visible, saved) {
		t.Fatalf("another process did not see routing update: %+v, %v", visible, err)
	}
	var auditActor, action, reason string
	var target sql.NullString
	var beforeJSON, afterJSON []byte
	if err := db.QueryRowContext(ctx, `SELECT actor_user_id,target_user_id,action,reason,before_state,after_state FROM admin_audit_events`).Scan(&auditActor, &target, &action, &reason, &beforeJSON, &afterJSON); err != nil {
		t.Fatal(err)
	}
	var before, after Configuration
	if err := json.Unmarshal(beforeJSON, &before); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(afterJSON, &after); err != nil {
		t.Fatal(err)
	}
	if auditActor != actor || target.Valid || action != "set_ai_routing" || reason != "Test independent stage planning" || !reflect.DeepEqual(before, initial) || !reflect.DeepEqual(after, saved) {
		t.Fatalf("incorrect audit data: actor=%s target=%+v action=%s before=%+v after=%+v", auditActor, target, action, before, after)
	}
	if _, err := store.Save(ctx, 0, nil, actor, "Stale configuration update"); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale update was accepted: %v", err)
	}

	// Simultaneous editors observe the same version. Only one can commit; the
	// others must conflict after acquiring the singleton row lock.
	var writers sync.WaitGroup
	results := make(chan error, 6)
	for index := range 6 {
		writers.Add(1)
		go func() {
			defer writers.Done()
			candidate := map[aiprovider.Task]Route{aiprovider.TaskStoryPlanning: {Provider: "openrouter", Model: fmt.Sprintf("example/planner-%d", index)}}
			_, err := NewStore(db).Save(ctx, 1, candidate, actor, "Concurrent routing update")
			results <- err
		}()
	}
	writers.Wait()
	close(results)
	var committed, conflicted int
	for err := range results {
		switch {
		case err == nil:
			committed++
		case errors.Is(err, ErrConflict):
			conflicted++
		default:
			t.Fatalf("concurrent update failed unexpectedly: %v", err)
		}
	}
	if committed != 1 || conflicted != 5 {
		t.Fatalf("concurrent updates committed=%d conflicted=%d", committed, conflicted)
	}
	current, err := otherProcess.Load(ctx)
	if err != nil || current.Version != 2 {
		t.Fatalf("wrong routing version after concurrency: %+v, %v", current, err)
	}

	// Force only the audit INSERT to fail, after UPDATE succeeds. PostgreSQL
	// must roll the routing configuration back with the rejected audit record.
	if _, err := db.ExecContext(ctx, `ALTER TABLE admin_audit_events ADD CONSTRAINT reject_routing_test CHECK (action <> 'set_ai_routing') NOT VALID`); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Save(ctx, 2, nil, actor, "Audit failure rollback test"); err == nil {
		t.Fatal("routing saved despite failed audit")
	}
	unchanged, err := otherProcess.Load(ctx)
	if err != nil || !reflect.DeepEqual(unchanged, current) {
		t.Fatalf("audit failure changed routing: %+v, %v", unchanged, err)
	}
	var count int
	if err := db.QueryRowContext(ctx, `SELECT count(*) FROM admin_audit_events`).Scan(&count); err != nil || count != 2 {
		t.Fatalf("failed/conflicting updates left audit entries: count=%d err=%v", count, err)
	}
}
