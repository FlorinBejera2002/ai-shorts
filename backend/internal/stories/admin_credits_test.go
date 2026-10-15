package stories

import (
	"context"
	"errors"
	"testing"

	"sneepcut/backend-go/internal/story"
)

func TestAdministratorStoryFailureRetryAndCancellationDoNotMintCredits(t *testing.T) {
	r, user, id, ids := fixture(t, 1)
	ctx := context.Background()
	if _, err := r.db.Exec(`UPDATE users SET access_role='admin',credits=0 WHERE id=$1`, user); err != nil {
		t.Fatal(err)
	}
	input := Generate{RequestID: newID(), AssetIDs: ids}
	for range 2 {
		if err := r.Queue(ctx, user, id, input); err != nil {
			t.Fatal(err)
		}
	}
	var charge int
	if err := r.db.QueryRow(`SELECT credits_charged FROM jobs WHERE id=$1`, id).Scan(&charge); err != nil || charge != 0 {
		t.Fatalf("charge=%d err=%v", charge, err)
	}
	e, err := r.Claim(ctx)
	if err != nil || e == nil {
		t.Fatalf("claim=%v err=%v", e, err)
	}
	if err = e.finish(ctx, story.Result{}, errors.New("synthetic failure")); err != nil {
		t.Fatal(err)
	}
	if credits(t, r, user) != 0 {
		t.Fatal("failed free story minted a refund")
	}
	input.RequestID = newID()
	if err = r.Queue(ctx, user, id, input); err != nil {
		t.Fatal(err)
	}
	for range 2 {
		if err = r.Cancel(ctx, user, id); err != nil {
			t.Fatal(err)
		}
	}
	if credits(t, r, user) != 0 {
		t.Fatal("free cancellation minted a refund")
	}
	if _, err = r.db.Exec(`UPDATE users SET access_role='member',credits=20 WHERE id=$1`, user); err != nil {
		t.Fatal(err)
	}
	input.RequestID = newID()
	if err = r.Queue(ctx, user, id, input); err != nil {
		t.Fatal(err)
	}
	if credits(t, r, user) != 10 {
		t.Fatal("member retry did not reserve credits")
	}
	if _, err = r.db.Exec(`UPDATE users SET access_role='admin' WHERE id=$1`, user); err != nil {
		t.Fatal(err)
	}
	if err = r.Cancel(ctx, user, id); err != nil {
		t.Fatal(err)
	}
	if credits(t, r, user) != 20 {
		t.Fatal("promotion lost the historical paid refund")
	}
}
