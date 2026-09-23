package stories

import (
	"context"
	"errors"
	"testing"

	"sneepcut/backend-go/internal/story"
)

func narrationAsset(user string) story.Asset {
	id := newID()
	return story.Asset{ID: id, Kind: "narration", Name: "My voice.webm", Key: "uploads/" + user + "/" + id + ".webm", Hash: id, Size: 2048, Duration: 12, HasAudio: true, Order: -1, Mapping: story.TimeMap{Rate: 1, Duration: 12}}
}

func enableNarration(t *testing.T, r *Repository, user, id string) {
	t.Helper()
	options := story.DefaultOptions()
	options.Narration = true
	if err := r.Patch(context.Background(), user, id, Patch{Options: &options}); err != nil {
		t.Fatal(err)
	}
}

func TestNarrationQueueRequiresCompleteAssetsBeforeCharging(t *testing.T) {
	r, user, id, ids := fixture(t, 2)
	ctx := context.Background()
	a := narrationAsset(user)
	if _, err := r.AddAsset(ctx, user, id, a); !errors.Is(err, ErrInvalid) {
		t.Fatal("normal mode accepted voice", err)
	}
	enableNarration(t, r, user, id)
	if err := r.Queue(ctx, user, id, Generate{RequestID: newID(), AssetIDs: ids}); !errors.Is(err, ErrInvalid) {
		t.Fatal("narration mode queued without voice", err)
	}
	if credits(t, r, user) != 100 {
		t.Fatal("invalid narration charged credits")
	}
	if _, err := r.AddAsset(ctx, user, id, a); err != nil {
		t.Fatal(err)
	}
	if err := r.Queue(ctx, user, id, Generate{RequestID: newID(), AssetIDs: ids}); !errors.Is(err, ErrInvalid) {
		t.Fatal("manifest omitted narration", err)
	}
	ids = append(ids, a.ID)
	in := Generate{RequestID: newID(), AssetIDs: ids}
	for range 2 {
		if err := r.Queue(ctx, user, id, in); err != nil {
			t.Fatal(err)
		}
	}
	if credits(t, r, user) != 90 {
		t.Fatal("narration was not charged exactly once")
	}
	e, err := r.Claim(ctx)
	if err != nil || e == nil || !e.Input.Options.Narration || len(e.Input.Assets) != 3 {
		t.Fatal("voice missing from durable worker request", err)
	}
	if _, err = r.AddOrReplaceAsset(ctx, user, id, narrationAsset(user), a.ID); !errors.Is(err, ErrConflict) {
		t.Fatal("replaced active voice", err)
	}
}

func TestNarrationAtomicReplacementAndDraftModeGuards(t *testing.T) {
	r, user, id, ids := fixture(t, 1)
	ctx := context.Background()
	enableNarration(t, r, user, id)
	a := narrationAsset(user)
	if _, err := r.AddAsset(ctx, user, id, a); err != nil {
		t.Fatal(err)
	}
	bad := narrationAsset(user)
	bad.Duration = story.MaxNarrationSeconds + 1
	if _, err := r.AddOrReplaceAsset(ctx, user, id, bad, a.ID); !errors.Is(err, ErrInvalid) {
		t.Fatal("oversized replacement accepted", err)
	}
	p, err := r.Get(ctx, user, id)
	if err != nil || len(p.Assets) != 2 {
		t.Fatal("failed replacement removed source", err)
	}
	if _, err = r.AddAsset(ctx, user, id, narrationAsset(user)); !errors.Is(err, ErrConflict) {
		t.Fatal("two narrations accepted", err)
	}
	options := story.DefaultOptions()
	if err = r.Patch(ctx, user, id, Patch{Options: &options}); !errors.Is(err, ErrInvalid) {
		t.Fatal("hid saved voice by switching modes", err)
	}
	if err = r.Patch(ctx, user, id, Patch{Assets: []AssetEdit{{ID: a.ID, Role: "auto", Include: "excluded"}}}); err == nil {
		t.Fatal("excluded narration with source edit")
	}
	replacement := narrationAsset(user)
	if _, err = r.AddOrReplaceAsset(ctx, user, id, replacement, ids[0]); !errors.Is(err, ErrInvalid) {
		t.Fatal("replaced footage with voice", err)
	}
	if _, err = r.AddOrReplaceAsset(ctx, user, id, replacement, newID()); !errors.Is(err, ErrConflict) {
		t.Fatal("stale replacement accepted", err)
	}
	for range 2 {
		if _, err = r.AddOrReplaceAsset(ctx, user, id, replacement, a.ID); err != nil {
			t.Fatal("replacement retry", err)
		}
	}
	p, err = r.Get(ctx, user, id)
	if err != nil || len(p.Assets) != 2 {
		t.Fatal(p, err)
	}
	for _, asset := range p.Assets {
		if asset.ID == a.ID {
			t.Fatal("old registration survived replacement")
		}
	}
	if err = r.RemoveAsset(ctx, user, id, replacement.ID); err != nil {
		t.Fatal(err)
	}
	if err = r.Patch(ctx, user, id, Patch{Options: &options}); err != nil {
		t.Fatal(err)
	}
	if credits(t, r, user) != 100 {
		t.Fatal("draft operations charged")
	}
}

func TestNarrationHasIndependentSlotAndNeedsIncludedFootage(t *testing.T) {
	r, user, id, _ := fixture(t, story.DefaultLimits().MaxFiles)
	ctx := context.Background()
	enableNarration(t, r, user, id)
	if _, err := r.AddAsset(ctx, user, id, narrationAsset(user)); err != nil {
		t.Fatal("20 videos must leave space for narration", err)
	}
	empty := newID()
	options := story.DefaultOptions()
	options.Narration = true
	if err := r.Create(ctx, user, empty, options); err != nil {
		t.Fatal(err)
	}
	a := narrationAsset(user)
	if _, err := r.AddAsset(ctx, user, empty, a); err != nil {
		t.Fatal("record-first flow failed", err)
	}
	if err := r.Queue(ctx, user, empty, Generate{RequestID: newID(), AssetIDs: []string{a.ID}}); !errors.Is(err, ErrInvalid) {
		t.Fatal("narration queued without footage", err)
	}
}
