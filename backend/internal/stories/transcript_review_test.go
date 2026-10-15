package stories

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"sync"
	"testing"

	"sneepcut/backend-go/internal/story"
)

func TestTranscriptInputRejectsForeignDuplicateAndOversizedSlotsWithoutPartialEdits(t *testing.T) {
	a := story.Asset{ID: "owned", Hash: strings.Repeat("a", 64), Duration: 2, Candidates: []story.Candidate{{ID: "owned-s1", SourceID: "owned", Out: 2}}}
	p := story.TranscriptProposal{ID: "proposal", CandidateID: "owned-s1", Out: 2, TimingVerified: true, Words: []story.Word{{Text: "Suggested", Start: .2, End: 1}}}
	a.TranscriptProposals = []story.TranscriptProposal{p}
	good := TranscriptReviewInput{AssetID: a.ID, ProposalID: p.ID, Words: []string{"Corrected"}}
	for _, bad := range [][]TranscriptReviewInput{{{AssetID: "foreign", ProposalID: p.ID, Words: good.Words}}, {good, good}, {good, {AssetID: a.ID, ProposalID: "stale", Words: good.Words}}, {{AssetID: a.ID, ProposalID: p.ID, Words: []string{"extra", "slots"}}}} {
		if _, err := approveTranscriptInputs([]story.Asset{a}, bad); err == nil {
			t.Fatal("invalid batch accepted")
		}
		if a.TranscriptProposals[0].Reviewed || a.TranscriptProposals[0].Words[0].Text != "Suggested" || len(a.TranscriptReviews) != 0 {
			t.Fatal("failed batch partially changed input")
		}
	}
}

func transcriptQueueFixture(t *testing.T) (*Repository, string, string, Generate) {
	t.Helper()
	r, user, id, ids := fixture(t, 1)
	ctx := context.Background()
	options := story.DefaultOptions()
	options.Captions = true
	options.CaptionMode = "all"
	if err := r.Patch(ctx, user, id, Patch{Options: &options}); err != nil {
		t.Fatal(err)
	}
	e := queue(t, r, user, id, ids)
	project, err := r.Get(ctx, user, id)
	if err != nil {
		t.Fatal(err)
	}
	a := project.Assets[0]
	a.Candidates = []story.Candidate{{ID: a.ID + "-s1", SourceID: a.ID, Out: 4, Role: "b_roll"}}
	p := story.TranscriptProposal{CandidateID: a.Candidates[0].ID, Out: 4, Words: []story.Word{{Text: "Wrong", Start: .2, End: 1}}, TimingVerified: true}
	p.ID = story.TranscriptProposalID(a, p)
	a.TranscriptProposals = []story.TranscriptProposal{p}
	if err = e.SaveAsset(ctx, a); err != nil {
		t.Fatal(err)
	}
	v := version(id, 1)
	v.Plan.Blocks[0].CandidateID = a.Candidates[0].ID
	v.Timeline[0].CandidateID = a.Candidates[0].ID
	v.Timeline[0].Video.SourceID = a.ID
	v.Timeline[0].Audio = &story.Interval{SourceID: a.ID, Out: 4}
	if err = e.SaveVersion(ctx, v); err != nil {
		t.Fatal(err)
	}
	if err = e.finish(ctx, story.Result{Best: v}, nil); err != nil {
		t.Fatal(err)
	}
	state, err := r.AgentState(ctx, user, id)
	if err != nil {
		t.Fatal(err)
	}
	return r, user, id, Generate{RequestID: newID(), Action: "review_transcript", Version: 1, ExpectedState: state, TranscriptReviews: []TranscriptReviewInput{{AssetID: a.ID, ProposalID: p.ID, Words: []string{"Corrected"}}}}
}

func TestTranscriptReviewQueueRejectsForeignOwnerAndStaleStateAtomically(t *testing.T) {
	r, user, id, in := transcriptQueueFixture(t)
	ctx := context.Background()
	if err := r.Queue(ctx, newID(), id, in); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("foreign owner: %v", err)
	}
	stale := in
	stale.ExpectedState = strings.Repeat("0", 64)
	if err := r.Queue(ctx, user, id, stale); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale state: %v", err)
	}
	invalid := in
	invalid.TranscriptReviews = append(append([]TranscriptReviewInput(nil), in.TranscriptReviews...), TranscriptReviewInput{AssetID: "foreign", ProposalID: "missing", Words: []string{"Injected"}})
	if err := r.Queue(ctx, user, id, invalid); !errors.Is(err, ErrInvalid) {
		t.Fatalf("invalid batch: %v", err)
	}
	project, err := r.Get(ctx, user, id)
	if err != nil {
		t.Fatal(err)
	}
	if project.Status == "pending" || project.Assets[0].TranscriptProposals[0].Reviewed || len(project.Assets[0].TranscriptReviews) != 0 || credits(t, r, user) != 90 {
		t.Fatal("failed review changed job, captions or credits")
	}
}

func TestTranscriptReviewQueueConcurrentRetriesCreateOneRevisionAndNoCharge(t *testing.T) {
	r, user, id, in := transcriptQueueFixture(t)
	ctx := context.Background()
	var group sync.WaitGroup
	errs := make(chan error, 4)
	for range 4 {
		group.Add(1)
		go func() { defer group.Done(); errs <- r.Queue(ctx, user, id, in) }()
	}
	group.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	project, err := r.Get(ctx, user, id)
	if err != nil {
		t.Fatal(err)
	}
	if project.Status != "pending" || !project.Assets[0].TranscriptProposals[0].Reviewed || project.Assets[0].Candidates[0].Text != "Corrected" || credits(t, r, user) != 90 {
		t.Fatalf("review not atomic/idempotent: %+v", project)
	}
	var count int
	if err = r.db.QueryRow(`SELECT count(*) FROM story_requests WHERE project_id=$1 AND id=$2`, id, in.RequestID).Scan(&count); err != nil || count != 1 {
		t.Fatal("duplicate revision", count, err)
	}
}
