package worker

import (
	"context"
	"errors"
	"sneepcut/backend-go/internal/jobs"
	"sneepcut/backend-go/internal/processing"
	"sneepcut/backend-go/internal/testdb"
	"testing"
)

func TestPostgresTransitionRecipeAndCompletion(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	user := token()
	if _, err := db.Exec(`INSERT INTO users(id,email,provider,credits,plan) VALUES($1,$2,'credentials',100,'free')`, user, user+"@example.invalid"); err != nil {
		t.Fatal(err)
	}
	source := "https://example.invalid/source"
	_, err := jobs.NewRepository(db).Create(ctx, user, []jobs.Prepared{{Input: jobs.CreateInput{Options: jobs.DefaultOptions(), SourceType: "youtube", SourceURL: &source}, WorkerSource: source}})
	if err != nil {
		t.Fatal(err)
	}
	repo := NewRepository(db)
	job, err := repo.Claim(ctx)
	if err != nil || job == nil {
		t.Fatalf("claim: %v", err)
	}
	state := processing.TransitionState{Recipe: processing.RenderInput{SourceKey: "sources/fixture.mp4", NaturalTransitions: true, Segments: []processing.Segment{{Start: 0, End: 2.2}, {Start: 4.2, End: 7}}, Transcript: processing.Transcript{Words: []processing.Word{{Text: "word", Start: 2, End: 2.4}}}}, Decisions: []processing.BoundaryDecision{{Index: 0, Strategy: "cut", Outgoing: 2.4, Incoming: 4.2, Score: .95}}}
	clip := processing.Clip{Title: "Retained title", StorageKey: "clips/old.mp4", TikTokStorageKey: "clips/old-clean.mp4", ThumbnailKey: "clips/old.jpg", Segments: []processing.Segment{{Start: 0, End: 2.4}, {Start: 4.2, End: 7}}, End: 7, Duration: 5.2, Resolution: "1080x1920", HasSubtitles: true, ContainsPlatformBadge: true, Metadata: map[string]any{"transition_state": state}}
	if err = repo.Complete(ctx, job, processing.Result{SourceKey: state.Recipe.SourceKey, Clips: []processing.Clip{clip}}); err != nil {
		t.Fatal(err)
	}
	var clipID string
	if err = db.QueryRow(`SELECT id FROM clips WHERE job_id=$1`, job.ID).Scan(&clipID); err != nil {
		t.Fatal(err)
	}
	reservation := token()
	if _, err = db.Exec(`UPDATE jobs SET active_edit_tasks=1,active_edit_token=$2,edit_deadline=now()+interval '1 hour' WHERE id=$1`, job.ID, reservation); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(`INSERT INTO edit_deliveries(id,job_id,clip_id,kind,task_id,reservation_token,payload,state) VALUES($1,$2,$3,'transition',$4,$5,'{}','pending')`, token(), job.ID, clipID, token(), reservation); err != nil {
		t.Fatal(err)
	}
	edit, err := repo.ClaimEdit(ctx)
	if err != nil || edit == nil {
		t.Fatalf("edit claim: %v", err)
	}
	input, err := repo.transitionRecipe(ctx, edit)
	if err != nil {
		t.Fatal(err)
	}
	if input.Segments[0].End != 2.2 || input.Reuse.Segments[0].End != 2.4 || len(input.Transcript.Words) != 1 {
		t.Fatal("recipe lost original boundaries or word timings")
	}
	clip.StorageKey = "clips/new.mp4"
	clip.TikTokStorageKey = "clips/new-clean.mp4"
	stale := *edit
	stale.Token = token()
	if err = repo.completeTransitions(ctx, &stale, clip); !errors.Is(err, ErrOwnership) {
		t.Fatalf("stale completion: %v", err)
	}
	if err = repo.completeTransitions(ctx, edit, clip); err != nil {
		t.Fatal(err)
	}
	var title, key, status string
	var subtitles, badge bool
	if err = db.QueryRow(`SELECT title,file_storage_key,has_subtitles,contains_platform_badge FROM clips WHERE id=$1`, clipID).Scan(&title, &key, &subtitles, &badge); err != nil {
		t.Fatal(err)
	}
	if title != "Retained title" || key != clip.StorageKey || !subtitles || !badge {
		t.Fatal("transition completion lost clip presentation")
	}
	if err = db.QueryRow(`SELECT state FROM edit_deliveries WHERE id=$1`, edit.ID).Scan(&status); err != nil || status != "completed" {
		t.Fatalf("edit not completed: %s %v", status, err)
	}
	for _, kind := range []string{"trim", "recut"} {
		t.Run(kind+" invalidates recipe", func(t *testing.T) {
			reservation := token()
			if _, err := db.Exec(`UPDATE clips SET transition_state='{}' WHERE id=$1`, clipID); err != nil {
				t.Fatal(err)
			}
			if _, err := db.Exec(`UPDATE jobs SET active_edit_tasks=1,active_edit_token=$2,edit_deadline=now()+interval '1 hour' WHERE id=$1`, job.ID, reservation); err != nil {
				t.Fatal(err)
			}
			if _, err := db.Exec(`INSERT INTO edit_deliveries(id,job_id,clip_id,kind,task_id,reservation_token,payload,state) VALUES($1,$2,$3,$4,$5,$6,'{}','pending')`, token(), job.ID, clipID, kind, token(), reservation); err != nil {
				t.Fatal(err)
			}
			edit, err := repo.ClaimEdit(ctx)
			if err != nil || edit == nil {
				t.Fatalf("claim: %v", err)
			}
			if err = repo.CompleteEdit(ctx, edit, clip, []orderedSegment{{Start: 0, End: 5, Order: 0}}); err != nil {
				t.Fatal(err)
			}
			var invalidated bool
			if err = db.QueryRow(`SELECT transition_state IS NULL FROM clips WHERE id=$1`, clipID).Scan(&invalidated); err != nil || !invalidated {
				t.Fatalf("manual edit retained stale recipe: %v", err)
			}
		})
	}
}
