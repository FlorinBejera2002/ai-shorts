package clips

import (
	"context"
	"encoding/json"
	"testing"

	"sneepcut/backend-go/internal/testdb"
)

func TestAdminCanUpdateClipMetadataAndQueueEdits(t *testing.T) {
	db := testdb.Open(t)
	user, _, id := seedClip(t, db)
	if _, err := db.Exec(`UPDATE users SET access_role='admin',credits=0 WHERE id=$1`, user); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	h := New(db, nil, &fakeMedia{}, Config{})
	clip, err := h.AgentRead(ctx, user, id)
	if err != nil {
		t.Fatal(err)
	}
	result, err := h.AgentMutate(ctx, user, newID(), id, clip.ExpectedState, "metadata", json.RawMessage(`{"title":"Admin title"}`))
	if err != nil || result.Clip == nil || result.Clip.Title != "Admin title" {
		t.Fatalf("admin clip metadata: %+v %v", result, err)
	}
	if _, err = h.AgentEdit(ctx, user, newID(), id, result.Clip.ExpectedState, "trim", json.RawMessage(`{"start_time":1,"end_time":8}`)); err != nil {
		t.Fatalf("admin clip edit: %v", err)
	}
}
