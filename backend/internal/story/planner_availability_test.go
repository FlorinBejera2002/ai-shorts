package story

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/aiprovider"
)

func TestMusicGuidedPlanningDoesNotRenderAnUnplannedFallback(t *testing.T) {
	req := fixtureRequest()
	req.Options.Music = &MusicSelection{TrackID: "incompetech:test", Sync: true, Volume: .3, SourceAudio: "mute"}
	req.Assets[0].Candidates[0].Idea = "Observed source action for the requested musical edit."
	providerErr := errors.New("AI provider credits unavailable")
	ai := &fakeGenerator{err: providerErr}
	plan, err := New(&fakeMedia{}, ai, DefaultLimits()).plan(context.Background(), req, &runBudget{max: 12})
	if !errors.Is(err, providerErr) || !strings.Contains(err.Error(), "story planning") || len(plan.Blocks) != 0 {
		t.Fatalf("paid render could proceed without the requested music plan: %+v %v", plan, err)
	}
	// Ordinary source-backed drafts remain available when no musical editing
	// was requested; they keep their explicit editorial-review warning.
	req.Options.Music.Sync = false
	req.Options.Music.SourceAudio = "preserve"
	plan, err = New(&fakeMedia{}, ai, DefaultLimits()).plan(context.Background(), req, &runBudget{max: 12})
	if err != nil || len(plan.Blocks) == 0 || len(plan.Gaps) == 0 {
		t.Fatalf("ordinary fallback behavior regressed: %+v %v", plan, err)
	}
}

type transientPlanningGenerator struct {
	fakeGenerator
	failure error
}

func (g *transientPlanningGenerator) Generate(ctx context.Context, prompt string) (string, error) {
	if g.calls == 0 {
		g.calls++
		return "", g.failure
	}
	return g.fakeGenerator.Generate(ctx, prompt)
}

func TestPlanningRetriesOnlyTransientRequestsWithinDurableBudget(t *testing.T) {
	for _, status := range []int{http.StatusServiceUnavailable, http.StatusPaymentRequired} {
		ai := &transientPlanningGenerator{fakeGenerator: fakeGenerator{responses: []string{proposal(fixturePlan())}}, failure: &aiprovider.RequestError{StatusCode: status}}
		reserved := 0
		ctx := WithAIBudget(context.Background(), func(context.Context) error { reserved++; return nil })
		plan, err := New(nil, ai, DefaultLimits()).plan(ctx, fixtureRequest(), &runBudget{max: 2})
		want := 1
		if status == http.StatusServiceUnavailable {
			want = 2
		}
		if err != nil || len(plan.Blocks) == 0 || ai.calls != want || reserved != want {
			t.Fatalf("status=%d calls=%d reservations=%d plan=%+v err=%v", status, ai.calls, reserved, plan, err)
		}
		if status == http.StatusServiceUnavailable && len(plan.Gaps) != 0 {
			t.Fatal("successful bounded retry used fallback", plan.Gaps)
		}
	}
}

func TestMusicPlanningRejectsMalformedOrInventedProposalBeforeRender(t *testing.T) {
	for _, raw := range []string{`not json`, `{"blocks":[]}`, `{"blocks":[{"candidate_id":"invented","role":"hook"}]}`} {
		req := fixtureRequest()
		req.Options.Music = &MusicSelection{Sync: true, Volume: .3, SourceAudio: "mute"}
		req.Assets[0].Candidates[0].Idea = "Observed source action for the requested musical edit."
		ai := &fakeGenerator{responses: []string{raw}}
		plan, err := New(nil, ai, DefaultLimits()).plan(context.Background(), req, &runBudget{max: 2})
		if err == nil || !strings.Contains(err.Error(), "story planning could not finish") || len(plan.Blocks) != 0 || ai.calls != 1 {
			t.Fatalf("invalid proposal became a music-guided fallback: %+v %v", plan, err)
		}
	}
}

func TestMusicGuidedVisualSelectionRequiresObservedContent(t *testing.T) {
	req, _ := evidenceMusicFixture()
	req.Options.Music.SourceAudio = "mute"
	for ai := range req.Assets {
		for ci := range req.Assets[ai].Candidates {
			req.Assets[ai].Candidates[ci].Idea = ""
			req.Assets[ai].Candidates[ci].Text = ""
			req.Assets[ai].Candidates[ci].Words = nil
		}
	}
	ai := &fakeGenerator{}
	plan, err := New(&fakeMedia{}, ai, DefaultLimits()).plan(context.Background(), req, &runBudget{max: 12})
	if err == nil || !strings.Contains(err.Error(), "source analysis") || len(plan.Blocks) != 0 || ai.calls != 0 {
		t.Fatalf("unseen footage became an apparently music-guided montage: %+v %v calls=%d", plan, err, ai.calls)
	}
}
