package stories

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"sneepcut/backend-go/internal/story"
	"sync"
	"testing"
)

type snapshotRaceMedia struct {
	httpMedia
	once   sync.Once
	commit func()
}

func (m *snapshotRaceMedia) SignedURL(ctx context.Context, key string) (string, error) {
	m.once.Do(m.commit)
	return m.httpMedia.SignedURL(ctx, key)
}
func TestProjectResponseKeepsConsistentStateDuringConcurrentRegistration(t *testing.T) {
	repo, user, id, _ := fixture(t, 1)
	ctx := context.Background()
	before, err := repo.AgentState(ctx, user, id)
	if err != nil {
		t.Fatal(err)
	}
	extra := story.Asset{ID: newID(), Key: "uploads/" + user + "/concurrent.mp4", Name: "Concurrent clip", Hash: "concurrent-registration", Size: 200, Duration: 1, Width: 160, Height: 90, Order: 1}
	media := &snapshotRaceMedia{commit: func() {
		if _, err := repo.AddAsset(ctx, user, id, extra); err != nil {
			t.Fatal(err)
		}
	}}
	handler := &Handler{repo: repo, media: media}
	response := httptest.NewRecorder()
	handler.respondProject(response, httptest.NewRequest("POST", "/api/stories/"+id+"/assets", nil), user, id, 201)
	if response.Code != 201 {
		t.Fatalf("committed registration became a failure: %d %s", response.Code, response.Body.String())
	}
	var decoded struct {
		Assets        []story.Asset
		ExpectedState string `json:"expected_state"`
	}
	if err = json.Unmarshal(response.Body.Bytes(), &decoded); err != nil {
		t.Fatal(err)
	}
	if len(decoded.Assets) != 1 || decoded.ExpectedState != before {
		t.Fatalf("mixed project and state snapshots: assets=%d state=%s expected=%s", len(decoded.Assets), decoded.ExpectedState, before)
	}
	after, err := repo.AgentState(ctx, user, id)
	if err != nil || after == before {
		t.Fatal("concurrent addition did not persist", err)
	}
	current := httptest.NewRecorder()
	handler.respondProject(current, httptest.NewRequest("GET", "/api/stories/"+id, nil), user, id, 200)
	if current.Code != 200 {
		t.Fatal(current.Code, current.Body.String())
	}
	if err = json.Unmarshal(current.Body.Bytes(), &decoded); err != nil {
		t.Fatal(err)
	}
	if len(decoded.Assets) != 2 || decoded.ExpectedState != after {
		t.Fatal("subsequent response lost committed source or paired stale token")
	}
}
