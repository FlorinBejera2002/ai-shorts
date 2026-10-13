package stories

import (
	"context"
	"errors"
	"testing"

	"sneepcut/backend-go/internal/story"
)

func TestFailedFirstStoryCanBeCorrectedWithoutReuploading(t *testing.T) {
	r, user, id, ids := fixture(t, 2)
	ctx := context.Background()
	e := queue(t, r, user, id, ids)
	if err := e.finish(ctx, story.Result{}, errors.New("synthetic processing failure")); err != nil {
		t.Fatal(err)
	}
	before, err := r.Get(ctx, user, id)
	if err != nil || before.Status != "failed" || credits(t, r, user) != 100 {
		t.Fatalf("failed attempt was not refunded: %v %+v", err, before)
	}
	options := before.Options
	options.Brief = "Keep the original clip order and original sound."
	options.CaptionMode = "selective"
	if err = r.Patch(ctx, user, id, Patch{Options: &options}); err != nil {
		t.Fatal(err)
	}
	after, err := r.Get(ctx, user, id)
	if err != nil || after.Status != "draft" || len(after.Assets) != 2 || after.Options.CaptionMode != "selective" {
		t.Fatalf("recovery failed: %v %+v", err, after)
	}
	for i := range before.Assets {
		if before.Assets[i].ID != after.Assets[i].ID || before.Assets[i].Key != after.Assets[i].Key {
			t.Fatal("recovery changed a validated upload")
		}
	}
	if err = r.Queue(ctx, user, id, Generate{RequestID: newID(), AssetIDs: ids}); err != nil {
		t.Fatal(err)
	}
	if credits(t, r, user) != 90 {
		t.Fatal("retry did not reserve exactly one generation charge")
	}
}

func TestRecoveryRejectsActiveLeaseAndPreservesDraftOnInvalidOptions(t *testing.T) {
	r, user, id, ids := fixture(t, 1)
	ctx := context.Background()
	e := queue(t, r, user, id, ids)
	if err := r.Cancel(ctx, user, id); err != nil {
		t.Fatal(err)
	}
	options := story.DefaultOptions()
	if err := r.Patch(ctx, user, id, Patch{Options: &options}); !errors.Is(err, ErrConflict) {
		t.Fatalf("live worker inputs changed: %v", err)
	}
	if err := e.finish(ctx, story.Result{}, errors.New("cancelled")); err != nil {
		t.Fatal(err)
	}
	options.CaptionMode = "invalid"
	if err := r.Patch(ctx, user, id, Patch{Options: &options}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("invalid recovered settings accepted: %v", err)
	}
	p, err := r.Get(ctx, user, id)
	if err != nil || p.Status != "cancelled" || len(p.Assets) != 1 {
		t.Fatalf("invalid recovery was not atomic: %v %+v", err, p)
	}
}

func TestQueueRejectsPersistedCaptionConflictBeforeCharging(t *testing.T) {
	r, user, id, ids := fixture(t, 1)
	options := story.DefaultOptions()
	options.CaptionMode = "all"
	options.Brief = "Fără subtitrări. Păstrează sunetul original."
	if _, err := r.db.Exec(`UPDATE story_projects SET options=$2 WHERE id=$1`, id, encoded(options)); err != nil {
		t.Fatal(err)
	}
	err := r.Queue(context.Background(), user, id, Generate{RequestID: newID(), AssetIDs: ids})
	if !errors.Is(err, ErrInvalid) || credits(t, r, user) != 100 {
		t.Fatalf("invalid stored brief reserved a generation: %v", err)
	}
}

func TestPlannerClarificationRetainsSourcesAndReturnsCharge(t *testing.T) {
	r, user, id, ids := fixture(t, 1)
	e := queue(t, r, user, id, ids)
	question := "Should the final scene be included or excluded?"
	if err := e.finish(context.Background(), story.Result{}, &story.ClarificationError{Question: question}); err != nil {
		t.Fatal(err)
	}
	p, err := r.Get(context.Background(), user, id)
	if err != nil || p.Status != "failed" || p.Message != "Clarification needed: "+question || len(p.Assets) != 1 || credits(t, r, user) != 100 {
		t.Fatalf("clarification was lost or consumed sources/credits: %v %+v", err, p)
	}
}

func TestStoppedFirstAttemptCanReplaceSourcesDirectly(t *testing.T) {
	for _, action := range []string{"add", "remove"} {
		t.Run(action, func(t *testing.T) {
			r, user, id, ids := fixture(t, 2)
			ctx := context.Background()
			e := queue(t, r, user, id, ids)
			if err := r.Cancel(ctx, user, id); err != nil {
				t.Fatal(err)
			}
			asset := story.Asset{ID: newID(), Key: "uploads/" + user + "/replacement.mp4", Name: "Replacement", Hash: "replacement", Size: 100, Width: 320, Height: 180, Duration: 4, HasAudio: true}
			mutate := func() error {
				if action == "remove" {
					return r.RemoveAsset(ctx, user, id, ids[0])
				}
				_, err := r.AddAsset(ctx, user, id, asset)
				return err
			}
			if err := mutate(); !errors.Is(err, ErrConflict) {
				t.Fatalf("source changed while cancelled worker still owns its lease: %v", err)
			}
			if err := e.finish(ctx, story.Result{}, errors.New("cancelled")); err != nil {
				t.Fatal(err)
			}
			if err := mutate(); err != nil {
				t.Fatal(err)
			}
			p, err := r.Get(ctx, user, id)
			want := 3
			if action == "remove" {
				want = 1
			}
			if err != nil || p.Status != "draft" || len(p.Assets) != want {
				t.Fatalf("direct source recovery failed: %v %+v", err, p)
			}
		})
	}
}
