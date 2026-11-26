package processing

import (
	"testing"

	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/story"
)

func TestStoryOutputsKeepDistinctStableOwnedStudioProjects(t *testing.T) {
	req := story.Request{ID: "11111111-1111-4111-8111-111111111111", UserID: "22222222-2222-4222-8222-222222222222"}
	if got := studioStoryProjectID(req); got != req.ID {
		t.Fatalf("primary workspace changed: %s", got)
	}
	req.StudioOutputIndex = 1
	second := studioStoryProjectID(req)
	if !data.ValidUUID(second) || second == req.ID || studioStoryProjectID(req) != second {
		t.Fatalf("secondary workspace is invalid or unstable: %s", second)
	}
	req.StudioOutputIndex = 2
	if studioStoryProjectID(req) == second {
		t.Fatal("sibling outputs share a workspace")
	}
	req.StudioOutputIndex = 1
	req.UserID = "33333333-3333-4333-8333-333333333333"
	if studioStoryProjectID(req) == second {
		t.Fatal("different owners share a workspace")
	}
}
