package stories

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"

	"sneepcut/backend-go/internal/story"
)

type scopedBuilderFunc func(context.Context, story.Request, story.Checkpoints) (story.Result, error)

func (f scopedBuilderFunc) Run(ctx context.Context, in story.Request, cp story.Checkpoints) (story.Result, error) {
	return f(ctx, in, cp)
}

func addScopedQueue(t *testing.T, r *Repository, user string) string {
	t.Helper()
	ctx := context.Background()
	id, assetID := newID(), newID()
	if err := r.Create(ctx, user, id, story.DefaultOptions()); err != nil {
		t.Fatal(err)
	}
	_, err := r.AddAsset(ctx, user, id, story.Asset{ID: assetID, Name: "Synthetic.mov", Key: "uploads/" + user + "/" + assetID + ".mov", Hash: assetID, Size: 1000, Duration: 4, Width: 1080, Height: 1920, HasAudio: true, Mapping: story.TimeMap{Rate: 1, Duration: 4}})
	if err != nil {
		t.Fatal(err)
	}
	if err = r.Queue(ctx, user, id, Generate{RequestID: newID(), AssetIDs: []string{assetID}}); err != nil {
		t.Fatal(err)
	}
	return id
}

func scopedSnapshot(t *testing.T, r *Repository, id string) string {
	t.Helper()
	var snapshot string
	if err := r.db.QueryRow(`SELECT jsonb_build_object('job',to_jsonb(j),'project',(SELECT to_jsonb(p) FROM story_projects p WHERE p.id=j.id))::text FROM jobs j WHERE j.id=$1`, id).Scan(&snapshot); err != nil {
		t.Fatal(err)
	}
	return snapshot
}

func TestScopedStoryInvalidIDNeverUsesDatabase(t *testing.T) {
	r := NewRepository(nil, story.DefaultLimits())
	for _, id := range []string{"", "not-a-uuid", "194c519e-6315-40a3-96de-b234f3cb4fa8 extra"} {
		if _, err := r.ClaimStory(context.Background(), id); !errors.Is(err, ErrInvalid) {
			t.Fatalf("invalid ID %q: %v", id, err)
		}
	}
}

func TestScopedStoryRunsOnlyRequestedWithoutRecovery(t *testing.T) {
	r, user, target, ids := fixture(t, 1)
	ctx := context.Background()
	other := addScopedQueue(t, r, user)
	expired := addScopedQueue(t, r, user)
	if _, err := r.db.Exec(`UPDATE story_projects SET status='analyzing',lease_token=$2,lease_until=now()-interval '1 minute' WHERE id=$1`, expired, newID()); err != nil {
		t.Fatal(err)
	}
	ordinary := newID()
	if _, err := r.db.Exec(`INSERT INTO jobs(id,user_id,source_type,status,progress,num_clips_requested,aspect_ratio,subtitle_style,include_brand,credits_charged) VALUES($1,$2,'youtube','pending',0,1,'9:16','default',false,0)`, ordinary, user); err != nil {
		t.Fatal(err)
	}
	if err := r.Queue(ctx, user, target, Generate{RequestID: newID(), AssetIDs: ids}); err != nil {
		t.Fatal(err)
	}
	before := map[string]string{}
	for _, id := range []string{other, expired, ordinary} {
		before[id] = scopedSnapshot(t, r, id)
	}
	calls := 0
	runner := Runner{Repo: r, Builder: scopedBuilderFunc(func(ctx context.Context, in story.Request, cp story.Checkpoints) (story.Result, error) {
		calls++
		if in.ID != target {
			t.Fatalf("wrong Story executed: %s", in.ID)
		}
		v := version(target, in.VersionStart)
		if err := cp.SaveVersion(ctx, v); err != nil {
			return story.Result{}, err
		}
		return story.Result{Best: v}, nil
	})}
	if err := runner.RunStory(ctx, target); err != nil {
		t.Fatal(err)
	}
	if calls != 1 {
		t.Fatalf("processed %d times", calls)
	}
	for id, previous := range before {
		if now := scopedSnapshot(t, r, id); now != previous {
			t.Fatalf("unrelated queue item %s changed", id)
		}
	}
	if err := runner.RunStory(ctx, target); !errors.Is(err, ErrStoryNotPending) || calls != 1 {
		t.Fatalf("completed target retried or fell back: %v, calls=%d", err, calls)
	}
	// The ordinary default claim still selects the oldest eligible Story.
	e, err := r.Claim(ctx)
	if err != nil || e == nil || e.ID != other {
		t.Fatalf("default Claim changed: %+v, %v", e, err)
	}
}

func TestScopedStoryUnavailableNeverFallsBack(t *testing.T) {
	for _, state := range []string{"missing", "draft", "leased", "cancelled_job", "deleting_account"} {
		t.Run(state, func(t *testing.T) {
			r, user, target, ids := fixture(t, 1)
			ctx := context.Background()
			other := addScopedQueue(t, r, user)
			if state != "draft" {
				if err := r.Queue(ctx, user, target, Generate{RequestID: newID(), AssetIDs: ids}); err != nil {
					t.Fatal(err)
				}
			}
			var err error
			switch state {
			case "missing":
				target = newID()
			case "leased":
				_, err = r.db.Exec(`UPDATE story_projects SET lease_token=$2,lease_until=now()-interval '1 minute' WHERE id=$1`, target, newID())
			case "cancelled_job":
				_, err = r.db.Exec(`UPDATE jobs SET status='cancelled' WHERE id=$1`, target)
			case "deleting_account":
				_, err = r.db.Exec(`INSERT INTO account_deletion_requests(user_id) VALUES($1)`, user)
			}
			if err != nil {
				t.Fatal(err)
			}
			before := scopedSnapshot(t, r, other)
			runner := Runner{Repo: r} // nil Builder proves no processing is attempted.
			if err := runner.RunStory(ctx, target); !errors.Is(err, ErrStoryNotPending) {
				t.Fatalf("ineligible target: %v", err)
			}
			if scopedSnapshot(t, r, other) != before {
				t.Fatal("unrelated pending Story changed")
			}
		})
	}
}

func TestScopedStoryClaimIsAtomic(t *testing.T) {
	r, user, id, ids := fixture(t, 1)
	ctx := context.Background()
	if err := r.Queue(ctx, user, id, Generate{RequestID: newID(), AssetIDs: ids}); err != nil {
		t.Fatal(err)
	}
	var claims atomic.Int32
	var wg sync.WaitGroup
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			e, err := r.ClaimStory(ctx, id)
			if err != nil {
				t.Error(err)
			} else if e != nil {
				claims.Add(1)
			}
		}()
	}
	wg.Wait()
	if claims.Load() != 1 {
		t.Fatalf("%d workers claimed the same Story", claims.Load())
	}
}

func TestScopedStoryRunFailureFinalizesAndReturnsError(t *testing.T) {
	r, user, id, ids := fixture(t, 1)
	ctx := context.Background()
	if err := r.Queue(ctx, user, id, Generate{RequestID: newID(), AssetIDs: ids}); err != nil {
		t.Fatal(err)
	}
	failure := errors.New("synthetic processing failure")
	runner := Runner{Repo: r, Builder: scopedBuilderFunc(func(context.Context, story.Request, story.Checkpoints) (story.Result, error) {
		return story.Result{}, failure
	})}
	if err := runner.RunStory(ctx, id); !errors.Is(err, failure) {
		t.Fatalf("one-shot worker hid failure: %v", err)
	}
	p, err := r.Get(ctx, user, id)
	if err != nil || p.Status != "failed" || credits(t, r, user) != 100 {
		t.Fatalf("failure was not finalized/refunded: %+v, %v", p, err)
	}
	// Preserve polling-worker semantics: a finalized processing failure does not
	// break its loop or suppress processing the next eligible item.
	if err = r.Queue(ctx, user, id, Generate{RequestID: newID(), AssetIDs: ids}); err != nil {
		t.Fatal(err)
	}
	if worked, err := runner.Once(ctx); !worked || err != nil {
		t.Fatalf("default runner failure semantics changed: %t, %v", worked, err)
	}
}

func TestScopedStoryQueueFlowImprovementTargetsExistingVersionWithoutNewCharge(t *testing.T) {
	r, user, id, ids := fixture(t, 1)
	ctx := context.Background()
	if err := r.Queue(ctx, user, id, Generate{RequestID: newID(), AssetIDs: ids}); err != nil {
		t.Fatal(err)
	}
	runner := Runner{Repo: r, Builder: scopedBuilderFunc(func(ctx context.Context, in story.Request, cp story.Checkpoints) (story.Result, error) {
		v := version(id, in.VersionStart)
		if err := cp.SaveVersion(ctx, v); err != nil {
			return story.Result{}, err
		}
		return story.Result{Best: v}, nil
	})}
	if err := runner.RunStory(ctx, id); err != nil {
		t.Fatal(err)
	}
	if err := r.QueueFlowImprovement(ctx, id); err != nil {
		t.Fatal(err)
	}
	execution, err := r.ClaimStory(ctx, id)
	if err != nil || execution == nil {
		t.Fatalf("improvement was not queued: %+v, %v", execution, err)
	}
	if execution.Input.Action != "improve_flow" || execution.Input.Base == nil || execution.Input.Base.Number != 1 || execution.Input.VersionStart != 2 {
		t.Fatalf("wrong improvement request: %+v", execution.Input)
	}
	if got := credits(t, r, user); got != 90 {
		t.Fatalf("revision charged credits again: %d", got)
	}
}
