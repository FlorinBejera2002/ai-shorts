package jobs

import (
	"context"
	"encoding/json"
	"sneepcut/backend-go/internal/testdb"
	"strings"
	"testing"
)

func TestAgentCancelsManualJobOnceAndKeepsAccountsIsolated(t *testing.T) {
	db := testdb.Open(t)
	user, other := seedUser(t, db), seedUser(t, db)
	h := New(db, nil, testMedia{}, Config{})
	ctx := context.Background()
	created, err := h.repo.Create(ctx, user, []Prepared{preparedJob()})
	if err != nil {
		t.Fatal(err)
	}
	var job AgentJob
	if err = json.Unmarshal(created[0], &job); err != nil {
		t.Fatal(err)
	}
	listed, err := h.AgentList(ctx, user)
	if err != nil || len(listed) != 1 || listed[0].ID != job.ID {
		t.Fatalf("list: %+v %v", listed, err)
	}
	encoded, _ := json.Marshal(listed)
	if strings.Contains(string(encoded), "youtube.com") || strings.Contains(string(encoded), "celery_task_id") {
		t.Fatal("private source or worker field disclosed")
	}
	if _, err = h.AgentCancelOwned(ctx, other, job.ID); err == nil {
		t.Fatal("cross-user cancellation accepted")
	}
	for i := 0; i < 2; i++ {
		result, err := h.AgentCancelOwned(ctx, user, job.ID)
		if err != nil || result.Status != "cancelled" {
			t.Fatalf("cancel replay: %+v %v", result, err)
		}
	}
	var credits int
	if err = db.QueryRow(`SELECT credits FROM users WHERE id=$1`, user).Scan(&credits); err != nil || credits != 100 {
		t.Fatalf("cancellation refunded more than once: %d %v", credits, err)
	}
	foreign, err := h.AgentList(ctx, other)
	if err != nil || len(foreign) != 0 {
		t.Fatalf("foreign jobs disclosed: %+v %v", foreign, err)
	}
}
