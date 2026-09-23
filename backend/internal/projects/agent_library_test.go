package projects

import (
	"context"
	"database/sql"
	"errors"
	"sneepcut/backend-go/internal/agentaction"
	"sneepcut/backend-go/internal/testdb"
	"sync"
	"testing"
)

func libraryFixture(t *testing.T) (*Repository, string, string, string) {
	t.Helper()
	db := testdb.Open(t)
	user, project, clip := randomID(), randomID(), randomID()
	for _, q := range []struct {
		sql  string
		args []any
	}{
		{`INSERT INTO users(id,email,provider,credits,plan) VALUES($1,$2,'credentials',100,'free')`, []any{user, user + "@example.invalid"}},
		{`INSERT INTO jobs(id,user_id,source_type,status,progress,num_clips_requested,aspect_ratio,subtitle_style,include_brand,credits_charged) VALUES($1,$2,'upload','completed',100,5,'9:16','default',false,50)`, []any{project, user}},
		{`INSERT INTO clips(id,user_id,job_id,title,start_time,end_time,duration,file_path,resolution,viral_score,file_size,aspect_ratio,has_subtitles) VALUES($1,$2,$3,'Fixture',0,10,10,'fixture.mp4','1080x1920',8,1024,'9:16',false)`, []any{clip, user, project}},
	} {
		if _, err := db.Exec(q.sql, q.args...); err != nil {
			t.Fatal(err)
		}
	}
	return NewRepository(db, nil), user, project, clip
}
func inspect(t *testing.T, r *Repository, user, project string) LibrarySnapshot {
	t.Helper()
	s, err := r.InspectLibrary(context.Background(), user, project)
	if err != nil {
		t.Fatal(err)
	}
	return s
}
func TestLibraryReceiptsOwnershipAndStaleUndo(t *testing.T) {
	r, user, project, clip := libraryFixture(t)
	ctx := context.Background()
	initial := inspect(t, r, user, project)
	request := randomID()
	input := LibraryInput{ProjectID: project, ExpectedState: initial.ExpectedState, Name: "Folder"}
	created, err := r.ChangeLibrary(ctx, user, request, "folders.create", input)
	if err != nil {
		t.Fatal(err)
	}
	replay, err := r.ChangeLibrary(ctx, user, request, "folders.create", input)
	if err != nil || replay.ChangedID != created.ChangedID || len(replay.Folders) != 1 {
		t.Fatalf("replay %+v %v", replay, err)
	}
	changed := input
	changed.Name = "Different"
	if _, err = r.ChangeLibrary(ctx, user, request, "folders.create", changed); !errors.Is(err, agentaction.ErrConflict) {
		t.Fatalf("changed replay %v", err)
	}
	if _, err = r.InspectLibrary(ctx, randomID(), project); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("other owner %v", err)
	}
	if err = r.MoveClip(ctx, user, project, clip, &created.ChangedID); err != nil {
		t.Fatal(err)
	}
	if _, err = r.ChangeLibrary(ctx, user, randomID(), created.UndoAction, *created.UndoInput); !errors.Is(err, ErrLibraryChanged) {
		t.Fatalf("undo erased newer membership: %v", err)
	}
	current := inspect(t, r, user, project)
	moved, err := r.ChangeLibrary(ctx, user, randomID(), "clips.move", LibraryInput{ProjectID: project, ID: clip, ExpectedState: current.ExpectedState})
	if err != nil {
		t.Fatal(err)
	}
	restored, err := r.ChangeLibrary(ctx, user, randomID(), moved.UndoAction, *moved.UndoInput)
	if err != nil || restored.Clips[0].FolderID == nil || *restored.Clips[0].FolderID != created.ChangedID {
		t.Fatalf("move undo %+v %v", restored, err)
	}
}
func TestLibraryDeletePromotesWithoutChangingSourceAndRejectsCycles(t *testing.T) {
	r, user, project, clip := libraryFixture(t)
	ctx := context.Background()
	parent, err := r.CreateFolder(ctx, user, project, FolderInput{Name: "Parent"})
	if err != nil {
		t.Fatal(err)
	}
	pid := parent["id"].(string)
	child, err := r.CreateFolder(ctx, user, project, FolderInput{Name: "Child", ParentID: &pid})
	if err != nil {
		t.Fatal(err)
	}
	cid := child["id"].(string)
	if err = r.UpdateFolder(ctx, user, project, pid, FolderInput{Name: "Parent", ParentID: &cid}); err == nil {
		t.Fatal("cycle allowed")
	}
	if err = r.MoveClip(ctx, user, project, clip, &pid); err != nil {
		t.Fatal(err)
	}
	state := inspect(t, r, user, project)
	deleted, err := r.ChangeLibrary(ctx, user, randomID(), "folders.delete", LibraryInput{ProjectID: project, ID: pid, ExpectedState: state.ExpectedState})
	if err != nil {
		t.Fatal(err)
	}
	if len(deleted.Folders) != 1 || deleted.Folders[0].ParentID != nil || deleted.Clips[0].FolderID != nil {
		t.Fatalf("promotion failed %+v", deleted)
	}
	other := randomID()
	if _, err = r.db.Exec(`INSERT INTO jobs(id,user_id,source_type,status,progress,num_clips_requested,aspect_ratio,subtitle_style,include_brand,credits_charged) VALUES($1,$2,'upload','completed',100,5,'9:16','default',false,50)`, other, user); err != nil {
		t.Fatal(err)
	}
	if err = r.MoveClip(ctx, user, other, clip, nil); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("manual source job changed: %v", err)
	}
	var actual string
	if err = r.db.QueryRow(`SELECT job_id FROM clips WHERE id=$1`, clip).Scan(&actual); err != nil || actual != project {
		t.Fatalf("source %s %v", actual, err)
	}
}
func TestConcurrentFolderMutationsUseOneInspectedState(t *testing.T) {
	r, user, project, _ := libraryFixture(t)
	state := inspect(t, r, user, project)
	results := make(chan error, 2)
	var group sync.WaitGroup
	for _, name := range []string{"One", "Two"} {
		group.Add(1)
		go func(name string) {
			defer group.Done()
			_, err := r.ChangeLibrary(context.Background(), user, randomID(), "folders.create", LibraryInput{ProjectID: project, ExpectedState: state.ExpectedState, Name: name})
			results <- err
		}(name)
	}
	group.Wait()
	close(results)
	success, conflict := 0, 0
	for err := range results {
		if err == nil {
			success++
		} else if errors.Is(err, ErrLibraryChanged) {
			conflict++
		} else {
			t.Fatal(err)
		}
	}
	if success != 1 || conflict != 1 {
		t.Fatalf("success=%d conflict=%d", success, conflict)
	}
}
