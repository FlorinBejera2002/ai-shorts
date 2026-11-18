package story

import (
	"context"
	"strings"
	"testing"
)

func TestMusicVisualSelectionRejectsUnseenAndOptionalPoorFootage(t *testing.T) {
	candidates := []editorialCandidate{
		{ID: "unseen", Text: "Camera dialogue is not visual evidence."},
		{ID: "obstructed", Idea: "A finger obscures the scene.", Role: "low_quality"},
		{ID: "required", Idea: "An explicitly required imperfect view.", Role: "low_quality", SourceInclude: "required"},
		{ID: "clear", Idea: "A clear view of the lake.", Role: "b_roll"},
	}
	got := musicVisualCandidates(candidates)
	if len(got) != 2 || got[0].ID != "required" || got[1].ID != "clear" || len(candidates) != 4 {
		t.Fatalf("visual evidence/inclusion contract changed: %+v", got)
	}
	req := fixtureRequest()
	req.Options.Music = &MusicSelection{Sync: true, Volume: .3, SourceAudio: "mute"}
	req.Assets[0].Candidates[0].Idea = "An observed useful action."
	// Even a real source ID cannot bypass the visual evidence filter by
	// being guessed in the model response.
	req.Assets[0].Candidates[1].Idea = ""
	response := proposal(Plan{Blocks: []Block{{CandidateID: req.Assets[0].Candidates[1].ID}}})
	_, err := New(nil, &fakeGenerator{responses: []string{response}}, DefaultLimits()).plan(context.Background(), req, &runBudget{max: 2})
	if err == nil || !strings.Contains(err.Error(), "story planning could not finish") {
		t.Fatal("unseen real candidate bypassed visual evidence filtering", err)
	}
}
