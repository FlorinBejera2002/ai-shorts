package story

import (
	"context"
	"errors"
	"testing"

	"sneepcut/backend-go/internal/aiprovider"
)

type taskProvider struct {
	planner, reviewer *fakeGenerator
}

func (*taskProvider) Generate(context.Context, string) (string, error) {
	return "", errors.New("story task must be selected")
}

func (p *taskProvider) ForTask(_ context.Context, task aiprovider.Task) (aiprovider.Generator, error) {
	switch task {
	case aiprovider.TaskStoryPlanning:
		return p.planner, nil
	case aiprovider.TaskStoryReview:
		return p.reviewer, nil
	default:
		return nil, aiprovider.ErrNotConfigured
	}
}

func TestStoryAndNarrationUseSeparatePlanningAndReviewModels(t *testing.T) {
	for _, test := range []struct {
		name     string
		request  Request
		proposal string
	}{
		{"story", fixtureRequest(), proposal(fixturePlan())},
		{"narration", narrationFixture(), narrationProposalJSON()},
	} {
		t.Run(test.name, func(t *testing.T) {
			planner := &fakeGenerator{responses: []string{test.proposal}}
			reviewer := &fakeGenerator{}
			provider := &taskProvider{planner: planner, reviewer: reviewer}
			result, err := New(&fakeMedia{}, provider, DefaultLimits()).Run(context.Background(), test.request, &memoryCheckpoints{})
			if err != nil || result.Best.Report.Status != "ready" || planner.calls != 1 || reviewer.calls != 1 {
				t.Fatalf("task routing failed: status=%s plan=%d review=%d error=%v", result.Best.Report.Status, planner.calls, reviewer.calls, err)
			}
		})
	}
}
