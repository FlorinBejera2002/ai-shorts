package stories

import (
	"context"
	"fmt"
	"testing"

	"sneepcut/backend-go/internal/story"
)

// Requires the dedicated sneepcut_integration_test database; testdb skips otherwise.
func TestMultiClipVersionPersistsOneLibraryRowPerOutput(t *testing.T) {
	r, user, id, ids := fixture(t, 5)
	ctx := context.Background()
	e := queue(t, r, user, id, ids)
	chosen := version(id, 1)
	chosen.Outputs = []story.ClipOutput{
		{ID: "v1-0", Index: 0, Key: chosen.Output.Key, DurationSeconds: 4, AspectRatio: "9:16", Size: 100, Resolution: "720x1280", Title: "First clip"},
		{ID: "v1-1", Index: 1, Key: fmt.Sprintf("clips/%s/story/v1-clip-2.mp4", id), DurationSeconds: 31, AspectRatio: "9:16", Size: 120, Resolution: "720x1280", Title: "Second clip", TranscriptText: "second words"},
	}
	if err := e.SaveVersion(ctx, chosen); err != nil {
		t.Fatal(err)
	}
	if err := e.finish(ctx, story.Result{Best: chosen}, nil); err != nil {
		t.Fatal(err)
	}
	var rows int
	if err := r.db.QueryRow(`SELECT count(*) FROM clips WHERE story_project_id=$1`, id).Scan(&rows); err != nil || rows != 2 {
		t.Fatalf("library rows = %d, err %v; want one per output", rows, err)
	}
	p, err := r.Get(ctx, user, id)
	if err != nil {
		t.Fatal(err)
	}
	if len(p.Versions) != 1 || len(p.Versions[0].Outputs) != 2 {
		t.Fatalf("versions = %+v", p.Versions)
	}
	first, second := p.Versions[0].Outputs[0], p.Versions[0].Outputs[1]
	if first.ClipID == "" || second.ClipID == "" || first.ClipID == second.ClipID {
		t.Fatalf("clip identities = %q, %q", first.ClipID, second.ClipID)
	}
	if p.Versions[0].ClipID != first.ClipID {
		t.Fatalf("version clip id %q does not match output 0 %q", p.Versions[0].ClipID, first.ClipID)
	}
	if err := r.db.QueryRow(`SELECT id::text FROM clips WHERE story_project_id=$1 AND story_output_index=1`, id).Scan(new(string)); err != nil {
		t.Fatalf("output 1 row missing: %v", err)
	}
}
