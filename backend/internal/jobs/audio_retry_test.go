package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"sneepcut/backend-go/internal/audiocleanup"
	"sneepcut/backend-go/internal/testdb"
	"testing"
)

func TestPostgresAudioRetryIsOwnedIdempotentAndPreservesSource(t *testing.T) {
	t.Setenv("AUDIO_CLEANUP_VERIFIED", "true")
	t.Setenv("DEEPFILTER_PATH", "/synthetic/runtime")
	t.Setenv("DEEPFILTER_MODEL", "/synthetic/model")
	db := testdb.Open(t)
	repo := NewRepository(db)
	user := seedUser(t, db)
	ctx := context.Background()
	prepared := preparedJob()
	prepared.Input.AudioCleanup = &audiocleanup.Settings{Enabled: true}
	jobs, err := repo.Create(ctx, user, []Prepared{prepared})
	if err != nil {
		t.Fatal(err)
	}
	var job struct{ ID string }
	if json.Unmarshal(jobs[0], &job) != nil {
		t.Fatal("job unavailable")
	}
	// Cancelling refunds the original reservation, leaving the source intact.
	if _, err = repo.Cancel(ctx, user, job.ID); err != nil {
		t.Fatal(err)
	}
	retry := audioRetryInput{RequestID: newID(), AudioCleanup: &audiocleanup.Settings{Enabled: false}}
	firstID := retry.RequestID
	other := seedUser(t, db)
	if err = repo.retryAudio(ctx, other, job.ID, retry); err == nil {
		t.Fatal("cross-owner retry accepted")
	}
	for i := 0; i < 2; i++ {
		if err = repo.retryAudio(ctx, user, job.ID, retry); err != nil {
			t.Fatal(err)
		}
	}
	var credits int
	if err = db.QueryRow("SELECT credits FROM users WHERE id=$1", user).Scan(&credits); err != nil || credits != 50 {
		t.Fatalf("duplicate charge: %d %v", credits, err)
	}
	var payload []byte
	if err = db.QueryRow("SELECT payload FROM job_deliveries WHERE job_id=$1", job.ID).Scan(&payload); err != nil {
		t.Fatal(err)
	}
	var got struct {
		Source  string
		Cleanup *audiocleanup.Settings `json:"audio_cleanup"`
	}
	if err = json.Unmarshal(payload, &got); err != nil || got.Source != prepared.WorkerSource || got.Cleanup == nil || got.Cleanup.Enabled {
		t.Fatalf("original recovery changed source: %s %v", payload, err)
	}
	retry.AudioCleanup.Enabled = true
	if err = repo.retryAudio(ctx, user, job.ID, retry); !errors.Is(err, errRetryConflict) {
		t.Fatalf("changed replay accepted: %v", err)
	}
	retry.RequestID = newID()
	if err = repo.retryAudio(ctx, user, job.ID, retry); !errors.Is(err, errRetryConflict) {
		t.Fatalf("duplicate active job accepted: %v", err)
	}
	if _, err = repo.Cancel(ctx, user, job.ID); err != nil {
		t.Fatal(err)
	}
	later := audioRetryInput{RequestID: newID(), AudioCleanup: &audiocleanup.Settings{Enabled: false}}
	if err = repo.retryAudio(ctx, user, job.ID, later); err != nil {
		t.Fatal(err)
	}
	if _, err = repo.Cancel(ctx, user, job.ID); err != nil {
		t.Fatal(err)
	}
	if err = repo.retryAudio(ctx, user, job.ID, audioRetryInput{RequestID: firstID, AudioCleanup: &audiocleanup.Settings{Enabled: false}}); err != nil {
		t.Fatalf("older replay failed: %v", err)
	}
	var status string
	if err = db.QueryRow("SELECT status FROM jobs WHERE id=$1", job.ID).Scan(&status); err != nil || status != "cancelled" {
		t.Fatalf("older request queued a new attempt: %s %v", status, err)
	}
	if err = db.QueryRow("SELECT credits FROM users WHERE id=$1", user).Scan(&credits); err != nil || credits != 100 {
		t.Fatalf("older request reserved credits twice: %d %v", credits, err)
	}
}
