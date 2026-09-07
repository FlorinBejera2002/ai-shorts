package jobs

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"sync"
	"testing"

	"sneepcut/backend-go/internal/testdb"
)

func seedUser(t *testing.T, db *sql.DB) string {
	t.Helper()
	id := newID()
	if _, err := db.Exec(`INSERT INTO users(id,email,provider,credits,plan) VALUES ($1,$2,'credentials',100,'free')`, id, id+"@example.invalid"); err != nil {
		t.Fatal(err)
	}
	return id
}
func preparedJob() Prepared {
	source := "https://youtube.com/watch?v=fixture"
	return Prepared{Input: CreateInput{Options: DefaultOptions(), SourceType: "youtube", SourceURL: &source}, WorkerSource: source}
}
func TestPostgresConcurrentCreditCreationCancellationAndPayload(t *testing.T) {
	db := testdb.Open(t)
	repo := NewRepository(db)
	user := seedUser(t, db)
	ctx := context.Background()
	var wg sync.WaitGroup
	results := make(chan error, 12)
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); _, err := repo.Create(ctx, user, []Prepared{preparedJob()}); results <- err }()
	}
	wg.Wait()
	close(results)
	created, insufficient := 0, 0
	for err := range results {
		if err == nil {
			created++
		} else if errors.Is(err, ErrCredits) {
			insufficient++
		} else {
			t.Fatal(err)
		}
	}
	if created != 2 || insufficient != 10 {
		t.Fatalf("created %d insufficient %d", created, insufficient)
	}
	var credits, count int
	if err := db.QueryRow(`SELECT credits FROM users WHERE id=$1`, user).Scan(&credits); err != nil || credits != 0 {
		t.Fatalf("balance %d err %v", credits, err)
	}
	if err := db.QueryRow(`SELECT count(*) FROM job_deliveries`).Scan(&count); err != nil || count != 2 {
		t.Fatal(count, err)
	}
	jobs, err := repo.List(ctx, user, false)
	if err != nil {
		t.Fatal(err)
	}
	var job map[string]any
	_ = json.Unmarshal(jobs[0], &job)
	id := job["id"].(string)
	var raw []byte
	if err = db.QueryRow(`SELECT payload FROM job_deliveries WHERE job_id=$1`, id).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	var payload map[string]any
	_ = json.Unmarshal(raw, &payload)
	if payload["burn_subtitles"] != true || payload["smart_crop"] != true || payload["requested_clips"] != float64(5) || payload["job_id"] != id || payload["user_instructions"] != nil {
		t.Fatal(payload)
	}
	if job["source_file_path"] != nil || job["completed_at"] != nil || job["active_edit_token"] != nil {
		t.Fatal("nullable/private fields changed", job)
	}
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, e := repo.Cancel(ctx, user, id); e != nil {
				t.Error(e)
			}
		}()
	}
	wg.Wait()
	if err = db.QueryRow(`SELECT credits FROM users WHERE id=$1`, user).Scan(&credits); err != nil || credits != 50 {
		t.Fatalf("double refund: %d %v", credits, err)
	}
	if _, err = repo.Get(ctx, seedUser(t, db), id); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("ownership failure: %v", err)
	}
	// Polling remains a pure database read with no broker configured.
	if _, err = repo.Get(ctx, user, id); err != nil {
		t.Fatal(err)
	}
}

func TestPostgresBatchFailureRollsBackDebitAndOutbox(t *testing.T) {
	db := testdb.Open(t)
	user := seedUser(t, db)
	repo := NewRepository(db)
	// Force the second insert to violate the real schema after the first has
	// written its durable intent. The enclosing transaction must undo both.
	bad := preparedJob()
	long := ""
	for i := 0; i < 51; i++ {
		long += "x"
	}
	bad.Input.Language = &long
	if _, err := repo.Create(context.Background(), user, []Prepared{preparedJob(), bad}); err == nil {
		t.Fatal("expected DB constraint failure")
	}
	var credits, count int
	_ = db.QueryRow(`SELECT credits FROM users WHERE id=$1`, user).Scan(&credits)
	_ = db.QueryRow(`SELECT count(*) FROM jobs`).Scan(&count)
	if credits != 100 || count != 0 {
		t.Fatalf("partial batch: credits=%d jobs=%d", credits, count)
	}
	if _, err := db.Exec(`INSERT INTO account_deletion_requests(user_id) VALUES($1)`, user); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.Create(context.Background(), user, []Prepared{preparedJob()}); !errors.Is(err, ErrInactive) {
		t.Fatalf("deleting user charged: %v", err)
	}
}
