package worker

import (
	"context"
	"errors"
	"testing"

	"sneepcut/backend-go/internal/jobs"
	"sneepcut/backend-go/internal/processing"
	"sneepcut/backend-go/internal/testdb"
)

func TestPostgresCompletionAndFailureOwnership(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	user := token()
	if _, err := db.Exec(`INSERT INTO users(id,email,provider,credits,plan) VALUES($1,$2,'credentials',100,'free')`, user, user+"@example.invalid"); err != nil {
		t.Fatal(err)
	}
	source := "https://youtube.com/watch?v=fixture"
	create := func() *Job {
		t.Helper()
		_, err := jobs.NewRepository(db).Create(ctx, user, []jobs.Prepared{{Input: jobs.CreateInput{Options: jobs.DefaultOptions(), SourceType: "youtube", SourceURL: &source}, WorkerSource: source}})
		if err != nil {
			t.Fatal(err)
		}
		job, err := NewRepository(db).Claim(ctx)
		if err != nil || job == nil {
			t.Fatalf("claim: %v %v", job, err)
		}
		return job
	}
	repo := NewRepository(db)
	job := create()
	result := processing.Result{SourceKey: "sources/fixture.mp4", Transcript: processing.Transcript{Text: "Test transcript"}, Clips: []processing.Clip{{Title: "Fixture", StorageKey: "clips/fixture.mp4", TikTokStorageKey: "clips/clean.mp4", ThumbnailKey: "clips/thumb.jpg", Duration: 5, End: 5, Resolution: "1080x1920", ContainsPlatformBadge: true, Metadata: map[string]any{"score_reason": "fixture", "suggested_hashtags": []string{"test"}}}}}
	stale := *job
	stale.Token = token()
	if err := repo.Complete(ctx, &stale, result); !errors.Is(err, ErrOwnership) {
		t.Fatalf("stale owner accepted: %v", err)
	}
	if err := repo.Complete(ctx, job, result); err != nil {
		t.Fatal(err)
	}
	var status, key, reason string
	var active bool
	if err := db.QueryRow(`SELECT status,processing_active FROM jobs WHERE id=$1`, job.ID).Scan(&status, &active); err != nil || status != "completed" || active {
		t.Fatalf("completion: %s %v %v", status, active, err)
	}
	if err := db.QueryRow(`SELECT file_storage_key,score_reason FROM clips WHERE job_id=$1`, job.ID).Scan(&key, &reason); err != nil || key != "clips/fixture.mp4" || reason != "fixture" {
		t.Fatalf("clip persistence: %s %s %v", key, reason, err)
	}
	failed := create()
	if err := repo.Fail(ctx, failed, "fixture failure"); err != nil {
		t.Fatal(err)
	}
	if err := repo.Fail(ctx, failed, "duplicate"); err == nil {
		t.Fatal("released ownership accepted")
	}
	var credits int
	if err := db.QueryRow(`SELECT credits FROM users WHERE id=$1`, user).Scan(&credits); err != nil || credits != 50 {
		t.Fatalf("refund: %d %v", credits, err)
	}
}
