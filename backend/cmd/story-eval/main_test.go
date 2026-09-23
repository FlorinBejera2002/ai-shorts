package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/story"
)

func TestEvaluationPathsPreserveCompleteManifestOrder(t *testing.T) {
	dir := t.TempDir()
	input := filepath.Join(dir, "input")
	if err := os.Mkdir(input, 0700); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"one.mp4", "two.MOV"} {
		if err := os.WriteFile(filepath.Join(input, name), []byte("fixture"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	manifest := filepath.Join(input, "manifest.json")
	if err := os.WriteFile(manifest, []byte(`{"upload_order":["two.MOV","one.mp4"]}`), 0600); err != nil {
		t.Fatal(err)
	}
	_, _, files, err := evaluationPaths(input, filepath.Join(dir, "runs"))
	if err != nil || len(files) != 2 || filepath.Base(files[0]) != "two.MOV" {
		t.Fatalf("manifest order %v %v", files, err)
	}
	for _, order := range []string{`["one.mp4"]`, `["one.mp4","one.mp4"]`, `["../two.MOV","one.mp4"]`} {
		if err := os.WriteFile(manifest, []byte(`{"upload_order":`+order+`}`), 0600); err != nil {
			t.Fatal(err)
		}
		if _, _, _, err := evaluationPaths(input, filepath.Join(dir, "runs")); err == nil {
			t.Fatal("invalid source manifest accepted", order)
		}
	}
	if _, _, _, err := evaluationPaths(input, filepath.Join(input, "results")); err == nil {
		t.Fatal("output nested in source directory accepted")
	}
}

func TestOfflineEvaluationDoesNotReadProviderCredentials(t *testing.T) {
	ai, name, err := evaluationProvider("offline", func(string) string { t.Fatal("offline mode inspected credentials"); return "" })
	if err != nil || ai != nil || name != "offline" {
		t.Fatal(ai, name, err)
	}
	if _, _, err := evaluationProvider("configured", func(string) string { return "" }); err == nil {
		t.Fatal("configured mode silently fell back")
	}
	var help bytes.Buffer
	if err := runEvaluation(context.Background(), []string{"-help"}, func(string) string { t.Fatal("help inspected credentials"); return "" }, &help); err != nil || !strings.Contains(help.String(), "-provider") {
		t.Fatalf("help %v %s", err, help.String())
	}
	for _, flag := range []string{"-max-ai-calls=13", "-repair-cycles=3", "-timeout=3h"} {
		if _, err := parseFlags([]string{"-input=input", "-output=output", flag}, io.Discard); err == nil {
			t.Fatal("unbounded evaluation accepted", flag)
		}
	}
}

func TestNarrationEvaluationPreservesRecordingOnReplay(t *testing.T) {
	cfg, err := parseFlags([]string{"-input=footage", "-output=runs", "-narration-file=voice.wav"}, io.Discard)
	if err != nil || !cfg.options.Narration || cfg.narrationFile != "voice.wav" {
		t.Fatal(cfg, err)
	}
	if _, err = parseFlags([]string{"-replay=old-run", "-output=runs", "-narration-file=new.wav"}, io.Discard); err == nil {
		t.Fatal("replay silently replaced original voice")
	}
	a := story.Asset{ID: "voice", Kind: "narration"}
	b := a
	b.Kind = "video"
	if sameSourceIdentity(a, b) {
		t.Fatal("replay ignored media kind")
	}
}

func TestEvaluationCheckpointsAreImmutableAndBudgeted(t *testing.T) {
	dir := t.TempDir()
	checkpoints, err := newFileCheckpoints(dir, io.Discard, 2)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	for i := 0; i < 2; i++ {
		if err := checkpoints.SaveVersion(ctx, story.Version{Number: 1, Accepted: i == 1}); err != nil {
			t.Fatal(err)
		}
	}
	if err := checkpoints.reserveAI(ctx); err != nil {
		t.Fatal(err)
	}
	if err := checkpoints.reserveAI(ctx); err != nil {
		t.Fatal(err)
	}
	if err := checkpoints.reserveAI(ctx); !errors.Is(err, story.ErrBudget) {
		t.Fatal("budget exceeded", err)
	}
	files, err := os.ReadDir(filepath.Join(dir, "checkpoints"))
	if err != nil || len(files) != 4 {
		t.Fatalf("checkpoint overwrote history %d %v", len(files), err)
	}
	file := filepath.Join(dir, "protected.json")
	if err := writeJSONExclusive(file, map[string]int{"value": 1}); err != nil {
		t.Fatal(err)
	}
	if err := writeJSONExclusive(file, map[string]int{"value": 2}); err == nil {
		t.Fatal("existing artifact overwritten")
	}
}

func TestOfflineEvaluationRunsProductionPipelineOnFiveFiles(t *testing.T) {
	for _, binary := range []string{"ffmpeg", "ffprobe"} {
		if _, err := exec.LookPath(binary); err != nil {
			t.Skip("requires local FFmpeg/FFprobe")
		}
	}
	dir := t.TempDir()
	input := filepath.Join(dir, "inputs")
	output := filepath.Join(dir, "runs")
	if err := os.Mkdir(input, 0700); err != nil {
		t.Fatal(err)
	}
	fixture := filepath.Join(input, "01.mp4")
	command := exec.Command("ffmpeg", "-nostdin", "-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=160x90:r=30", "-t", "1.2", "-c:v", "libx264", "-pix_fmt", "yuv420p", fixture)
	if out, err := command.CombinedOutput(); err != nil {
		t.Fatalf("FFmpeg fixture %v %s", err, out)
	}
	data, err := os.ReadFile(fixture)
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"02.mp4", "03.mp4", "04.mp4", "05.mp4"} {
		if err := os.WriteFile(filepath.Join(input, name), data, 0600); err != nil {
			t.Fatal(err)
		}
	}
	var console bytes.Buffer
	if err := runEvaluation(context.Background(), []string{"-input", input, "-output", output, "-provider", "offline", "-target", "15", "-aspect", "16:9", "-repair-cycles", "0"}, func(string) string { return "" }, &console); err != nil {
		failures, _ := filepath.Glob(filepath.Join(output, "*", "checkpoints", "*-failure.json"))
		for _, failure := range failures {
			if data, readErr := os.ReadFile(failure); readErr == nil {
				t.Logf("Synthetic fixture failure: %s", data)
			}
		}
		t.Fatalf("production evaluation: %v\n%s", err, console.String())
	}
	runs, err := os.ReadDir(output)
	if err != nil || len(runs) != 1 {
		t.Fatalf("unique run missing %v", err)
	}
	runDir := filepath.Join(output, runs[0].Name())
	var summary struct {
		Status   string
		Provider string
		AICalls  int `json:"provider_calls"`
		Preview  string
	}
	data, err = os.ReadFile(filepath.Join(runDir, "summary.json"))
	if err != nil || json.Unmarshal(data, &summary) != nil {
		t.Fatalf("summary %v", err)
	}
	if summary.Status != "needs_review" || summary.Provider != "offline" || summary.AICalls != 0 || summary.Preview == "" {
		t.Fatalf("offline falsely verified %#v", summary)
	}
	if _, err := os.Stat(summary.Preview); err != nil {
		t.Fatal("preview not playable artifact", err)
	}
	var request story.Request
	data, err = os.ReadFile(filepath.Join(runDir, "request.json"))
	if err != nil || json.Unmarshal(data, &request) != nil || len(request.Assets) != 5 {
		t.Fatal("source provenance missing", err)
	}
	for _, asset := range request.Assets {
		if len(asset.Hash) != 64 || asset.Key == "" {
			t.Fatal("source checksum missing")
		}
	}
	for _, file := range []string{"quality-report.json", "timeline-version.json", "repair-attempts.json", "provenance.json", "result.json"} {
		if _, err := os.Stat(filepath.Join(runDir, file)); err != nil {
			t.Fatal("missing report", file)
		}
	}
	t.Run("replay preserves analysis and all previous artifacts", func(t *testing.T) {
		before := snapshotFiles(t, runDir)
		previous, err := loadReplay(runDir)
		if err != nil {
			t.Fatal(err)
		}
		console.Reset()
		if err = runEvaluation(context.Background(), []string{"-replay", runDir, "-output", output, "-repair-cycles", "0"}, func(string) string { return "" }, &console); err != nil {
			t.Fatalf("offline replay: %v\n%s", err, console.String())
		}
		entries, err := os.ReadDir(output)
		if err != nil || len(entries) != 2 {
			t.Fatal("replay did not create exactly one new run", err)
		}
		var replayDir string
		for _, entry := range entries {
			if entry.Name() != filepath.Base(runDir) {
				replayDir = filepath.Join(output, entry.Name())
			}
		}
		var replayRequest story.Request
		if _, err = readReplayJSON(filepath.Join(replayDir, "request.json"), &replayRequest); err != nil {
			t.Fatal(err)
		}
		if replayRequest.ID != request.ID || replayRequest.Base != nil || replayRequest.VersionStart <= previous.highestVersion || replayRequest.Options != request.Options {
			t.Fatal("replay did not preserve source identity/options or reserve new versions")
		}
		for i, asset := range replayRequest.Assets {
			old := previous.request.Assets[i]
			if asset.AnalysisVersion == "" || asset.AnalysisVersion != old.AnalysisVersion || asset.ProxyKey != old.ProxyKey || len(asset.Candidates) != len(old.Candidates) {
				t.Fatal("replay lost source analysis or proxy cache")
			}
		}
		var provenance evaluationProvenance
		if _, err = readReplayJSON(filepath.Join(replayDir, "provenance.json"), &provenance); err != nil {
			t.Fatal(err)
		}
		if provenance.Provider != "offline" || provenance.Replay == nil || provenance.Replay.VerifiedSources != 5 || provenance.Replay.LinkedCacheFiles+provenance.Replay.CopiedCacheFiles == 0 {
			t.Fatal("replay did not document verification/cache provenance")
		}
		if _, err = loadReplay(replayDir); err != nil {
			t.Fatal("a replay cannot itself be replayed", err)
		}
		if after := snapshotFiles(t, runDir); !reflect.DeepEqual(before, after) {
			t.Fatal("offline replay modified a prior source, analysis, report or timestamp")
		}
	})
}
