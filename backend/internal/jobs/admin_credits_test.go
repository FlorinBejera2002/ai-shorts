package jobs

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"testing"

	"sneepcut/backend-go/internal/testdb"
)

func assertJobBalance(t *testing.T, db *sql.DB, user string, want int) {
	t.Helper()
	var got int
	if err := db.QueryRow(`SELECT credits FROM users WHERE id=$1`, user).Scan(&got); err != nil || got != want {
		t.Fatalf("balance=%d, want=%d, err=%v", got, want, err)
	}
}

func TestAdministratorJobsAndRetriesHaveNoChargeOrRefund(t *testing.T) {
	db := testdb.Open(t)
	repo := NewRepository(db)
	user := seedUser(t, db)
	if _, err := db.Exec(`UPDATE users SET access_role='admin',credits=0 WHERE id=$1`, user); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	jobs, err := repo.Create(ctx, user, []Prepared{preparedJob(), preparedJob()})
	if err != nil || len(jobs) != 2 {
		t.Fatalf("create=%d, err=%v", len(jobs), err)
	}
	other := seedUser(t, db)
	for _, raw := range jobs {
		var job struct {
			ID     string
			Charge int `json:"credits_charged"`
		}
		if err = json.Unmarshal(raw, &job); err != nil || job.Charge != 0 {
			t.Fatalf("charge=%d err=%v", job.Charge, err)
		}
		if _, err = repo.Get(ctx, other, job.ID); !errors.Is(err, sql.ErrNoRows) {
			t.Fatalf("cross-owner job access: %v", err)
		}
		for range 2 {
			if _, err = repo.Cancel(ctx, user, job.ID); err != nil {
				t.Fatal(err)
			}
		}
		retry := audioRetryInput{RequestID: newID()}
		if err = repo.retryAudio(ctx, other, job.ID, retry); !errors.Is(err, sql.ErrNoRows) {
			t.Fatalf("cross-owner retry: %v", err)
		}
		for range 2 {
			if err = repo.retryAudio(ctx, user, job.ID, retry); err != nil {
				t.Fatal(err)
			}
		}
		var charge int
		if err = db.QueryRow(`SELECT credits_charged FROM jobs WHERE id=$1`, job.ID).Scan(&charge); err != nil || charge != 0 {
			t.Fatalf("retry charge=%d err=%v", charge, err)
		}
		if _, err = repo.Cancel(ctx, user, job.ID); err != nil {
			t.Fatal(err)
		}
		assertJobBalance(t, db, user, 0)
	}
}

func TestPromotionPreservesPaidJobRefundAndExemptsNewRetry(t *testing.T) {
	db := testdb.Open(t)
	repo := NewRepository(db)
	user := seedUser(t, db)
	ctx := context.Background()
	created, err := repo.Create(ctx, user, []Prepared{preparedJob()})
	if err != nil {
		t.Fatal(err)
	}
	var job struct{ ID string }
	if err = json.Unmarshal(created[0], &job); err != nil {
		t.Fatal(err)
	}
	assertJobBalance(t, db, user, 50)
	if _, err = db.Exec(`UPDATE users SET access_role='admin' WHERE id=$1`, user); err != nil {
		t.Fatal(err)
	}
	if _, err = repo.Cancel(ctx, user, job.ID); err != nil {
		t.Fatal(err)
	}
	assertJobBalance(t, db, user, 100)
	if err = repo.retryAudio(ctx, user, job.ID, audioRetryInput{RequestID: newID()}); err != nil {
		t.Fatal(err)
	}
	if _, err = repo.Cancel(ctx, user, job.ID); err != nil {
		t.Fatal(err)
	}
	assertJobBalance(t, db, user, 100)
	if _, err = db.Exec(`UPDATE users SET access_role='member',credits=0 WHERE id=$1`, user); err != nil {
		t.Fatal(err)
	}
	if err = repo.retryAudio(ctx, user, job.ID, audioRetryInput{RequestID: newID()}); !errors.Is(err, ErrCredits) {
		t.Fatalf("demoted member bypassed charge: %v", err)
	}
}
