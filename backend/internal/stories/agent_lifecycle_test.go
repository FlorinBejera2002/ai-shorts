package stories

import (
	"context"
	"errors"
	"sneepcut/backend-go/internal/story"
	"testing"
)

type lifecycleMedia struct {
	cleanupMedia
	exists bool
}

func (m *lifecycleMedia) Exists(context.Context, string) (bool, error) { return m.exists, nil }

func TestAgentRollbackOwnsVersionPreservesOptionsAndReplays(t *testing.T) {
	r, user, id, ids := fixture(t, 5)
	ctx := context.Background()
	e := queue(t, r, user, id, ids)
	original, newer := story.DefaultOptions(), story.DefaultOptions()
	original.AspectRatio = "1:1"
	newer.AspectRatio = "16:9"
	v1, v2 := version(id, 1), version(id, 2)
	v1.RenderOptions = &original
	v2.RenderOptions = &newer
	for _, v := range []story.Version{v1, v2} {
		if err := e.SaveVersion(ctx, v); err != nil {
			t.Fatal(err)
		}
	}
	if err := e.finish(ctx, story.Result{Best: v2}, nil); err != nil {
		t.Fatal(err)
	}
	h := &Handler{repo: r, media: &lifecycleMedia{exists: true}}
	state, err := r.AgentState(ctx, user, id)
	if err != nil {
		t.Fatal(err)
	}
	request := newID()
	input := LifecycleInput{ID: id, ExpectedState: state, Version: 1}
	value, err := h.AgentLifecycle(ctx, user, request, "stories.rollback", input)
	if err != nil || value.CurrentVersion != 1 || value.Undo == nil {
		t.Fatalf("rollback %+v %v", value, err)
	}
	p, err := r.Get(ctx, user, id)
	if err != nil || p.Options.AspectRatio != "1:1" {
		t.Fatalf("options %+v %v", p.Options, err)
	}
	replay, err := h.AgentLifecycle(ctx, user, request, "stories.rollback", input)
	if err != nil || replay.ExpectedState != value.ExpectedState {
		t.Fatalf("replay %+v %v", replay, err)
	}
	if _, err = h.AgentLifecycle(ctx, newID(), newID(), "stories.rollback", input); err == nil {
		t.Fatal("foreign rollback")
	}
	if _, err = h.AgentLifecycle(ctx, user, newID(), "stories.rollback", input); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale rollback %v", err)
	}
	undo, err := h.AgentLifecycle(ctx, user, newID(), "stories.rollback", *value.Undo)
	if err != nil || undo.CurrentVersion != 2 {
		t.Fatalf("undo %+v %v", undo, err)
	}
	p, err = r.Get(ctx, user, id)
	if err != nil || p.Options.AspectRatio != "16:9" {
		t.Fatalf("restored options %+v %v", p.Options, err)
	}
	h.media = &lifecycleMedia{exists: false}
	input.ExpectedState = undo.ExpectedState
	if _, err = h.AgentLifecycle(ctx, user, newID(), "stories.rollback", input); err == nil {
		t.Fatal("promoted missing physical version")
	}
}

func TestAgentStoryDeleteReplaysPartialFailureAndFencesOtherActions(t *testing.T) {
	r, user, id, _ := fixture(t, 5)
	ctx := context.Background()
	storage := &lifecycleMedia{cleanupMedia: cleanupMedia{fail: true}, exists: true}
	h := &Handler{repo: r, media: storage}
	state, err := r.AgentState(ctx, user, id)
	if err != nil {
		t.Fatal(err)
	}
	request := newID()
	input := LifecycleInput{ID: id, ExpectedState: state}
	preview, err := h.AgentLifecyclePreview(ctx, user, input)
	if err != nil || preview["story_id"] != id {
		t.Fatalf("preview %+v %v", preview, err)
	}
	if _, err = h.AgentLifecycle(ctx, newID(), newID(), "stories.delete", input); err == nil {
		t.Fatal("foreign delete")
	}
	value, err := h.AgentLifecycle(ctx, user, request, "stories.delete", input)
	if err == nil || !value.Pending || value.Deleted {
		t.Fatalf("partial cleanup %+v %v", value, err)
	}
	p, err := r.Get(ctx, user, id)
	if err != nil || p.Status != "deleting" {
		t.Fatalf("fence %+v %v", p, err)
	}
	if _, err = h.AgentLifecycle(ctx, user, newID(), "stories.delete", input); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale new deletion %v", err)
	}
	storage.fail = false
	value, err = h.AgentLifecycle(ctx, user, request, "stories.delete", input)
	if err != nil || !value.Deleted || value.Pending {
		t.Fatalf("resume %+v %v", value, err)
	}
	count := len(storage.prefixes)
	value, err = h.AgentLifecycle(ctx, user, request, "stories.delete", input)
	if err != nil || !value.Deleted || len(storage.prefixes) != count {
		t.Fatalf("duplicate %+v %v", value, err)
	}
	if _, err = r.Get(ctx, user, id); err == nil {
		t.Fatal("story still exists")
	}
	for _, prefix := range storage.prefixes {
		if prefix == "uploads/"+user+"/" {
			t.Fatal("deleted original uploads")
		}
	}
}

func TestAgentRemoveDraftAssetIsOwnedStaleAndIdempotent(t *testing.T) {
	r, user, id, ids := fixture(t, 5)
	ctx := context.Background()
	h := &Handler{repo: r}
	state, err := r.AgentState(ctx, user, id)
	if err != nil {
		t.Fatal(err)
	}
	request := newID()
	input := LifecycleInput{ID: id, ExpectedState: state, AssetID: ids[0]}
	result, err := h.AgentLifecycle(ctx, user, request, "stories.remove_asset", input)
	if err != nil || result.RemovedAsset != ids[0] {
		t.Fatalf("remove %+v %v", result, err)
	}
	if _, err = h.AgentLifecycle(ctx, user, request, "stories.remove_asset", input); err != nil {
		t.Fatal(err)
	}
	input.AssetID = ids[1]
	if _, err = h.AgentLifecycle(ctx, user, newID(), "stories.remove_asset", input); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale removal %v", err)
	}
	p, err := r.Get(ctx, user, id)
	if err != nil || len(p.Assets) != 4 {
		t.Fatalf("assets %+v %v", p.Assets, err)
	}
}
