package projects

import (
	"context"
	"database/sql"
	"errors"
	"sneepcut/backend-go/internal/testdb"
	"testing"
	"time"
)

func TestConditionalRenameReplayUndoAndStaleEdits(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	user, other, id, request := randomID(), randomID(), randomID(), randomID()
	for _, uid := range []string{user, other} {
		if _, err := db.Exec(`INSERT INTO users(id,email,provider,credits,plan) VALUES($1,$2,'credentials',100,'free')`, uid, uid+"@example.invalid"); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.Exec(`INSERT INTO jobs(id,user_id,source_type,status,progress,num_clips_requested,aspect_ratio,subtitle_style,include_brand,credits_charged) VALUES($1,$2,'upload','completed',100,5,'9:16','default',false,50)`, id, user); err != nil {
		t.Fatal(err)
	}
	var stamp time.Time
	if err := db.QueryRow(`SELECT updated_at FROM jobs WHERE id=$1`, id).Scan(&stamp); err != nil {
		t.Fatal(err)
	}
	repo := NewRepository(db, nil)
	name := "New name"
	in := RenameInput{Name: &name, ExpectedUpdatedAt: stamp}
	result, err := repo.RenameConditional(ctx, user, id, request, in)
	if err != nil {
		t.Fatal(err)
	}
	replay, err := repo.RenameConditional(ctx, user, id, request, in)
	if err != nil || !replay.UpdatedAt.Equal(result.UpdatedAt) {
		t.Fatalf("replay %+v %v", replay, err)
	}
	if _, err = repo.RenameConditional(ctx, other, id, randomID(), in); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("cross-owner rename %v", err)
	}
	if _, err = repo.RenameConditional(ctx, user, id, randomID(), in); !errors.Is(err, ErrProjectChanged) {
		t.Fatalf("stale rename %v", err)
	}
	undo := RenameInput{Name: result.PreviousName, ExpectedUpdatedAt: result.UpdatedAt, Restore: true}
	undone, err := repo.RenameConditional(ctx, user, id, randomID(), undo)
	if err != nil || undone.Name != nil {
		t.Fatalf("NULL original not restored %+v %v", undone, err)
	}
	manual := "Manual edit"
	if err = repo.UpdateProject(ctx, user, id, ProjectUpdate{Name: &manual}); err != nil {
		t.Fatal(err)
	}
	if _, err = repo.RenameConditional(ctx, user, id, randomID(), RenameInput{Name: &name, ExpectedUpdatedAt: undone.UpdatedAt}); !errors.Is(err, ErrProjectChanged) {
		t.Fatalf("later manual edit overwritten: %v", err)
	}
	if _, err = repo.RenameConditional(ctx, user, id, request, RenameInput{Name: &manual, ExpectedUpdatedAt: stamp}); !errors.Is(err, ErrProjectChanged) {
		t.Fatalf("conflicting replay accepted: %v", err)
	}
}
