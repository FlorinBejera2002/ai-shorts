package calendar

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"sneepcut/backend-go/internal/agentaction"
	"sneepcut/backend-go/internal/testdb"
	"strings"
	"testing"
	"time"
)

func agentCalendarFixture(t *testing.T) (*Repository, string, string, string, map[string]any) {
	t.Helper()
	db := testdb.Open(t)
	user, _, clip := seedCalendarClip(t, db)
	account := fixtureID(t)
	if _, err := db.Exec(`INSERT INTO social_accounts(id,user_id,provider,remote_id,name,credentials) VALUES($1,$2,'instagram',$3,'Synthetic destination','test-secret')`, account, user, account); err != nil {
		t.Fatal(err)
	}
	input := map[string]any{"title": "Synthetic draft", "caption": "Approved caption", "platforms": []any{"instagram"}, "accountIds": []any{account}, "clipId": clip, "scheduledAt": time.Now().Add(time.Hour).UTC().Format(time.RFC3339)}
	return NewRepository(db, calendarMedia{}), user, clip, account, input
}

func TestAgentDraftDeleteIsFrozenOwnedAndIdempotent(t *testing.T) {
	repo, user, _, _, input := agentCalendarFixture(t)
	ctx := context.Background()
	draft, err := repo.AgentMutate(ctx, user, fixtureID(t), "", "", "calendar.create_draft", input)
	if err != nil {
		t.Fatal(err)
	}
	if err = repo.AgentDelete(ctx, fixtureID(t), fixtureID(t), draft.ID, draft.ExpectedState); err == nil {
		t.Fatal("foreign deletion")
	}
	updated, err := repo.AgentMutate(ctx, user, fixtureID(t), draft.ID, draft.ExpectedState, "calendar.update", map[string]any{"caption": "Changed"})
	if err != nil {
		t.Fatal(err)
	}
	if err = repo.AgentDelete(ctx, user, fixtureID(t), draft.ID, draft.ExpectedState); !errors.Is(err, ErrAgentChanged) {
		t.Fatalf("stale deletion %v", err)
	}
	request := fixtureID(t)
	if err = repo.AgentDelete(ctx, user, request, draft.ID, updated.ExpectedState); err != nil {
		t.Fatal(err)
	}
	if err = repo.AgentDelete(ctx, user, request, draft.ID, updated.ExpectedState); err != nil {
		t.Fatal("replay", err)
	}
	if _, err = repo.AgentGet(ctx, user, draft.ID); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("deleted draft remains %v", err)
	}
	draft, err = repo.AgentMutate(ctx, user, fixtureID(t), "", "", "calendar.create_draft", input)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = repo.db.Exec(`UPDATE scheduled_posts SET status='scheduled' WHERE id=$1`, draft.ID); err != nil {
		t.Fatal(err)
	}
	draft, err = repo.AgentGet(ctx, user, draft.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err = repo.AgentDelete(ctx, user, fixtureID(t), draft.ID, draft.ExpectedState); !errors.Is(err, ErrLocked) {
		t.Fatalf("deleted scheduled post %v", err)
	}
}
func TestAgentCalendarDraftReplayAndBoundSchedule(t *testing.T) {
	repo, user, _, _, input := agentCalendarFixture(t)
	ctx := context.Background()
	request := fixtureID(t)
	draft, err := repo.AgentMutate(ctx, user, request, "", "", "calendar.create_draft", input)
	if err != nil {
		t.Fatal(err)
	}
	again, err := repo.AgentMutate(ctx, user, request, "", "", "calendar.create_draft", input)
	if err != nil || again.ID != draft.ID {
		t.Fatalf("draft replay: %+v %v", again, err)
	}
	changed := map[string]any{}
	for k, v := range input {
		changed[k] = v
	}
	changed["title"] = "Different"
	if _, err = repo.AgentMutate(ctx, user, request, "", "", "calendar.create_draft", changed); !errors.Is(err, agentaction.ErrConflict) {
		t.Fatalf("changed request replay: %v", err)
	}
	if _, err = repo.AgentGet(ctx, fixtureID(t), draft.ID); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("foreign get: %v", err)
	}
	scheduleID := fixtureID(t)
	fields := map[string]any{"scheduledAt": time.Now().Add(2 * time.Hour).UTC().Format(time.RFC3339)}
	scheduled, err := repo.AgentMutate(ctx, user, scheduleID, draft.ID, draft.ExpectedState, "publishing.schedule", fields)
	if err != nil {
		t.Fatal(err)
	}
	replay, err := repo.AgentMutate(ctx, user, scheduleID, draft.ID, draft.ExpectedState, "publishing.schedule", fields)
	if err != nil || replay.Status != "scheduled" {
		t.Fatalf("schedule replay: %+v %v", replay, err)
	}
	if scheduled.Status != "scheduled" {
		t.Fatalf("not scheduled: %+v", scheduled)
	}
	var binding map[string]string
	var raw []byte
	if err = repo.db.QueryRow(`SELECT agent_binding FROM scheduled_posts WHERE id=$1`, draft.ID).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(raw, &binding); err != nil {
		t.Fatal(err)
	}
	if binding["request_id"] != scheduleID || len(binding["digest"]) != 64 {
		t.Fatalf("missing approval binding: %s", raw)
	}
	if _, err = repo.AgentMutate(ctx, user, fixtureID(t), draft.ID, draft.ExpectedState, "publishing.publish", map[string]any{}); !errors.Is(err, ErrAgentChanged) {
		t.Fatalf("stale approval: %v", err)
	}
	if _, err = repo.AgentMutate(ctx, user, fixtureID(t), draft.ID, scheduled.ExpectedState, "calendar.update", map[string]any{"caption": "Silent change"}); !errors.Is(err, ErrLocked) {
		t.Fatalf("unapproved scheduled edit: %v", err)
	}
	if err = repo.AgentCancel(ctx, user, draft.ID, fixtureID(t)); !errors.Is(err, ErrAgentChanged) {
		t.Fatalf("foreign receipt cancel: %v", err)
	}
	if err = repo.AgentCancel(ctx, user, draft.ID, scheduleID); err != nil {
		t.Fatal(err)
	}
	if err = repo.AgentCancel(ctx, user, draft.ID, scheduleID); err != nil {
		t.Fatal("cancel replay", err)
	}
	current, err := repo.AgentGet(ctx, user, draft.ID)
	if err != nil || current.Status != "draft" {
		t.Fatalf("cancel: %+v %v", current, err)
	}
	if _, err = repo.Mutate(ctx, user, draft.ID, map[string]any{"title": "Manual replacement"}, false); err != nil {
		t.Fatal(err)
	}
	if _, err = repo.AgentResult(ctx, user, draft.ID, scheduleID); !errors.Is(err, ErrAgentChanged) {
		t.Fatalf("superseded receipt result: %v", err)
	}
}
func TestAgentCalendarRejectsChangedMediaDestinationAndInventedConsent(t *testing.T) {
	for _, change := range []string{"clip", "account", "consent"} {
		t.Run(change, func(t *testing.T) {
			repo, user, clip, account, input := agentCalendarFixture(t)
			ctx := context.Background()
			draft, err := repo.AgentMutate(ctx, user, fixtureID(t), "", "", "calendar.create_draft", input)
			if err != nil {
				t.Fatal(err)
			}
			if change == "consent" {
				_, err = repo.AgentMutate(ctx, user, fixtureID(t), draft.ID, draft.ExpectedState, "calendar.update", map[string]any{"tiktok": map[string]any{"musicUsageConfirmed": true}})
				if err == nil {
					t.Fatal("agent invented provider consent")
				}
				return
			}
			query := `UPDATE clips SET file_storage_key='clips/replaced.mp4' WHERE id=$1`
			id := clip
			if change == "account" {
				query = `UPDATE social_accounts SET remote_id='different-remote' WHERE id=$1`
				id = account
			}
			if _, err = repo.db.Exec(query, id); err != nil {
				t.Fatal(err)
			}
			if _, err = repo.AgentMutate(ctx, user, fixtureID(t), draft.ID, draft.ExpectedState, "publishing.publish", map[string]any{}); !errors.Is(err, ErrAgentChanged) {
				t.Fatalf("changed %s accepted: %v", change, err)
			}
			current, err := repo.AgentGet(ctx, user, draft.ID)
			if err != nil || current.Status != "draft" {
				t.Fatalf("rejected approval wrote state: %+v %v", current, err)
			}
			raw, _ := json.Marshal(current)
			if strings.Contains(string(raw), "clips/") || strings.Contains(string(raw), "test-secret") {
				t.Fatalf("private refs exposed: %s", raw)
			}
		})
	}
}
