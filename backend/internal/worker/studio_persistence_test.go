package worker

import (
	"context"
	"testing"

	"sneepcut/backend-go/internal/jobs"
	"sneepcut/backend-go/internal/processing"
	"sneepcut/backend-go/internal/testdb"
)

func TestPostgresCanonicalClipAndRecutKeepPrimaryAndCleanArtifacts(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	owner := token()
	if _, err := db.Exec(`INSERT INTO users(id,email,provider,credits,plan) VALUES($1,$2,'credentials',100,'free')`, owner, owner+"@example.invalid"); err != nil {
		t.Fatal(err)
	}
	source := "https://example.invalid/fixture"
	if _, err := jobs.NewRepository(db).Create(ctx, owner, []jobs.Prepared{{Input: jobs.CreateInput{Options: jobs.DefaultOptions(), SourceType: "youtube", SourceURL: &source}, WorkerSource: source}}); err != nil {
		t.Fatal(err)
	}
	repo := NewRepository(db)
	job, err := repo.Claim(ctx)
	if err != nil || job == nil {
		t.Fatal(err)
	}
	clip := processing.Clip{Title: "Canonical clip", StorageKey: "clips/original.mp4", TikTokStorageKey: "clips/original-clean.mp4", StudioArtifactID: token(), TikTokStudioArtifactID: token(), Segments: []processing.Segment{{Start: 0, End: 2}}, Duration: 2, End: 2, Resolution: "320x180", Metadata: map[string]any{}}
	if err = repo.Complete(ctx, job, processing.Result{SourceKey: "sources/fixture.mp4", Clips: []processing.Clip{clip}}); err != nil {
		t.Fatal(err)
	}
	var clipID, primary, clean string
	if err = db.QueryRow(`SELECT id,studio_artifact_id::text,tiktok_studio_artifact_id::text FROM clips WHERE job_id=$1`, job.ID).Scan(&clipID, &primary, &clean); err != nil || primary != clip.StudioArtifactID || clean != clip.TikTokStudioArtifactID {
		t.Fatal("initial snapshot identity lost", err)
	}
	reservation := token()
	if _, err = db.Exec(`UPDATE jobs SET active_edit_tasks=1,active_edit_token=$2,edit_deadline=now()+interval '1 hour' WHERE id=$1`, job.ID, reservation); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(`INSERT INTO edit_deliveries(id,job_id,clip_id,kind,task_id,reservation_token,payload,state) VALUES($1,$2,$3,'recut',$4,$5,'{}','pending')`, token(), job.ID, clipID, token(), reservation); err != nil {
		t.Fatal(err)
	}
	edit, err := repo.ClaimEdit(ctx)
	if err != nil || edit == nil || edit.UserID != owner || edit.StudioArtifactID != clip.StudioArtifactID || edit.TikTokStudioArtifactID != clip.TikTokStudioArtifactID {
		t.Fatal("owned native edit context lost", err)
	}
	clip.StudioArtifactID, clip.TikTokStudioArtifactID = token(), token()
	clip.StorageKey, clip.TikTokStorageKey = "clips/recut.mp4", "clips/recut-clean.mp4"
	clip.PreviewStorageKey = "clips/recut-preview.mp4"
	clip.Metadata["transition_state"] = processing.TransitionState{Recipe: processing.RenderInput{SourceKey: "sources/fixture.mp4", Segments: clip.Segments}}
	if err = repo.CompleteEdit(ctx, edit, clip, []orderedSegment{{Start: 0, End: 2}}); err != nil {
		t.Fatal(err)
	}
	var key, preview string
	var recipe bool
	if err = db.QueryRow(`SELECT studio_artifact_id::text,tiktok_studio_artifact_id::text,tiktok_file_storage_key,preview_storage_key,transition_state IS NOT NULL FROM clips WHERE id=$1`, clipID).Scan(&primary, &clean, &key, &preview, &recipe); err != nil || primary != clip.StudioArtifactID || clean != clip.TikTokStudioArtifactID || key != clip.TikTokStorageKey || preview != clip.PreviewStorageKey || !recipe {
		t.Fatal("recut discarded native variants or recipe", err)
	}
}
