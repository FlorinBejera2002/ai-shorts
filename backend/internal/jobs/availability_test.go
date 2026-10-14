package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"sneepcut/backend-go/internal/audiocleanup"
	"sneepcut/backend-go/internal/testdb"
	"testing"
)

func TestUnavailableAudioCleanupRejectsBeforeDatabaseWork(t *testing.T) {
	t.Setenv("AUDIO_CLEANUP_VERIFIED", "false")
	p := preparedJob()
	p.Input.AudioCleanup = &audiocleanup.Settings{Enabled: true}
	if _, err := NewRepository(nil).Create(context.Background(), "user", []Prepared{p}); !errors.Is(err, audiocleanup.ErrUnavailable) {
		t.Fatal(err)
	}
}
func TestPostgresUnavailableCleanupDoesNotChargeAndOriginalRetryWorks(t *testing.T) {
	t.Setenv("AUDIO_CLEANUP_VERIFIED", "true")
	t.Setenv("DEEPFILTER_PATH", "/synthetic/runtime")
	t.Setenv("DEEPFILTER_MODEL", "/synthetic/model")
	db := testdb.Open(t)
	repo := NewRepository(db)
	user := seedUser(t, db)
	ctx := context.Background()
	p := preparedJob()
	p.Input.AudioCleanup = &audiocleanup.Settings{Enabled: true}
	created, err := repo.Create(ctx, user, []Prepared{p})
	if err != nil {
		t.Fatal(err)
	}
	var job struct{ ID string }
	if err = json.Unmarshal(created[0], &job); err != nil {
		t.Fatal(err)
	}
	if _, err = repo.Cancel(ctx, user, job.ID); err != nil {
		t.Fatal(err)
	}
	t.Setenv("AUDIO_CLEANUP_VERIFIED", "false")
	if err = repo.retryAudio(ctx, user, job.ID, audioRetryInput{RequestID: newID()}); !errors.Is(err, audiocleanup.ErrUnavailable) {
		t.Fatal(err)
	}
	var credits int
	if err = db.QueryRow("SELECT credits FROM users WHERE id=$1", user).Scan(&credits); err != nil || credits != 100 {
		t.Fatalf("charged unavailable cleanup: %d %v", credits, err)
	}
	if err = repo.retryAudio(ctx, user, job.ID, audioRetryInput{RequestID: newID(), AudioCleanup: &audiocleanup.Settings{Enabled: false}}); err != nil {
		t.Fatal(err)
	}
}
