package stories

import (
	"context"
	"errors"
	"sneepcut/backend-go/internal/story"
	"testing"
)

func TestTwoHundredClipAdmissionPreservesExistingLargerProjects(t *testing.T) {
	r, user, id, ids := fixture(t, 200)
	ctx := context.Background()
	p, err := r.Get(ctx, user, id)
	if err != nil || len(p.Assets) != 200 {
		t.Fatal(err, len(p.Assets))
	}
	// Retries stay idempotent at the cap.
	if _, err = r.AddAsset(ctx, user, id, p.Assets[0]); err != nil {
		t.Fatal(err)
	}
	extra := p.Assets[0]
	extra.ID = newID()
	extra.Hash = "extra-201"
	extra.Key = "uploads/" + user + "/" + newID() + ".mov"
	extra.Order = 200
	if _, err = r.AddAsset(ctx, user, id, extra); !errors.Is(err, ErrInvalid) {
		t.Fatalf("201st new clip accepted: %v", err)
	}
	// Simulate a pre-existing collection, never reduce or discard saved user data.
	if _, err = r.db.ExecContext(ctx, "INSERT INTO story_assets(project_id,id,hash,asset) VALUES($1,$2,$3,$4)", id, extra.ID, extra.Hash, encoded(extra)); err != nil {
		t.Fatal(err)
	}
	p, err = r.Get(ctx, user, id)
	if err != nil || len(p.Assets) != 201 {
		t.Fatal(err, len(p.Assets))
	}
	if err = story.ValidateAssets(p.Assets, story.DefaultLimits()); err != nil {
		t.Fatal("legacy assets cannot render", err)
	}
	ids = append(ids, extra.ID)
	if err = r.Queue(ctx, user, id, Generate{RequestID: newID(), AssetIDs: ids}); err != nil {
		t.Fatal("legacy complete manifest cannot generate", err)
	}
}
