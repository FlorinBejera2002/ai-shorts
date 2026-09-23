package stories

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sneepcut/backend-go/internal/jobs"
	"sneepcut/backend-go/internal/story"
	"sneepcut/backend-go/internal/testdb"
	"strings"
	"sync"
	"testing"
)

func fixture(t *testing.T, n int) (*Repository, string, string, []string) {
	t.Helper()
	db := testdb.Open(t)
	r := NewRepository(db, story.DefaultLimits())
	user, id := newID(), newID()
	ctx := context.Background()
	if _, err := db.Exec(`INSERT INTO users(id,email,provider,credits,plan) VALUES($1,$2,'credentials',100,'free')`, user, user+"@example.invalid"); err != nil {
		t.Fatal(err)
	}
	if err := r.Create(ctx, user, id, story.DefaultOptions()); err != nil {
		t.Fatal(err)
	}
	var ids []string
	for i := 0; i < n; i++ {
		a := story.Asset{ID: newID(), Name: fmt.Sprintf("Phone %d.mov", i), Key: "uploads/" + user + "/" + newID() + ".mov", Hash: fmt.Sprintf("hash%d", i), Size: 1000, Duration: 4, Width: 1080, Height: 1920, HasAudio: true, Mapping: story.TimeMap{Rate: 1, Duration: 4}}
		if _, err := r.AddAsset(ctx, user, id, a); err != nil {
			t.Fatal(err)
		}
		ids = append(ids, a.ID)
	}
	return r, user, id, ids
}
func credits(t *testing.T, r *Repository, user string) int {
	t.Helper()
	var n int
	if err := r.db.QueryRow(`SELECT credits FROM users WHERE id=$1`, user).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}
func queue(t *testing.T, r *Repository, user, id string, ids []string) *execution {
	t.Helper()
	if err := r.Queue(context.Background(), user, id, Generate{RequestID: newID(), AssetIDs: ids}); err != nil {
		t.Fatal(err)
	}
	e, err := r.Claim(context.Background())
	if err != nil || e == nil {
		t.Fatalf("claim: %v", err)
	}
	return e
}
func version(id string, n int) story.Version {
	return story.Version{Number: n, Accepted: true, Plan: story.Plan{Title: "Coherent source-backed story", Blocks: []story.Block{{ID: "block", CandidateID: "candidate", Crop: "fit"}}}, Output: story.Output{Key: fmt.Sprintf("clips/%s/story/v%d.mp4", id, n), Duration: 4, Size: 100, Resolution: "720x1280"}, Report: story.Report{Version: n, Status: "ready", Coverage: story.Coverage{Plan: true, File: true, Audio: true, Visual: true, Captions: true, Semantics: true, Boundaries: true}}}
}

func TestQueueFiveAndTenSourcesCreatesExactlyOneJobAndCharge(t *testing.T) {
	for _, n := range []int{5, 10} {
		t.Run(fmt.Sprint(n), func(t *testing.T) {
			r, user, id, ids := fixture(t, n)
			ctx := context.Background()
			in := Generate{RequestID: newID(), AssetIDs: ids}
			var wg sync.WaitGroup
			errs := make(chan error, 8)
			for range 8 {
				wg.Add(1)
				go func() { defer wg.Done(); errs <- r.Queue(ctx, user, id, in) }()
			}
			wg.Wait()
			close(errs)
			for err := range errs {
				if err != nil {
					t.Fatal(err)
				}
			}
			var count int
			if err := r.db.QueryRow(`SELECT count(*) FROM jobs WHERE user_id=$1`, user).Scan(&count); err != nil {
				t.Fatal(err)
			}
			if count != 1 || credits(t, r, user) != 90 {
				t.Fatal("duplicate generation or debit", count, credits(t, r, user))
			}
			in.Action = "faster"
			if err := r.Queue(ctx, user, id, in); !errors.Is(err, ErrConflict) {
				t.Fatal("idempotency key accepted different input", err)
			}
		})
	}
}

func TestManifestOwnershipAndUploadRetry(t *testing.T) {
	r, user, id, ids := fixture(t, 5)
	ctx := context.Background()
	if _, err := r.Get(ctx, newID(), id); !errors.Is(err, sql.ErrNoRows) {
		t.Fatal(err)
	}
	if err := r.Queue(ctx, user, id, Generate{RequestID: newID(), AssetIDs: ids[:4]}); !errors.Is(err, ErrInvalid) {
		t.Fatal("incomplete manifest accepted", err)
	}
	p, _ := r.Get(ctx, user, id)
	a := p.Assets[0]
	a.ID = newID()
	ack, err := r.AddAsset(ctx, user, id, a)
	if err != nil || ack.ID != p.Assets[0].ID {
		t.Fatal("duplicate upload was not deduplicated", err)
	}
	a = p.Assets[0]
	a.Hash = "replacement"
	if _, err = r.AddAsset(ctx, user, id, a); !errors.Is(err, ErrConflict) {
		t.Fatal("source mutated through retry", err)
	}
	if credits(t, r, user) != 100 {
		t.Fatal("draft charged")
	}
}

func TestLeaseRecoveryPreservesAnalysisBudgetAndAcceptedVersion(t *testing.T) {
	r, user, id, ids := fixture(t, 5)
	ctx := context.Background()
	e := queue(t, r, user, id, ids)
	a := e.Input.Assets[0]
	a.AnalysisVersion = story.AlgorithmVersion
	if err := e.SaveAsset(ctx, a); err != nil {
		t.Fatal(err)
	}
	if err := e.reserveAI(ctx); err != nil {
		t.Fatal(err)
	}
	v := version(id, 1)
	if err := e.SaveVersion(ctx, v); err != nil {
		t.Fatal(err)
	}
	if _, err := r.db.Exec(`UPDATE story_projects SET lease_until=now()-interval '1 second' WHERE id=$1`, id); err != nil {
		t.Fatal(err)
	}
	if err := r.Recover(ctx); err != nil {
		t.Fatal(err)
	}
	resumed, err := r.Claim(ctx)
	if err != nil || resumed == nil {
		t.Fatal(err)
	}
	if resumed.Input.Base == nil || resumed.Input.Action != "resume" || resumed.Input.VersionStart != 2 || resumed.Input.Assets[0].AnalysisVersion != story.AlgorithmVersion {
		t.Fatal("checkpoint not resumed", resumed.Input)
	}
	if err = e.SaveVersion(ctx, version(id, 2)); !errors.Is(err, ErrOwnership) {
		t.Fatal("stale worker committed", err)
	}
	p, _ := r.Get(ctx, user, id)
	if p.AICalls != 1 || p.CurrentVersion != 1 || credits(t, r, user) != 90 {
		t.Fatal("recovery lost budget/best/debit")
	}
}

func TestCancellationRefundOnceAndFencesWorker(t *testing.T) {
	for _, legacy := range []bool{false, true} {
		t.Run(fmt.Sprint(legacy), func(t *testing.T) {
			r, user, id, ids := fixture(t, 5)
			ctx := context.Background()
			e := queue(t, r, user, id, ids)
			if legacy {
				if _, err := jobs.NewRepository(r.db).Cancel(ctx, user, id); err != nil {
					t.Fatal(err)
				}
			} else {
				if err := r.Cancel(ctx, user, id); err != nil {
					t.Fatal(err)
				}
			}
			if err := e.Progress(ctx, "reviewing", "Reviewing"); !errors.Is(err, ErrOwnership) {
				t.Fatal("cancelled worker still active", err)
			}
			if err := e.finish(ctx, story.Result{}, context.Canceled); err != nil {
				t.Fatal(err)
			}
			if err := r.Cancel(ctx, user, id); err != nil {
				t.Fatal(err)
			}
			if credits(t, r, user) != 100 {
				t.Fatal("refund duplicated or missing", credits(t, r, user))
			}
			if err := r.Queue(ctx, user, id, Generate{RequestID: newID(), AssetIDs: ids}); err != nil {
				t.Fatal("retry", err)
			}
			if credits(t, r, user) != 90 {
				t.Fatal("retry reservation wrong")
			}
		})
	}
}

func TestCompletionAndEditsDoNotChargeAgain(t *testing.T) {
	r, user, id, ids := fixture(t, 5)
	ctx := context.Background()
	e := queue(t, r, user, id, ids)
	v := version(id, 1)
	if err := e.SaveVersion(ctx, v); err != nil {
		t.Fatal(err)
	}
	if err := e.finish(ctx, story.Result{Best: v}, nil); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := r.db.QueryRow(`SELECT count(*) FROM clips WHERE story_project_id=$1`, id).Scan(&count); err != nil || count != 1 {
		t.Fatal("ready clip missing", err)
	}
	if err := r.Queue(ctx, user, id, Generate{RequestID: newID(), Action: "improve_flow", Version: 1}); err != nil {
		t.Fatal(err)
	}
	if _, err := jobs.NewRepository(r.db).Cancel(ctx, user, id); err != nil {
		t.Fatal(err)
	}
	if err := r.Recover(ctx); err != nil {
		t.Fatal(err)
	}
	if credits(t, r, user) != 90 {
		t.Fatal("cancelled free repair refunded original story")
	}
}

func TestIncompleteReviewCannotEnterLibrary(t *testing.T) {
	r, user, id, ids := fixture(t, 5)
	ctx := context.Background()
	e := queue(t, r, user, id, ids)
	v := version(id, 1)
	v.Report.Coverage.Audio = false
	if err := e.SaveVersion(ctx, v); err != nil {
		t.Fatal(err)
	}
	if err := e.finish(ctx, story.Result{Best: v}, nil); err != nil {
		t.Fatal(err)
	}
	p, err := r.Get(ctx, user, id)
	if err != nil || p.Status != "needs_review" {
		t.Fatal("incomplete review promoted", err, p.Status)
	}
	var count int
	r.db.QueryRow(`SELECT count(*) FROM clips WHERE story_project_id=$1`, id).Scan(&count)
	if count != 0 {
		t.Fatal("unreviewed media published to library")
	}
}

func TestRollbackRespectsLocksAndRetainsRejectedCandidates(t *testing.T) {
	r, user, id, ids := fixture(t, 5)
	ctx := context.Background()
	e := queue(t, r, user, id, ids)
	v1 := version(id, 1)
	v2 := version(id, 2)
	v2.Plan.Blocks[0].CandidateID = "alternative"
	for _, v := range []story.Version{v1, v2} {
		if err := e.SaveVersion(ctx, v); err != nil {
			t.Fatal(err)
		}
	}
	rejected := version(id, 3)
	rejected.Accepted = false
	rejected.Report.Status = "needs_review"
	if err := e.SaveVersion(ctx, rejected); err != nil {
		t.Fatal(err)
	}
	if err := e.finish(ctx, story.Result{Best: v2}, nil); err != nil {
		t.Fatal(err)
	}
	if err := r.Patch(ctx, user, id, Patch{Version: 2, Locks: []Lock{{BlockID: "block", Locked: true}}}); err != nil {
		t.Fatal(err)
	}
	if err := r.Rollback(ctx, user, id, 1, newID()); !errors.Is(err, ErrConflict) {
		t.Fatal("rollback violated lock", err)
	}
	if err := r.Patch(ctx, user, id, Patch{Version: 2, Locks: []Lock{}}); err != nil {
		t.Fatal(err)
	}
	if err := r.Rollback(ctx, user, id, 1, newID()); err != nil {
		t.Fatal(err)
	}
	p, _ := r.Get(ctx, user, id)
	if p.CurrentVersion != 1 || len(p.Versions) != 3 {
		t.Fatal("history lost")
	}
}

func TestDurableAIBudgetAndFailedInitialRefund(t *testing.T) {
	r, user, id, ids := fixture(t, 5)
	r.limits.MaxAICalls = 2
	ctx := context.Background()
	e := queue(t, r, user, id, ids)
	for range 2 {
		if err := e.reserveAI(ctx); err != nil {
			t.Fatal(err)
		}
	}
	if err := e.reserveAI(ctx); err == nil {
		t.Fatal("unbounded budget")
	}
	if err := e.finish(ctx, story.Result{}, errors.New("provider unavailable")); err != nil {
		t.Fatal(err)
	}
	if credits(t, r, user) != 100 {
		t.Fatal("failed initial story not refunded")
	}
	p, _ := r.Get(ctx, user, id)
	if p.Status != "failed" || p.AICalls != 2 {
		t.Fatal("failed state lost")
	}
}

func TestInterruptedManualEditKeepsActionAndReservedVersionNumbers(t *testing.T) {
	r, user, id, ids := fixture(t, 5)
	ctx := context.Background()
	e := queue(t, r, user, id, ids)
	v := version(id, 1)
	if err := e.SaveVersion(ctx, v); err != nil {
		t.Fatal(err)
	}
	if err := e.finish(ctx, story.Result{Best: v}, nil); err != nil {
		t.Fatal(err)
	}
	if err := r.Queue(ctx, user, id, Generate{RequestID: newID(), Action: "improve_flow", Version: 1}); err != nil {
		t.Fatal(err)
	}
	edit, err := r.Claim(ctx)
	if err != nil || edit == nil {
		t.Fatal(err)
	}
	a := story.Attempt{Version: 3, Operation: "fit_crop", BlockID: "block", Reason: "reserved"}
	if err = edit.SaveAttempt(ctx, a); err != nil {
		t.Fatal(err)
	}
	a.Reason = "review failed"
	if err = edit.SaveAttempt(ctx, a); err != nil {
		t.Fatal(err)
	}
	if _, err = r.db.Exec(`UPDATE story_projects SET lease_until=now()-interval '1 second' WHERE id=$1`, id); err != nil {
		t.Fatal(err)
	}
	if err = r.Recover(ctx); err != nil {
		t.Fatal(err)
	}
	resumed, err := r.Claim(ctx)
	if err != nil || resumed == nil {
		t.Fatal(err)
	}
	if resumed.Input.Action != "improve_flow" || resumed.Input.Base.Number != 1 || resumed.Input.VersionStart != 4 || len(resumed.Input.PreviousAttempts) != 1 {
		t.Fatal("manual action/repair reservation lost", resumed.Input)
	}
	if err = resumed.finish(ctx, story.Result{}, errors.New("provider unavailable")); err != nil {
		t.Fatal(err)
	}
	p, _ := r.Get(ctx, user, id)
	if p.Status != "ready" || p.CurrentVersion != 1 {
		t.Fatal("reviewed best version not retained")
	}
}

func TestStageDurationExcludesTimeWaitingInDraft(t *testing.T) {
	r, user, id, ids := fixture(t, 5)
	ctx := context.Background()
	if _, err := r.db.Exec(`UPDATE story_projects SET stage_started_at=now()-interval '1 day' WHERE id=$1`, id); err != nil {
		t.Fatal(err)
	}
	e := queue(t, r, user, id, ids)
	if err := e.Progress(ctx, "building_story", "Planning"); err != nil {
		t.Fatal(err)
	}
	var seconds float64
	if err := r.db.QueryRow(`SELECT (stage_metrics->>'analyzing_seconds')::double precision FROM story_projects WHERE id=$1`, id).Scan(&seconds); err != nil {
		t.Fatal(err)
	}
	if seconds < 0 || seconds > 60 {
		t.Fatal("draft/queue wait counted as analysis", seconds)
	}
}

func TestLibraryRequiresMatchingReviewAndAlternateIdentity(t *testing.T) {
	for _, reason := range []string{"version", "identity"} {
		t.Run(reason, func(t *testing.T) {
			r, user, id, ids := fixture(t, 5)
			ctx := context.Background()
			e := queue(t, r, user, id, ids)
			v := version(id, 1)
			if reason == "version" {
				v.Report.Version = 2
			} else {
				v.Plan.Blocks[0].IdentityReferenceID = "original-take"
			}
			if err := e.SaveVersion(ctx, v); err != nil {
				t.Fatal(err)
			}
			if err := e.finish(ctx, story.Result{Best: v}, nil); err != nil {
				t.Fatal(err)
			}
			p, err := r.Get(ctx, user, id)
			if err != nil || p.Status != "needs_review" {
				t.Fatal("incomplete review promoted", p.Status, err)
			}
			var count int
			if err = r.db.QueryRow(`SELECT count(*) FROM clips WHERE story_project_id=$1`, id).Scan(&count); err != nil || count != 0 {
				t.Fatal("unreviewed output entered library", count, err)
			}
		})
	}
}

func TestLongEditorialTitleDoesNotLoseReviewedOutput(t *testing.T) {
	r, user, id, ids := fixture(t, 5)
	ctx := context.Background()
	e := queue(t, r, user, id, ids)
	v := version(id, 1)
	v.Plan.Title = strings.Repeat("ș", 300)
	if err := e.SaveVersion(ctx, v); err != nil {
		t.Fatal(err)
	}
	if err := e.finish(ctx, story.Result{Best: v}, nil); err != nil {
		t.Fatal(err)
	}
	var title string
	if err := r.db.QueryRow(`SELECT title FROM clips WHERE story_project_id=$1`, id).Scan(&title); err != nil || title != strings.Repeat("ș", 255) {
		t.Fatal("library title was not safely bounded", err)
	}
}

func TestDeleteRetainsRowsOnStorageFailure(t *testing.T) {
	r, user, id, _ := fixture(t, 5)
	ctx := context.Background()
	m := &cleanupMedia{fail: true}
	if err := r.Delete(ctx, user, id, m); err == nil {
		t.Fatal("storage failure ignored")
	}
	p, err := r.Get(ctx, user, id)
	if err != nil || p.Status != "deleting" {
		t.Fatal("lost retry marker", err)
	}
	m.fail = false
	if err = r.Delete(ctx, user, id, m); err != nil {
		t.Fatal(err)
	}
	if _, err = r.Get(ctx, user, id); !errors.Is(err, sql.ErrNoRows) {
		t.Fatal("project not removed", err)
	}
	if len(m.prefixes) != 4 {
		t.Fatal("unexpected cleanup", m.prefixes)
	}
}

type cleanupMedia struct {
	fail     bool
	prefixes []string
}

func (m *cleanupMedia) ValidateUploadSource(context.Context, string, string) (string, error) {
	return "", nil
}
func (m *cleanupMedia) SignedURL(context.Context, string) (string, error) { return "", nil }
func (m *cleanupMedia) DeletePrefix(_ context.Context, prefix string) error {
	m.prefixes = append(m.prefixes, prefix)
	if m.fail {
		return errors.New("storage unavailable")
	}
	return nil
}
