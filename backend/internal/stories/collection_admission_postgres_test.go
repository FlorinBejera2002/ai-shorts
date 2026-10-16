package stories

import (
	"context"
	"errors"
	"testing"
)

func TestLargeClipAdmissionKeepsResourceBudgetsAndIdempotency(t *testing.T) {
	r, user, id, ids := fixture(t, 200)
	ctx := context.Background()
	p, err := r.Get(ctx, user, id)
	if err != nil || len(p.Assets) != 200 {
		t.Fatal(err, len(p.Assets))
	}
	// Retries stay idempotent even for large collections.
	if _, err = r.AddAsset(ctx, user, id, p.Assets[0]); err != nil {
		t.Fatal(err)
	}
	extra := p.Assets[0]
	extra.ID = newID()
	extra.Hash = "extra-201"
	extra.Key = "uploads/" + user + "/" + newID() + ".mov"
	extra.Order = 200
	if _, err = r.AddAsset(ctx, user, id, extra); err != nil {
		t.Fatalf("201st clip rejected: %v", err)
	}
	if _, err = r.AddAsset(ctx, user, id, extra); err != nil {
		t.Fatal("retry failed", err)
	}
	p, err = r.Get(ctx, user, id)
	if err != nil || len(p.Assets) != 201 {
		t.Fatal(err, len(p.Assets))
	}
	overBudget := extra
	overBudget.ID, overBudget.Hash = newID(), "oversized"
	overBudget.Size = r.limits.MaxTotalBytes
	if _, err = r.AddAsset(ctx, user, id, overBudget); !errors.Is(err, ErrInvalid) {
		t.Fatalf("resource budget bypassed: %v", err)
	}
	ids = append(ids, extra.ID)
	if err = r.Queue(ctx, user, id, Generate{RequestID: newID(), AssetIDs: ids}); err != nil {
		t.Fatal("large complete manifest cannot generate", err)
	}
}
