package stories

import (
	"context"
	"errors"
	"sneepcut/backend-go/internal/story"
	"testing"
)

func TestNoChangeImprovementRetainsReadyVersionAndExplainsOutcome(t *testing.T) {
	r, user, id, ids := fixture(t, 2)
	ctx := context.Background()
	e := queue(t, r, user, id, ids)
	v := version(id, 1)
	asset := e.Input.Assets[0]
	asset.Candidates = []story.Candidate{{ID: "candidate", SourceID: asset.ID, In: 0, Out: 4, Role: "b_roll"}}
	if err := e.SaveAsset(ctx, asset); err != nil {
		t.Fatal(err)
	}
	v.Timeline[0].Video.SourceID = asset.ID
	if err := e.SaveVersion(ctx, v); err != nil {
		t.Fatal(err)
	}
	if err := e.finish(ctx, story.Result{Best: v}, nil); err != nil {
		t.Fatal(err)
	}
	if err := r.Queue(ctx, user, id, Generate{RequestID: newID(), Action: "improve_transitions", Version: 1}); err != nil {
		t.Fatal(err)
	}
	edit, err := r.Claim(ctx)
	if err != nil || edit == nil {
		t.Fatal(err)
	}
	message := "No suitable cuts need smoothing; your previous video is retained."
	if err := edit.finish(ctx, story.Result{Best: v}, &story.NoChangeError{Message: message}); err != nil {
		t.Fatal(err)
	}
	result, err := r.Get(ctx, user, id)
	if err != nil || result.Status != "ready" || result.CurrentVersion != 1 || result.Message != message || result.OperationStatus != "unchanged" || credits(t, r, user) != 90 {
		t.Fatal("no-change misreported or previous result lost", result, err)
	}
}
func TestFailedImprovementPersistsFailureBesidePreviousReadyVersion(t *testing.T) {
	r, user, id, ids := fixture(t, 2)
	ctx := context.Background()
	e := queue(t, r, user, id, ids)
	v := version(id, 1)
	asset := e.Input.Assets[0]
	asset.Candidates = []story.Candidate{{ID: "candidate", SourceID: asset.ID, In: 0, Out: 4, Role: "b_roll"}}
	if err := e.SaveAsset(ctx, asset); err != nil {
		t.Fatal(err)
	}
	v.Timeline[0].Video.SourceID = asset.ID
	if err := e.SaveVersion(ctx, v); err != nil {
		t.Fatal(err)
	}
	if err := e.finish(ctx, story.Result{Best: v}, nil); err != nil {
		t.Fatal(err)
	}
	if err := r.Queue(ctx, user, id, Generate{RequestID: newID(), Action: "improve_transitions", Version: 1}); err != nil {
		t.Fatal(err)
	}
	edit, err := r.Claim(ctx)
	if err != nil || edit == nil {
		t.Fatal(err)
	}
	if err := edit.finish(ctx, story.Result{}, errors.New("synthetic renderer failure")); err != nil {
		t.Fatal(err)
	}
	p, err := r.Get(ctx, user, id)
	if err != nil || p.Status != "ready" || p.OperationStatus != "failed" || p.CurrentVersion != 1 || len(p.Versions) != 1 || credits(t, r, user) != 90 {
		t.Fatal("failure disappeared or previous render lost", p, err)
	}
	if err := r.Queue(ctx, user, id, Generate{RequestID: newID(), Action: "improve_transitions", Version: 1}); err != nil {
		t.Fatal(err)
	}
	p, err = r.Get(ctx, user, id)
	if err != nil || p.OperationStatus != "" || p.Status != "pending" {
		t.Fatal("retry retained stale outcome", p, err)
	}
}
