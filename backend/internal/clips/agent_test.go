package clips

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"testing"

	"sneepcut/backend-go/internal/processing"
	"sneepcut/backend-go/internal/testdb"
	"sneepcut/backend-go/internal/worker"
)

func TestAgentClipReadAndStaleEditAreOwnedAndSanitized(t *testing.T) {
	db := testdb.Open(t)
	user, _, id := seedClip(t, db)
	h := New(db, nil, nil, Config{})
	ctx := context.Background()
	read, err := h.AgentRead(ctx, user, id)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(read)
	if strings.Contains(string(raw), ".mp4") || strings.Contains(string(raw), "storage") || len(read.ExpectedState) != 64 {
		t.Fatalf("unsafe context: %s", raw)
	}
	if _, err = h.AgentRead(ctx, newID(), id); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("foreign read: %v", err)
	}
	if err = h.updateMetadata(ctx, user, id, MetadataInput{Title: "Changed manually"}); err != nil {
		t.Fatal(err)
	}
	if _, err = h.AgentEdit(ctx, user, newID(), id, read.ExpectedState, "trim", json.RawMessage(`{"start_time":0,"end_time":5}`)); !errors.Is(err, ErrAgentConflict) {
		t.Fatalf("stale edit: %v", err)
	}
	var count int
	if err = db.QueryRow(`SELECT count(*) FROM edit_deliveries`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("stale plan dispatched: %d %v", count, err)
	}
}

func TestAgentClipConcurrentRetryUsesOneSharedDelivery(t *testing.T) {
	db := testdb.Open(t)
	user, _, id := seedClip(t, db)
	h := New(db, nil, nil, Config{})
	ctx := context.Background()
	read, err := h.AgentRead(ctx, user, id)
	if err != nil {
		t.Fatal(err)
	}
	request := newID()
	input := json.RawMessage(`{"start_time":0,"end_time":5,"burn_subtitles":false}`)
	var wg sync.WaitGroup
	results := make(chan error, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			task, e := h.AgentEdit(ctx, user, request, id, read.ExpectedState, "trim", input)
			if e == nil && task != request {
				e = errors.New("unexpected task ID")
			}
			results <- e
		}()
	}
	wg.Wait()
	close(results)
	for err := range results {
		if err != nil {
			t.Fatal(err)
		}
	}
	var count int
	if err = db.QueryRow(`SELECT count(*) FROM edit_deliveries`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("duplicate delivery: %d %v", count, err)
	}
	if _, err = h.AgentEdit(ctx, user, request, id, read.ExpectedState, "trim", json.RawMessage(`{"start_time":0,"end_time":6}`)); !errors.Is(err, ErrAgentConflict) {
		t.Fatalf("changed replay: %v", err)
	}
	if _, err = h.AgentEdit(ctx, newID(), request, id, read.ExpectedState, "trim", input); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("foreign replay: %v", err)
	}
	status, err := h.AgentPoll(ctx, user, id, request)
	if err != nil || !status.Pending {
		t.Fatalf("poll: %+v %v", status, err)
	}
	if _, err = h.AgentPoll(ctx, newID(), id, request); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("foreign poll: %v", err)
	}
}

func TestAgentCancelFencesRunningWorkerAndPreservesOriginal(t *testing.T) {
	db := testdb.Open(t)
	user, job, id := seedClip(t, db)
	h := New(db, nil, nil, Config{})
	ctx := context.Background()
	read, err := h.AgentRead(ctx, user, id)
	if err != nil {
		t.Fatal(err)
	}
	request := newID()
	if _, err = h.AgentEdit(ctx, user, request, id, read.ExpectedState, "trim", json.RawMessage(`{"start_time":0,"end_time":5}`)); err != nil {
		t.Fatal(err)
	}
	repo := worker.NewRepository(db)
	edit, err := repo.ClaimEdit(ctx)
	if err != nil || edit == nil {
		t.Fatalf("claim: %+v %v", edit, err)
	}
	if err = h.AgentCancel(ctx, newID(), id, request); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("foreign cancellation: %v", err)
	}
	if err = h.AgentCancel(ctx, user, id, request); err != nil {
		t.Fatal(err)
	}
	if err = h.AgentCancel(ctx, user, id, request); err != nil {
		t.Fatal("cancel retry", err)
	}
	if err = repo.CompleteEdit(ctx, edit, processing.Clip{StorageKey: "clips/late.mp4", Duration: 5, FileSize: 100}, nil); !errors.Is(err, worker.ErrOwnership) {
		t.Fatalf("late worker committed: %v", err)
	}
	var key string
	var active int
	if err = db.QueryRow(`SELECT c.file_storage_key,j.active_edit_tasks FROM clips c JOIN jobs j ON j.id=c.job_id WHERE c.id=$1`, id).Scan(&key, &active); err != nil {
		t.Fatal(err)
	}
	if key != "clips/"+job+"/video.mp4" || active != 0 {
		t.Fatalf("cancel changed output or kept reservation: %s %d", key, active)
	}
}

func TestAgentClipCompletionRequiresMatchingWorkerArtifact(t *testing.T) {
	db := testdb.Open(t)
	user, job, id := seedClip(t, db)
	h := New(db, nil, &agentVerifiedMedia{exists: true}, Config{})
	ctx := context.Background()
	read, err := h.AgentRead(ctx, user, id)
	if err != nil {
		t.Fatal(err)
	}
	request := newID()
	if _, err = h.AgentEdit(ctx, user, request, id, read.ExpectedState, "trim", json.RawMessage(`{"start_time":0,"end_time":5}`)); err != nil {
		t.Fatal(err)
	}
	repo := worker.NewRepository(db)
	edit, err := repo.ClaimEdit(ctx)
	if err != nil || edit == nil {
		t.Fatalf("claim: %+v %v", edit, err)
	}
	key := "clips/" + job + "/edits/" + id + "/" + edit.Token + "/clip.mp4"
	if err = repo.CompleteEdit(ctx, edit, processing.Clip{StorageKey: key, Start: 0, End: 5, Duration: 5, FileSize: 1024}, nil); err != nil {
		t.Fatal(err)
	}
	result, err := h.AgentPoll(ctx, user, id, request)
	if err != nil || result.Pending || result.Clip == nil || result.Clip.Duration != 5 {
		t.Fatalf("completed output: %+v %v", result, err)
	}
	if _, err = db.Exec(`UPDATE clips SET file_storage_key='clips/replaced.mp4' WHERE id=$1`, id); err != nil {
		t.Fatal(err)
	}
	if _, err = h.AgentPoll(ctx, user, id, request); err == nil {
		t.Fatal("reported superseded output as this edit's success")
	}
}

func TestAgentClipRejectsInvalidEditsBeforeDispatch(t *testing.T) {
	db := testdb.Open(t)
	user, _, id := seedClip(t, db)
	h := New(db, nil, nil, Config{MaxClipDuration: 15})
	ctx := context.Background()
	read, err := h.AgentRead(ctx, user, id)
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct{ kind, body string }{
		{"trim", `{"start_time":0,"end_time":11}`},
		{"trim", `{"start_time":0,"end_time":5,"user_id":"other"}`},
		{"recut", `{"segments":[{"start":0,"end":4,"order":0,"command":"delete"}]}`},
		{"recut", `{"segments":[{"start":0,"end":4,"order":0},{"start":5,"end":9,"order":0}]}`},
		{"recut", `{"segments":[{"start":0,"end":20,"order":0}]}`},
	}
	for _, tc := range cases {
		if _, err = h.AgentEdit(ctx, user, newID(), id, read.ExpectedState, tc.kind, json.RawMessage(tc.body)); err == nil {
			t.Fatalf("accepted invalid edit %s", tc.body)
		}
	}
	var count int
	if err = db.QueryRow(`SELECT count(*) FROM edit_deliveries`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("invalid edit reserved work: %d %v", count, err)
	}
}

func TestAgentCancelOldReceiptDoesNotCancelNewEdit(t *testing.T) {
	db := testdb.Open(t)
	user, job, id := seedClip(t, db)
	h := New(db, nil, nil, Config{})
	ctx := context.Background()
	first, second := newID(), newID()
	input := json.RawMessage(`{"segments":[{"start":0,"end":4,"order":1},{"start":5,"end":9,"order":0}]}`)
	read, err := h.AgentRead(ctx, user, id)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = h.AgentEdit(ctx, user, first, id, read.ExpectedState, "recut", input); err != nil {
		t.Fatal(err)
	}
	if err = h.AgentCancel(ctx, user, id, first); err != nil {
		t.Fatal(err)
	}
	read, err = h.AgentRead(ctx, user, id)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = h.AgentEdit(ctx, user, second, id, read.ExpectedState, "recut", input); err != nil {
		t.Fatal(err)
	}
	if err = h.AgentCancel(ctx, user, id, first); err != nil {
		t.Fatal(err)
	}
	var active int
	var state string
	if err = db.QueryRow(`SELECT j.active_edit_tasks,d.state FROM jobs j JOIN edit_deliveries d ON d.job_id=j.id WHERE j.id=$1 AND d.task_id=$2`, job, second).Scan(&active, &state); err != nil {
		t.Fatal(err)
	}
	if active != 1 || state != "pending" {
		t.Fatalf("old receipt cancelled current edit: active=%d state=%s", active, state)
	}
}
