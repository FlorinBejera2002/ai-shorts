package migrate

import (
 "context"
 "crypto/rand"
 "database/sql"
 "encoding/hex"
 "net/url"
 "os"
 "sync"
 "testing"
 "time"

 _ "github.com/lib/pq"
 "sneepcut/backend-go/migrations"
)

func migrationDB(t *testing.T) *sql.DB {
 t.Helper()
 raw := os.Getenv("SNEEPCUT_TEST_DATABASE_URL")
 if raw == "" { t.Skip("requires dedicated SNEEPCUT_TEST_DATABASE_URL") }
 u, err := url.Parse(raw)
 if err != nil { t.Fatal(err) }
 if (u.Scheme != "postgres" && u.Scheme != "postgresql") || (u.Hostname() != "localhost" && u.Hostname() != "127.0.0.1" && u.Hostname() != "::1") || u.Path != "/sneepcut_integration_test" || u.Query().Has("host") || u.Query().Has("dbname") || u.Query().Has("service") { t.Fatal("dedicated loopback integration database required") }
 admin, err := sql.Open("postgres", raw)
 if err != nil { t.Fatal(err) }
 t.Cleanup(func(){admin.Close()})
 var random [16]byte
 if _, err := rand.Read(random[:]); err != nil { t.Fatal(err) }
 schema := "test_go_migrations_"+hex.EncodeToString(random[:])
 if _, err := admin.Exec(`CREATE SCHEMA "`+schema+`"`); err != nil { t.Fatal(err) }
 t.Cleanup(func(){if _, err := admin.Exec(`DROP SCHEMA "`+schema+`" CASCADE`); err != nil {t.Error(err)}})
 q := u.Query(); q.Del("options"); q.Set("search_path",schema); u.RawQuery = q.Encode()
 db, err := sql.Open("postgres",u.String())
 if err != nil {t.Fatal(err)}
 t.Cleanup(func(){db.Close()})
 return db
}

func TestPostgresMigrationLifecycle(t *testing.T) {
 db := migrationDB(t)
 ctx, cancel := context.WithTimeout(context.Background(),time.Minute)
 defer cancel()
 chain, err := migrations.All()
 if err != nil {t.Fatal(err)}
 // Start at an actual old Alembic revision, with data requiring later backfills.
 if _, err := apply(ctx,db,chain[:1]); err != nil {t.Fatal(err)}
 _, err = db.ExecContext(ctx, `INSERT INTO users (id,email,provider,credits,plan,created_at) VALUES ('00000000-0000-0000-0000-000000000001','migration@example.test','credentials',17,'free',now())`)
 if err != nil {t.Fatal(err)}
 var wg sync.WaitGroup
 failures := make(chan error,2)
 for i:=0;i<2;i++ {wg.Add(1); go func(){defer wg.Done();_,err:=Up(ctx,db); failures<-err}()}
 wg.Wait(); close(failures)
 for err := range failures {if err != nil {t.Fatal(err)}}
 var credits int
 if err := db.QueryRowContext(ctx,`SELECT credits FROM users WHERE email='migration@example.test'`).Scan(&credits); err != nil || credits != 17 {t.Fatalf("data preservation credits=%d err=%v",credits,err)}
 var revision string
 if err := db.QueryRowContext(ctx,`SELECT version_num FROM alembic_version`).Scan(&revision); err != nil || revision != chain[len(chain)-1].Revision {t.Fatalf("revision=%s err=%v",revision,err)}
 broken := append(append([]migrations.Migration{},chain...), migrations.Migration{Revision:"test_failed",SQL:"CREATE TABLE rollback_probe (id int); SELECT missing_column FROM users;"})
 if _, err := apply(ctx,db,broken); err == nil {t.Fatal("broken migration accepted")}
 var absent bool
 if err := db.QueryRowContext(ctx,`SELECT to_regclass('rollback_probe') IS NULL`).Scan(&absent); err != nil || !absent {t.Fatalf("DDL was not rolled back: %v",err)}
 if _, err := Up(ctx,db); err != nil {t.Fatal(err)}
}

func TestPostgresFreshMigration(t *testing.T) {
 db:=migrationDB(t)
 ctx,cancel:=context.WithTimeout(context.Background(),time.Minute);defer cancel()
 if _,err:=Up(ctx,db);err!=nil {t.Fatal(err)}
 if _,err:=Up(ctx,db);err!=nil {t.Fatal(err)}
}
