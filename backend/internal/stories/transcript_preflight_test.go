package stories

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/julienschmidt/httprouter"
	creditledger "sneepcut/backend-go/internal/credits"
	"sneepcut/backend-go/internal/identity"
	"sneepcut/backend-go/internal/story"
)

func transcriptPreflightFixture(t *testing.T, failed bool) (*Repository, string, string, []string, Generate) {
	t.Helper()
	r, user, id, ids := fixture(t, 2)
	ctx := context.Background()
	project, err := r.Get(ctx, user, id)
	if err != nil {
		t.Fatal(err)
	}
	var reviews []TranscriptReviewInput
	for _, asset := range project.Assets {
		asset.Candidates = []story.Candidate{{ID: asset.ID + "-s1", SourceID: asset.ID, Out: 4, Role: "b_roll"}}
		proposal := story.TranscriptProposal{CandidateID: asset.Candidates[0].ID, Out: 4, TimingVerified: true, Words: []story.Word{{Text: "Suggested", Start: .2, End: 1}}}
		proposal.ID = story.TranscriptProposalID(asset, proposal)
		asset.TranscriptProposals = []story.TranscriptProposal{proposal}
		if _, err = r.db.Exec(`UPDATE story_assets SET asset=$3 WHERE project_id=$1 AND id=$2`, id, asset.ID, encoded(asset)); err != nil {
			t.Fatal(err)
		}
		reviews = append(reviews, TranscriptReviewInput{AssetID: asset.ID, ProposalID: proposal.ID, Words: []string{"Confirmed"}})
	}
	if failed {
		execution := queue(t, r, user, id, ids)
		if err = execution.finish(ctx, story.Result{}, errors.New("initial analysis needs transcript review")); err != nil {
			t.Fatal(err)
		}
	}
	state, err := r.AgentState(ctx, user, id)
	if err != nil {
		t.Fatal(err)
	}
	return r, user, id, ids, Generate{RequestID: newID(), Action: "review_transcript", Version: 0, ExpectedState: state, TranscriptReviews: reviews}
}

func transcriptPreflightJobState(t *testing.T, r *Repository, id string) string {
	t.Helper()
	var state string
	if err := r.db.QueryRow(`SELECT jsonb_build_object('status',p.status,'version',p.current_version,'request',p.request,'lease',p.lease_token,'jobs',(SELECT jsonb_agg(to_jsonb(j)) FROM jobs j WHERE j.id=p.id))::text FROM story_projects p WHERE p.id=$1`, id).Scan(&state); err != nil {
		t.Fatal(err)
	}
	return state
}

func TestTranscriptPreflightApprovalSavesSeveralSourcesWithoutQueuingOrCharging(t *testing.T) {
	for _, failed := range []bool{false, true} {
		name := "draft"
		if failed {
			name = "failed_initial_generation"
		}
		t.Run(name, func(t *testing.T) {
			r, user, id, ids, in := transcriptPreflightFixture(t, failed)
			ctx := context.Background()
			before := transcriptPreflightJobState(t, r, id)
			secondReview := in.TranscriptReviews[1]
			in.TranscriptReviews = in.TranscriptReviews[:1]
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
			if after := transcriptPreflightJobState(t, r, id); after != before || credits(t, r, user) != 100 {
				t.Fatal("review changed the job, project request, lease or credits")
			}
			var count int
			if err := r.db.QueryRow(`SELECT count(*) FROM story_requests WHERE project_id=$1 AND id=$2`, id, in.RequestID).Scan(&count); err != nil || count != 1 {
				t.Fatal("review retry was not idempotent", count, err)
			}
			changed := in
			changed.TranscriptReviews = []TranscriptReviewInput{secondReview}
			if err := r.Queue(ctx, user, id, changed); !errors.Is(err, ErrConflict) {
				t.Fatalf("reused request ID accepted different evidence: %v", err)
			}
			state, err := r.AgentState(ctx, user, id)
			if err != nil || state == in.ExpectedState {
				t.Fatal("approval did not advance source state", err)
			}
			if err = r.Queue(ctx, user, id, Generate{RequestID: newID(), Action: "review_transcript", ExpectedState: state, TranscriptReviews: []TranscriptReviewInput{secondReview}}); err != nil {
				t.Fatal(err)
			}
			if transcriptPreflightJobState(t, r, id) != before || credits(t, r, user) != 100 {
				t.Fatal("second source review queued or charged")
			}
			project, err := r.Get(ctx, user, id)
			if err != nil {
				t.Fatal(err)
			}
			for _, asset := range project.Assets {
				if len(asset.TranscriptReviews) != 1 || !asset.TranscriptProposals[0].Reviewed || asset.Candidates[0].Text != "Confirmed" || asset.TranscriptReviews[0].SourceHash != asset.Hash || asset.TranscriptReviews[0].Words[0].Start != .2 || asset.TranscriptReviews[0].Words[0].End != 1 {
					t.Fatal("review lost source identity, text or immutable timing")
				}
			}
			// Only the later explicit generation may reserve credits and create work.
			execution := queue(t, r, user, id, ids)
			if credits(t, r, user) != 90 || execution.Input.Action != "" {
				t.Fatal("initial generation did not retain normal queue semantics")
			}
			for _, asset := range execution.Input.Assets {
				if len(asset.TranscriptReviews) != 1 || asset.Candidates[0].Text != "Confirmed" {
					t.Fatal("generation did not receive the owner's approved evidence")
				}
			}
		})
	}
}

func TestTranscriptPreflightApprovalRejectsInvalidGuardsAndBatchesAtomically(t *testing.T) {
	r, user, id, _, in := transcriptPreflightFixture(t, true)
	ctx := context.Background()
	before := transcriptPreflightJobState(t, r, id)
	if err := r.Queue(ctx, newID(), id, in); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("foreign owner: %v", err)
	}
	for _, change := range []func(*Generate){
		func(input *Generate) { input.ExpectedState = "" },
		func(input *Generate) { input.Version = -1 },
		func(input *Generate) { input.TranscriptReviews = nil },
		func(input *Generate) {
			input.TranscriptReviews = append(append([]TranscriptReviewInput(nil), input.TranscriptReviews...), TranscriptReviewInput{AssetID: "foreign", ProposalID: "missing", Words: []string{"Injected"}})
		},
	} {
		invalid := in
		change(&invalid)
		if err := r.Queue(ctx, user, id, invalid); !errors.Is(err, ErrInvalid) {
			t.Fatalf("invalid review accepted: %v", err)
		}
	}
	stale := in
	stale.ExpectedState = strings.Repeat("0", 64)
	if err := r.Queue(ctx, user, id, stale); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale state: %v", err)
	}
	if transcriptPreflightJobState(t, r, id) != before || credits(t, r, user) != 100 {
		t.Fatal("rejected review changed execution state or credits")
	}
	project, err := r.Get(ctx, user, id)
	if err != nil {
		t.Fatal(err)
	}
	for _, asset := range project.Assets {
		if len(asset.TranscriptReviews) != 0 || asset.TranscriptProposals[0].Reviewed || asset.TranscriptProposals[0].Words[0].Text != "Suggested" {
			t.Fatal("rejected batch partially approved a source")
		}
	}
	var receipts int
	if err = r.db.QueryRow(`SELECT count(*) FROM story_requests WHERE project_id=$1 AND id=$2`, id, in.RequestID).Scan(&receipts); err != nil || receipts != 0 {
		t.Fatal("rejected review created a receipt", err)
	}
}

func TestTranscriptPreflightApprovalRejectsChangedSourceAndActiveLease(t *testing.T) {
	for _, mutation := range []string{"source_hash", "lease", "timing", "inactive_account"} {
		t.Run(mutation, func(t *testing.T) {
			r, user, id, _, in := transcriptPreflightFixture(t, true)
			ctx := context.Background()
			var err error
			want := ErrConflict
			switch mutation {
			case "source_hash":
				_, err = r.db.Exec(`UPDATE story_assets SET asset=jsonb_set(asset,'{hash}','"replacement-source"') WHERE project_id=$1`, id)
			case "lease":
				_, err = r.db.Exec(`UPDATE story_projects SET lease_token=$2,lease_until=now()+interval '1 minute' WHERE id=$1`, id, newID())
			case "timing":
				_, err = r.db.Exec(`UPDATE story_assets SET asset=jsonb_set(asset,'{transcript_proposals,0,timing_verified}','false') WHERE project_id=$1`, id)
				if err == nil {
					in.ExpectedState, err = r.AgentState(ctx, user, id)
				}
				want = ErrInvalid
			case "inactive_account":
				_, err = r.db.Exec(`UPDATE users SET account_status='suspended' WHERE id=$1`, user)
				want = creditledger.ErrInactive
			}
			if err != nil {
				t.Fatal(err)
			}
			before := transcriptPreflightJobState(t, r, id)
			if err = r.Queue(ctx, user, id, in); !errors.Is(err, want) {
				t.Fatalf("%s review: %v", mutation, err)
			}
			if transcriptPreflightJobState(t, r, id) != before || credits(t, r, user) != 100 {
				t.Fatal("rejected review changed execution state or credits")
			}
		})
	}
}

func TestTranscriptPreflightHTTPReturnsApprovedSourcesWithoutStartingGeneration(t *testing.T) {
	r, user, id, _, in := transcriptPreflightFixture(t, true)
	if _, err := r.db.Exec(`UPDATE users SET password_hash=$2 WHERE id=$1`, user, "$2b$12$tVLZOBSvFOx2sp4u1B6nT.0lG9HQ0XjxYkW72YPuUc1cQTsKGvCY2"); err != nil {
		t.Fatal(err)
	}
	tokens, err := identity.NewTokens(identity.TokenConfig{Secret: strings.Repeat("x", 40), Issuer: "test", Audience: "test", AccessLifetime: time.Minute, RefreshLifetime: time.Hour})
	if err != nil {
		t.Fatal(err)
	}
	service := identity.NewService(identity.NewPostgres(r.db), tokens)
	login, _, _, err := service.Login(context.Background(), user+"@example.invalid", "dummy-password-not-a-user")
	if err != nil {
		t.Fatal(err)
	}
	auth := identity.NewHandler(service, identity.HTTPConfig{}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	router := httprouter.New()
	New(r.db, auth, httpMedia{}, httpEngine{}, story.DefaultLimits()).Register(router)
	request := httptest.NewRequest(http.MethodPost, "/api/stories/"+id+"/transcript-review", strings.NewReader(encoded(map[string]any{
		"request_id": in.RequestID, "version": 0, "expected_state": in.ExpectedState, "reviews": in.TranscriptReviews,
	})))
	request.Header.Set("Authorization", "Bearer "+login.AccessToken)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusAccepted {
		t.Fatal(response.Code, response.Body.String())
	}
	var result struct {
		Status         string        `json:"status"`
		CurrentVersion int           `json:"current_version"`
		ExpectedState  string        `json:"expected_state"`
		Assets         []story.Asset `json:"assets"`
	}
	if err = json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Status != "failed" || result.CurrentVersion != 0 || result.ExpectedState == in.ExpectedState || len(result.Assets) != 2 || credits(t, r, user) != 100 {
		t.Fatal("preflight response changed generation state or omitted the updated source guard", response.Body.String())
	}
	for _, asset := range result.Assets {
		if !asset.TranscriptProposals[0].Reviewed || asset.Candidates[0].Text != "Confirmed" {
			t.Fatal("preflight response omitted the approved evidence")
		}
	}
}
