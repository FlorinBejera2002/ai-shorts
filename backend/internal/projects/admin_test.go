package projects

import (
	"context"
	"testing"
	"time"
)

func TestAdminCanRenameProjectsAndManageFolders(t *testing.T) {
	r, user, project, _ := libraryFixture(t)
	if _, err := r.db.Exec(`UPDATE users SET access_role='admin',credits=0 WHERE id=$1`, user); err != nil {
		t.Fatal(err)
	}
	var stamp time.Time
	if err := r.db.QueryRow(`SELECT updated_at FROM jobs WHERE id=$1`, project).Scan(&stamp); err != nil {
		t.Fatal(err)
	}
	name := "Admin project"
	if _, err := r.RenameConditional(context.Background(), user, project, randomID(), RenameInput{Name: &name, ExpectedUpdatedAt: stamp}); err != nil {
		t.Fatalf("admin project rename: %v", err)
	}
	state := inspect(t, r, user, project)
	if _, err := r.ChangeLibrary(context.Background(), user, randomID(), "folders.create", LibraryInput{ProjectID: project, ExpectedState: state.ExpectedState, Name: "Admin folder"}); err != nil {
		t.Fatalf("admin library update: %v", err)
	}
	state = inspect(t, r, user, project)
	if _, err := r.db.Exec(`UPDATE users SET access_role='viewer' WHERE id=$1`, user); err != nil {
		t.Fatal(err)
	}
	if _, err := r.ChangeLibrary(context.Background(), user, randomID(), "folders.create", LibraryInput{ProjectID: project, ExpectedState: state.ExpectedState, Name: "Forbidden"}); err == nil {
		t.Fatal("viewer library update accepted")
	}
}
