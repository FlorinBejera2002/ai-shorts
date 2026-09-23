package clips

import (
	"context"
	"encoding/json"
	"errors"
	"sneepcut/backend-go/internal/testdb"
	"testing"
)

func TestAgentMetadataPreservesOmittedFieldsReplaysAndFencesUndo(t *testing.T) {
	db := testdb.Open(t)
	user, _, id := seedClip(t, db)
	ctx := context.Background()
	h := New(db, nil, nil, Config{})
	if _, err := db.Exec(`UPDATE clips SET hook_text='Original hook',transcript_text='Original transcript' WHERE id=$1`, id); err != nil {
		t.Fatal(err)
	}
	clip, err := h.AgentRead(ctx, user, id)
	if err != nil {
		t.Fatal(err)
	}
	request := newID()
	raw := json.RawMessage(`{"title":" Updated title "}`)
	result, err := h.AgentMutate(ctx, user, request, id, clip.ExpectedState, "metadata", raw)
	if err != nil || result.Clip == nil || result.Undo == nil {
		t.Fatalf("metadata %+v %v", result, err)
	}
	if result.Clip.Title != "Updated title" || result.Clip.Transcript != "Original transcript" {
		t.Fatalf("lost omitted fields %+v", result.Clip)
	}
	replay, err := h.AgentMutate(ctx, user, request, id, clip.ExpectedState, "metadata", raw)
	if err != nil || replay.Clip.ExpectedState != result.Clip.ExpectedState {
		t.Fatalf("replay %+v %v", replay, err)
	}
	if _, err = h.AgentMutate(ctx, user, request, id, clip.ExpectedState, "metadata", json.RawMessage(`{"title":"Other"}`)); err == nil {
		t.Fatal("changed request reused")
	}
	if _, err = h.AgentMutate(ctx, newID(), newID(), id, result.Clip.ExpectedState, "metadata", raw); err == nil {
		t.Fatal("foreign update")
	}
	undoRaw, _ := json.Marshal(result.Undo.Metadata)
	restored, err := h.AgentMutate(ctx, user, newID(), id, result.Undo.ExpectedState, "metadata", undoRaw)
	if err != nil || restored.Clip.Title != "Fixture" {
		t.Fatalf("restore %+v %v", restored, err)
	}
	if _, err = h.AgentMutate(ctx, user, newID(), id, result.Undo.ExpectedState, "metadata", undoRaw); !errors.Is(err, ErrAgentConflict) {
		t.Fatalf("stale undo %v", err)
	}
}

func TestAgentDeleteExactPreviewStaleOwnershipAndIdempotence(t *testing.T) {
	db := testdb.Open(t)
	user, job, id := seedClip(t, db)
	ctx := context.Background()
	storage := &fakeMedia{}
	h := New(db, nil, storage, Config{})
	clip, err := h.AgentRead(ctx, user, id)
	if err != nil {
		t.Fatal(err)
	}
	preview, err := h.AgentDeletePreview(ctx, user, id, clip.ExpectedState)
	if err != nil || preview.ID != id {
		t.Fatalf("preview %+v %v", preview, err)
	}
	if _, err = h.AgentMutate(ctx, newID(), newID(), id, clip.ExpectedState, "delete", nil); err == nil {
		t.Fatal("foreign delete")
	}
	if _, err = db.Exec(`UPDATE clips SET title='Changed' WHERE id=$1`, id); err != nil {
		t.Fatal(err)
	}
	if _, err = h.AgentMutate(ctx, user, newID(), id, clip.ExpectedState, "delete", nil); !errors.Is(err, ErrAgentConflict) {
		t.Fatalf("stale deletion %v", err)
	}
	if len(storage.keys) > 0 || len(storage.prefixes) > 0 {
		t.Fatal("stale action deleted media")
	}
	clip, err = h.AgentRead(ctx, user, id)
	if err != nil {
		t.Fatal(err)
	}
	request := newID()
	result, err := h.AgentMutate(ctx, user, request, id, clip.ExpectedState, "delete", nil)
	if err != nil || !result.Deleted {
		t.Fatalf("delete %+v %v", result, err)
	}
	count := len(storage.keys) + len(storage.prefixes)
	result, err = h.AgentMutate(ctx, user, request, id, clip.ExpectedState, "delete", nil)
	if err != nil || !result.Deleted || count != len(storage.keys)+len(storage.prefixes) {
		t.Fatalf("delete replay %+v %v", result, err)
	}
	for _, key := range storage.keys {
		if key == "sources/"+job+"/source.mp4" {
			t.Fatal("deleted original source")
		}
	}
	if _, err = h.AgentRead(ctx, user, id); err == nil {
		t.Fatal("deleted clip remains")
	}
}

func TestAgentDeleteStorageFailurePreservesRecord(t *testing.T) {
	db := testdb.Open(t)
	user, _, id := seedClip(t, db)
	ctx := context.Background()
	h := New(db, nil, &fakeMedia{fail: true}, Config{})
	clip, err := h.AgentRead(ctx, user, id)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = h.AgentMutate(ctx, user, newID(), id, clip.ExpectedState, "delete", nil); err == nil {
		t.Fatal("reported deletion despite failed media cleanup")
	}
	if _, err = h.AgentRead(ctx, user, id); err != nil {
		t.Fatal("record disappeared on cleanup failure", err)
	}
	var receipts int
	if err = db.QueryRow(`SELECT count(*) FROM agent_action_receipts`).Scan(&receipts); err != nil || receipts != 0 {
		t.Fatalf("false success receipt %d %v", receipts, err)
	}
}
