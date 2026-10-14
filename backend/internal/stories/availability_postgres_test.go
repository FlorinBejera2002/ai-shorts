package stories

import (
	"context"
	"errors"
	"sneepcut/backend-go/internal/audiocleanup"
	"sneepcut/backend-go/internal/story"
	"testing"
)

func TestUnavailableCleanupDoesNotQueueOrChargeAndCanBeDisabled(t *testing.T) {
	t.Setenv("AUDIO_CLEANUP_VERIFIED", "false")
	r, user, id, ids := fixture(t, 2)
	ctx := context.Background()
	options := story.DefaultOptions()
	options.AudioCleanup = &audiocleanup.Settings{Enabled: true}
	if err := r.Patch(ctx, user, id, Patch{Options: &options}); err != nil {
		t.Fatal(err)
	}
	if err := r.Queue(ctx, user, id, Generate{RequestID: newID(), AssetIDs: ids}); !errors.Is(err, audiocleanup.ErrUnavailable) {
		t.Fatal(err)
	}
	p, err := r.Get(ctx, user, id)
	if err != nil || credits(t, r, user) != 100 || p.Status != "draft" {
		t.Fatal("unavailable cleanup charged or changed state", p, err)
	}
	options.AudioCleanup.Enabled = false
	if err = r.Patch(ctx, user, id, Patch{Options: &options}); err != nil {
		t.Fatal(err)
	}
	if err = r.Queue(ctx, user, id, Generate{RequestID: newID(), AssetIDs: ids}); err != nil {
		t.Fatal("original recovery blocked", err)
	}
}
func TestVerifiedConfiguredCleanupCanQueue(t *testing.T) {
	t.Setenv("AUDIO_CLEANUP_VERIFIED", "true")
	t.Setenv("DEEPFILTER_PATH", "/synthetic/runtime")
	t.Setenv("DEEPFILTER_MODEL", "/synthetic/model")
	r, user, id, ids := fixture(t, 2)
	ctx := context.Background()
	options := story.DefaultOptions()
	options.AudioCleanup = &audiocleanup.Settings{Enabled: true}
	if err := r.Patch(ctx, user, id, Patch{Options: &options}); err != nil {
		t.Fatal(err)
	}
	if err := r.Queue(ctx, user, id, Generate{RequestID: newID(), AssetIDs: ids}); err != nil {
		t.Fatal(err)
	}
	if credits(t, r, user) != 90 {
		t.Fatal("incorrect configured cleanup reservation")
	}
}
