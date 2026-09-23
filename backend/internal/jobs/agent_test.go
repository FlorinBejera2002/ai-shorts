package jobs

import (
	"context"
	"errors"
	"net"
	"sneepcut/backend-go/internal/agentaction"
	"sneepcut/backend-go/internal/testdb"
	"sync"
	"testing"
)

func TestAgentJobCreationChargesOnceAndFencesCancellation(t *testing.T) {
	db := testdb.Open(t)
	user := seedUser(t, db)
	ctx := context.Background()
	h := New(db, nil, testMedia{}, Config{LookupIP: func(context.Context, string, string) ([]net.IP, error) { return []net.IP{net.ParseIP("8.8.8.8")}, nil }})
	url := "https://example.invalid/video.mp4"
	in := AgentInput{Options: DefaultOptions(), SourceType: "url", SourceURL: &url}
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
