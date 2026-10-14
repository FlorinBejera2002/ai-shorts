package story

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
)

func TestImproveFlowReplansKnownMomentsAndReportsIdenticalOutput(t *testing.T) {
	for _, changed := range []bool{false, true} {
		t.Run(map[bool]string{false: "identical", true: "new-selection"}[changed], func(t *testing.T) {
			req := fixtureRequest()
			first, err := New(&fakeMedia{}, &fakeGenerator{responses: []string{proposal(fixturePlan())}}, DefaultLimits()).Run(context.Background(), req, &memoryCheckpoints{})
			if err != nil {
				t.Fatal(err)
			}
			req.Base = &first.Best
			req.Action = "improve_flow"
			req.VersionStart = 2
			plan := clonePlan(first.Best.Plan)
			if changed {
				plan.Blocks[0].CandidateID = "a-alt"
			}
			media := &fakeMedia{}
			checkpoints := &memoryCheckpoints{}
			ai := &fakeGenerator{responses: []string{proposal(plan)}}
			result, err := New(media, ai, DefaultLimits()).Run(context.Background(), req, checkpoints)
			if !changed {
				var noChange *NoChangeError
				if !errors.As(err, &noChange) || len(media.renders) != 0 || len(checkpoints.versions) != 0 {
					t.Fatalf("identical flow claimed a new render: %v renders=%d versions=%d", err, len(media.renders), len(checkpoints.versions))
				}
				return
			}
			if err != nil || result.Best.Number != 2 || result.Best.Plan.Blocks[0].CandidateID != "a-alt" || len(media.renders) == 0 {
				t.Fatalf("global flow did not select and render the known alternate: %+v %v", result.Best, err)
			}
			if result.Best.Timeline[0].Audio.SourceID != req.Assets[0].ID || result.Best.Timeline[0].Audio.In != 5 {
				t.Fatal("flow invented audio")
			}
		})
	}
}
func TestNarrationIdenticalFlowDoesNotRender(t *testing.T) {
	req, base := generatedNarration(t)
	req.Base = &base
	req.Action = "improve_flow"
	req.VersionStart = 2
	media := &fakeMedia{}
	checkpoints := &memoryCheckpoints{}
	proposal := narrationProposal{Title: base.Plan.Title}
	for _, block := range base.Plan.Blocks {
		proposal.Selections = append(proposal.Selections, narrationSelection{SlotID: block.ID, CandidateIDs: []string{block.CandidateID}})
	}
	raw, _ := json.Marshal(proposal)
	_, err := New(media, &fakeGenerator{responses: []string{string(raw)}}, DefaultLimits()).Run(context.Background(), req, checkpoints)
	var noChange *NoChangeError
	if !errors.As(err, &noChange) || len(media.renders) != 0 {
		t.Fatalf("unchanged narration rendered: %v renders=%d", err, len(media.renders))
	}
}
