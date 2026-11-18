package story

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"sneepcut/backend-go/internal/airouting"
)

// Opt-in diagnostic for an explicitly supplied, previously analyzed source set.
// It calls the configured hosted planner but never reads/writes a database,
// renders, publishes, or changes the user's saved version.
func TestHostedStoryPlanningReplay(t *testing.T) {
	dir := os.Getenv("SNEEPCUT_STORY_PLAN_REPLAY")
	if dir == "" {
		t.Skip("set SNEEPCUT_STORY_PLAN_REPLAY to an authorized request.json/music.json fixture directory")
	}
	read := func(name string, value any) {
		t.Helper()
		data, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			t.Fatal(err)
		}
		if err = json.Unmarshal(data, value); err != nil {
			t.Fatal(err)
		}
	}
	var req Request
	read("request.json", &req)
	read("music.json", &req.Music)
	if len(req.Assets) == 0 || req.Music == nil {
		t.Fatal("replay needs analyzed sources and prepared music evidence")
	}
	ai := airouting.NewService(nil, airouting.Options{Provider: os.Getenv("AI_PROVIDER"), GeminiKey: os.Getenv("GEMINI_API_KEY"), OpenRouterKey: os.Getenv("OPENROUTER_API_KEY")}, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	budget := &runBudget{max: 2}
	started := time.Now()
	plan, err := New(nil, ai, DefaultLimits()).plan(ctx, req, budget)
	if err != nil {
		t.Fatal(err)
	}
	for _, gap := range plan.Gaps {
		if strings.Contains(gap, "planner proposal was rejected") || strings.Contains(gap, "Global AI planning was unavailable") {
			t.Fatal("replay used fallback planning", gap)
		}
	}
	plan, timeline, sync, err := synchronizeMusic(req, plan)
	if err != nil || len(timeline) == 0 || hasBlocking(ValidatePlan(plan, req.Assets, req.Options, nil)) {
		t.Fatalf("planned edit did not pass source/timing validation: %v", err)
	}
	result := struct {
		Plan     Plan       `json:"plan"`
		Timeline []Entry    `json:"timeline"`
		Music    *MusicSync `json:"music_sync"`
	}{plan, timeline, sync}
	data, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(filepath.Join(dir, "planned.json"), data, 0600); err != nil {
		t.Fatal(err)
	}
	t.Logf("hosted_plan_success=true calls=%d seconds=%.1f blocks=%d duration=%.3f target=%d gaps=%d", budget.calls, time.Since(started).Seconds(), len(timeline), timelineDuration(timeline), req.Options.TargetSeconds, len(plan.Gaps))
	for _, entry := range timeline {
		t.Logf("output %.3f..%.3f candidate=%s source %.3f..%.3f transition=%s", entry.OutputIn, entry.OutputOut, entry.CandidateID, entry.Video.In, entry.Video.Out, entry.Transition)
	}
}
