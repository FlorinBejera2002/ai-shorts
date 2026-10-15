package clips

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/testdb"
)

func TestStoryClipReadUsesExactVersionPreviewAndSourceIdentity(t *testing.T) {
	db := testdb.Open(t)
	user, _, clip := seedClip(t, db)
	project := newID()
	if _, err := db.Exec(`INSERT INTO story_projects(id,user_id,options,current_version) VALUES($1,$2,'{}',2)`, project, user); err != nil {
		t.Fatal(err)
	}
	for _, version := range []struct {
		number  int
		preview string
	}{{1, "clips/story/preview-one.mp4"}, {2, "clips/story/preview-two.mp4"}} {
		if _, err := db.Exec(`INSERT INTO story_versions(project_id,number,version) VALUES($1,$2,jsonb_build_object('output',jsonb_build_object('preview_key',$3::text)))`, project, version.number, version.preview); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.Exec(`UPDATE clips SET story_project_id=$2,story_version=1,file_storage_key='clips/story/hdr.mp4' WHERE id=$1`, clip, project); err != nil {
		t.Fatal(err)
	}
	h := New(db, fakeAuth{true}, &fakeMedia{}, Config{})
	record, err := h.readOne(context.Background(), user, clip)
	if err != nil {
		t.Fatal(err)
	}
	if record["story_project_id"] != project || record["story_version"] != float64(1) || !strings.Contains(record["preview_url"].(string), "preview-one.mp4") || !strings.Contains(record["file_url"].(string), "hdr.mp4") {
		t.Fatalf("source identity or exact-version preview changed: %#v", record)
	}
	if _, err := h.readOne(context.Background(), newID(), clip); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("another user read story media: %v", err)
	}
}
