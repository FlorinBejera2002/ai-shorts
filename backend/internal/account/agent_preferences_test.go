package account

import (
	"context"
	"encoding/json"
	"errors"
	"sneepcut/backend-go/internal/agentaction"
	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/testdb"
	"testing"
)

func TestAgentPreferencesPreserveOmittedFieldsAndRejectStaleUndo(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	user, _ := data.NewUUID()
	if _, err := db.Exec(`INSERT INTO users(id,email,provider,credits,plan) VALUES($1,$2,'credentials',100,'free')`, user, user+"@example.invalid"); err != nil {
		t.Fatal(err)
	}
	before, err := AgentReadPreferences(ctx, db, user)
	if err != nil {
		t.Fatal(err)
	}
	request, _ := data.NewUUID()
	patch := json.RawMessage(`{"locale":"ro","theme":"dark"}`)
	updated, err := AgentPatchPreferences(ctx, db, user, request, before.ExpectedState, patch)
	if err != nil {
		t.Fatal(err)
	}
	if updated.Preferences.Locale != "ro" || updated.Preferences.Theme != "dark" || updated.Preferences.Timezone != before.Preferences.Timezone || !updated.Preferences.EmailSecurity {
		t.Fatal("patch lost preferences", updated)
	}
	replay, err := AgentPatchPreferences(ctx, db, user, request, before.ExpectedState, patch)
	if err != nil || replay.ExpectedState != updated.ExpectedState {
		t.Fatal("retry failed", err)
	}
	if _, err = AgentPatchPreferences(ctx, db, user, request, before.ExpectedState, json.RawMessage(`{"locale":"en"}`)); !errors.Is(err, agentaction.ErrConflict) {
		t.Fatal("changed request replay", err)
	}
	manual := updated.Preferences
	manual.Timezone = "Europe/Bucharest"
	if _, err = updateAgentPreferences(ctx, db, user, "", "", manual); err != nil {
		t.Fatal(err)
	}
	undo, _ := json.Marshal(updated.Previous)
	next, _ := data.NewUUID()
	if _, err = AgentPatchPreferences(ctx, db, user, next, updated.ExpectedState, undo); !errors.Is(err, agentaction.ErrConflict) {
		t.Fatal("stale undo overwrote manual edit", err)
	}
	latest, _ := AgentReadPreferences(ctx, db, user)
	if latest.Preferences.Timezone != "Europe/Bucharest" {
		t.Fatal("manual preference lost")
	}
	next, _ = data.NewUUID()
	if _, err = AgentPatchPreferences(ctx, db, user, next, latest.ExpectedState, json.RawMessage(`{"timezone":"not/a/timezone"}`)); err == nil {
		t.Fatal("invalid preferences accepted")
	}
}
