package jobs

import (
	"context"
	"database/sql"
	"errors"
	"sneepcut/backend-go/internal/agentaction"
	"sneepcut/backend-go/internal/testdb"
	"sync"
	"testing"
)

func TestAgentJobCreationChargesOnceAndFencesCancellation(t *testing.T) {
	db := testdb.Open(t)
	user := seedUser(t, db)
	ctx := context.Background()
	h := New(db, nil, acceptingMedia{})
	in := AgentInput{Options: DefaultOptions(), SourceType: "upload", AssetID: seedUploadAsset(t, db, user)}
	in.NumClips = 2
	request := newID()
	var wg sync.WaitGroup
	results := make(chan AgentJob, 4)
	errs := make(chan error, 4)
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); v, err := h.AgentCreate(ctx, user, request, in); results <- v; errs <- err }()
	}
	wg.Wait()
	close(results)
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	var id string
	for v := range results {
		if id != "" && id != v.ID {
			t.Fatal("replay created a different job")
		}
		id = v.ID
	}
	var credits, count, deliveries int
	if err := db.QueryRow(`SELECT credits,(SELECT count(*) FROM jobs WHERE user_id=$1),(SELECT count(*) FROM job_deliveries d JOIN jobs j ON j.id=d.job_id WHERE j.user_id=$1) FROM users WHERE id=$1`, user).Scan(&credits, &count, &deliveries); err != nil {
		t.Fatal(err)
	}
	if credits != 80 || count != 1 || deliveries != 1 {
		t.Fatalf("credits=%d jobs=%d deliveries=%d", credits, count, deliveries)
	}
	changed := in
	changed.NumClips = 3
	if _, err := h.AgentCreate(ctx, user, request, changed); !errors.Is(err, agentaction.ErrConflict) {
		t.Fatalf("changed retry: %v", err)
	}
	if err := h.AgentCancel(ctx, user, newID(), id); err == nil {
		t.Fatal("unbound cancellation accepted")
	}
	if err := h.AgentCancel(ctx, user, request, id); err != nil {
		t.Fatal(err)
	}
	if err := h.AgentCancel(ctx, user, request, id); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(`SELECT credits FROM users WHERE id=$1`, user).Scan(&credits); err != nil || credits != 100 {
		t.Fatalf("refund %d %v", credits, err)
	}
	other := seedUser(t, db)
	if _, err := h.AgentGet(ctx, other, id); err == nil {
		t.Fatal("foreign job disclosed")
	}
	if _, err := db.Exec(`UPDATE jobs SET status='completed' WHERE id=$1`, id); err != nil {
		t.Fatal(err)
	}
	if _, err := h.AgentGet(ctx, user, id); err == nil {
		t.Fatal("missing output counted as completed")
	}
}

// acceptingMedia treats every reference as an owned upload stored under that key.
type acceptingMedia struct{}

func (acceptingMedia) ValidateUploadSource(_ context.Context, _, reference string) (string, error) {
	return reference, nil
}
func (acceptingMedia) WorkerSource(_ context.Context, key string) (string, error) {
	return key, nil
}

// seedUploadAsset stores an owned story video asset and returns its ID.
func seedUploadAsset(t *testing.T, db *sql.DB, user string) string {
	t.Helper()
	project, asset := newID(), newID()
	if _, err := db.Exec(`INSERT INTO story_projects(id,user_id,options) VALUES($1,$2,'{}')`, project, user); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO story_assets(project_id,id,hash,asset) VALUES($1,$2,'fixture',$3)`, project, asset, `{"id":"`+asset+`","name":"agent.mp4","key":"uploads/`+user+`/agent.mp4"}`); err != nil {
		t.Fatal(err)
	}
	return asset
}
