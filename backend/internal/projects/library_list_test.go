package projects

import (
	"context"
	"testing"
)

func TestLibraryListRetainsClipsBeyondNewestHundredProjects(t *testing.T) {
	repo, user, oldestProject, clip := libraryFixture(t)
	if _, err := repo.db.Exec(`UPDATE jobs SET updated_at=now()-interval '1 day' WHERE id=$1`, oldestProject); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 100; i++ {
		if _, err := repo.db.Exec(`INSERT INTO jobs(id,user_id,source_type,status,progress,num_clips_requested,aspect_ratio,subtitle_style,include_brand,credits_charged) VALUES($1,$2,'upload','completed',100,1,'9:16','default',false,0)`, randomID(), user); err != nil {
			t.Fatal(err)
		}
	}
	result, err := repo.List(context.Background(), user)
	if err != nil {
		t.Fatal(err)
	}
	projects := result["projects"].([]map[string]any)
	if len(projects) != 101 {
		t.Fatalf("library dropped older projects: got %d want 101", len(projects))
	}
	oldest := projects[len(projects)-1]
	clips := oldest["clips"].([]map[string]any)
	if oldest["id"] != oldestProject || len(clips) != 1 || clips[0]["id"] != clip {
		t.Fatalf("oldest generated clip disappeared: %+v", oldest)
	}
}
