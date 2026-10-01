package processing

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/story"
)

func TestStorySpeechPolicyWithholdsWholeWeakPhraseOnly(t *testing.T) {
	good := story.Candidate{ID: "source-s1", SourceID: "source", In: 0, Out: 2, Text: "Keep this.", Words: []story.Word{{Text: "Keep", Start: .1, End: .5}, {Text: "this.", Start: .6, End: 1.5}}, Confidence: .92, Role: "a_roll", Language: "en"}
	weak := story.Candidate{ID: "source-s2", SourceID: "source", In: 2, Out: 4, Text: "Do not agree.", Words: []story.Word{{Text: "Do", Start: 2.1, End: 2.5}, {Text: "not", Start: 2.6, End: 3}, {Text: "agree.", Start: 3.1, End: 3.5}}, Confidence: .113599, Role: "a_roll", AudioScore: .8, VisualScore: .7}
	last := good
	last.ID, last.In, last.Out = "source-s3", 4, 6
	last.Words = []story.Word{{Text: "Keep this.", Start: 4.1, End: 5.5}}
	asset := story.Asset{ID: "source", Key: "sources/original.mov", Hash: strings.Repeat("a", 64), Duration: 6, HasAudio: true, AnalysisVersion: "raw-asr-cache", Candidates: []story.Candidate{good, weak, last}, Warnings: []string{storySpeechLanguageWarning, storySpeechLanguageWarning, "Original rotation normalized", "Original rotation normalized"}}
	got, err := applyStorySpeechPolicy(asset, story.DefaultOptions())
	if err != nil || len(got.Candidates) != 3 {
		t.Fatal("policy removed source intervals", err)
	}
	if !reflect.DeepEqual(got.Candidates[0], good) || !reflect.DeepEqual(got.Candidates[2], last) {
		t.Fatal("one unreliable phrase changed reliable surrounding speech")
	}
	if got.Candidates[1].Text != "" || len(got.Candidates[1].Words) != 0 || got.Candidates[1].Role != "b_roll" || got.Candidates[1].ID != weak.ID || got.Candidates[1].In != weak.In || got.Candidates[1].Out != weak.Out || got.Candidates[1].AudioScore != weak.AudioScore || !got.HasAudio || got.Key != asset.Key {
		t.Fatal("policy changed source audio/provenance or retained partial misleading captions")
	}
	if !reflect.DeepEqual(asset.Candidates[1], weak) || asset.AnalysisVersion != "raw-asr-cache" || got.AnalysisVersion == asset.AnalysisVersion {
		t.Fatal("immutable raw ASR was altered or policy catalog version was not updated")
	}
	warnings := strings.Join(got.Warnings, "\n")
	if !strings.Contains(warnings, "2.00–4.00") || strings.Contains(warnings, storySpeechLanguageWarning) || strings.Count(warnings, "Original rotation normalized") != 1 {
		t.Fatalf("wrong interval or stale/duplicated analysis warnings: %s", warnings)
	}
}

func TestStorySpeechPolicyRequiresMeasuredConfidenceAndKeepsThresholdBoundary(t *testing.T) {
	for _, tc := range []struct {
		name        string
		probability float64
		reason      string
		withheld    bool
	}{
		{"old permissive boundary", .20, "", true},
		{"new boundary", .55, "", false},
		{"very low", .01, "", true},
		{"measured zero", 0, "Complete aligned phrase; lowest lexical-token ASR probability 0.000.", true},
		{"unavailable is not measured zero", 0, "ASR confidence is unavailable", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			asset := story.Asset{Duration: 1, Candidates: []story.Candidate{{ID: "phrase", In: 0, Out: 1, Text: "No.", Words: []story.Word{{Text: "No.", Start: 0, End: 1}}, Confidence: tc.probability, Reason: tc.reason, Role: "a_roll"}}}
			got, err := applyStorySpeechPolicy(asset, story.DefaultOptions())
			if err != nil || (len(got.Candidates[0].Words) == 0) != tc.withheld {
				t.Fatalf("unexpected evidence policy: %#v %v", got, err)
			}
		})
	}
}

func TestStorySpeechPolicySplitsLongUnverifiedVisualsAndRemovesCaptions(t *testing.T) {
	asset := story.Asset{ID: "source", Duration: 16, HasAudio: true, Candidates: []story.Candidate{{
		ID: "weak", SourceID: "source", In: 0, Out: 16, Text: "Probably wrong words.",
		Words:      []story.Word{{Text: "Probably wrong words.", Start: 0, End: 16}},
		Confidence: .31, Role: "a_roll", VisualScore: .9,
	}}}
	got, err := applyStorySpeechPolicy(asset, story.DefaultOptions())
	if err != nil || len(got.Candidates) != 4 {
		t.Fatalf("long weak phrase was not split into montage windows: %#v %v", got.Candidates, err)
	}
	for i, candidate := range got.Candidates {
		if candidate.Text != "" || len(candidate.Words) != 0 || candidate.Role != "b_roll" || candidate.Out-candidate.In > storyMaximumVisualShotSeconds+.001 {
			t.Fatalf("unsafe visual window %d: %#v", i, candidate)
		}
		if candidate.ID != fmt.Sprintf("weak-cut%d", i+1) {
			t.Fatalf("visual IDs are not deterministic: %#v", got.Candidates)
		}
	}
}

func TestNarrationWeakPhraseRequestsIntervalSpecificReview(t *testing.T) {
	asset := story.Asset{Kind: "narration", Duration: 90, Candidates: []story.Candidate{{ID: "uncertain", In: 45, Out: 47, Text: "A name.", Words: []story.Word{{Text: "A name.", Start: 45, End: 47}}, Confidence: .1}}}
	if _, err := applyStorySpeechPolicy(asset, story.Options{Narration: true}); err == nil || !strings.Contains(err.Error(), "45.00–47.00") || !strings.Contains(err.Error(), "manual transcript review") {
		t.Fatalf("uncertain narration accepted or lacked actionable interval: %v", err)
	}
}

func TestStorySpeechPolicyUsesRawCacheAndPreservesSemanticAnnotations(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	asset := storySource(t, p, dir, "weak", "blue", 440)
	t.Setenv("SNEEPCUT_NARRATION_ASR_FIXTURE", "1")
	t.Setenv("SNEEPCUT_NARRATION_ASR_LOW", "1")
	p.cfg.WhisperPath, _ = os.Executable()
	p.cfg.WhisperVADPath = p.cfg.WhisperPath
	p.cfg.WhisperVADModel = filepath.Join(dir, "mock-vad.bin")
	if err := os.WriteFile(p.cfg.WhisperVADModel, []byte("mock-model"), 0600); err != nil {
		t.Fatal(err)
	}
	first, err := p.Analyze(context.Background(), "speech-policy-cache", asset, story.DefaultOptions())
	if err != nil || first.Candidates[0].Text != "" {
		t.Fatalf("fresh ASR bypassed policy: %#v %v", first, err)
	}
	cacheFile := filepath.Join(dir, "raw-analysis.json")
	cacheKey := strings.TrimSuffix(first.ProxyKey, "proxy.mp4") + "analysis.json"
	if err := p.materialize(context.Background(), cacheKey, cacheFile); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(cacheFile)
	var cached story.Asset
	if err != nil || json.Unmarshal(raw, &cached) != nil || cached.Candidates[0].Text != "Original voice." || cached.AnalysisVersion == first.AnalysisVersion {
		t.Fatal("policy overwrote the reusable raw ASR cache")
	}
	first.Candidates[0].Idea, first.Candidates[0].Reason = "A blue scene", "Observed source colors"
	first.SemanticAnalysisVersion = "same-policy-semantic-cache"
	p.cfg.WhisperPath, p.cfg.FFmpegPath = filepath.Join(dir, "must-not-transcribe"), filepath.Join(dir, "must-not-transcode")
	again, err := p.Analyze(context.Background(), "speech-policy-cache", first, story.DefaultOptions())
	if err != nil || again.AnalysisVersion != first.AnalysisVersion || again.SemanticAnalysisVersion != first.SemanticAnalysisVersion || again.Candidates[0].Idea != "A blue scene" || len(again.Candidates[0].Words) != 0 {
		t.Fatalf("post-policy cache reran media or lost allowed semantics: %#v %v", again, err)
	}
}
