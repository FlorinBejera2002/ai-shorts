package projects

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"sneepcut/backend-go/internal/testdb"
)

func TestFolderParentMustBelongToProject(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	user, otherUser := randomID(), randomID()
	project, otherProject, foreignProject := randomID(), randomID(), randomID()
	for _, id := range []string{user, otherUser} {
		if _, err := db.Exec(`INSERT INTO users(id,email,provider,credits,plan) VALUES($1,$2,'credentials',100,'free')`, id, id+"@example.invalid"); err != nil {
			t.Fatal(err)
		}
	}
	for _, pair := range [][2]string{{project, user}, {otherProject, user}, {foreignProject, otherUser}} {
		if _, err := db.Exec(`INSERT INTO jobs(id,user_id,source_type,status,progress,num_clips_requested,aspect_ratio,subtitle_style,include_brand,credits_charged) VALUES($1,$2,'upload','completed',100,5,'9:16','default',false,50)`, pair[0], pair[1]); err != nil {
			t.Fatal(err)
		}
	}
	repo := NewRepository(db, nil)
	local, err := repo.CreateFolder(ctx, user, project, FolderInput{Name: "Local"})
	if err != nil {
		t.Fatal(err)
	}
	for _, pair := range [][2]string{{otherProject, user}, {foreignProject, otherUser}} {
		foreign, err := repo.CreateFolder(ctx, pair[1], pair[0], FolderInput{Name: "Foreign"})
		if err != nil {
			t.Fatal(err)
		}
		parent := foreign["id"].(string)
		if _, err = repo.CreateFolder(ctx, user, project, FolderInput{Name: "Child", ParentID: &parent}); !errors.Is(err, sql.ErrNoRows) {
			t.Fatalf("cross-project create: got %v", err)
		}
		if err = repo.UpdateFolder(ctx, user, project, local["id"].(string), FolderInput{Name: "Local", ParentID: &parent}); !errors.Is(err, sql.ErrNoRows) {
			t.Fatalf("cross-project move: got %v", err)
		}
	}
	parent := local["id"].(string)
	if _, err = repo.CreateFolder(ctx, user, project, FolderInput{Name: "Valid child", ParentID: &parent}); err != nil {
		t.Fatalf("same-project parent rejected: %v", err)
	}
}
