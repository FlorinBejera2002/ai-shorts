package processing

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/story"
)

func TestStorySpeechRequiresDetectorAndRefreshesWhenInstalled(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	asset := storySource(t, p, dir, "ambient", "green", 440)
	p.cfg.WhisperVADModel = filepath.Join(dir, "vad.bin")
	refuseSpeech(p)
	options := story.DefaultOptions()
	visual, err := p.Analyze(context.Background(), "detector-safety", asset, options)
	if err != nil || len(visual.Candidates) == 0 || visual.Candidates[0].Text != "" || len(visual.Candidates[0].Words) != 0 || !strings.Contains(strings.Join(visual.Warnings, " "), "Voice activity detection is unavailable") {
		t.Fatalf("missing VAD invented speech or lost the source: %#v, %v", visual, err)
	}
	// Installing the missing detector must invalidate this visual-only result.
	t.Setenv("SNEEPCUT_NARRATION_ASR_FIXTURE", "1")
	useFixtureSpeech(p)
	if err := os.WriteFile(p.cfg.WhisperVADModel, []byte("mock-detector"), 0600); err != nil {
		t.Fatal(err)
	}
	spoken, err := p.Analyze(context.Background(), "detector-safety", visual, options)
	if err != nil || spoken.AnalysisVersion == visual.AnalysisVersion || spoken.Candidates[0].Text != "Original voice." {
		t.Fatalf("installing VAD reused stale speech analysis: %#v, %v", spoken, err)
	}
	if strings.Contains(strings.Join(spoken.Warnings, " "), "Voice activity detection is unavailable") {
		t.Fatal("successful detector installation retained a stale setup warning")
	}
	// A detector returning no voice must retain usable visual footage without
	// turning the previous transcript into captions for this new analysis.
	t.Setenv("SNEEPCUT_NARRATION_ASR_EMPTY", "1")
	if err := os.WriteFile(p.cfg.WhisperVADModel, []byte("updated-mock-detector"), 0600); err != nil {
		t.Fatal(err)
	}
	quiet, err := p.Analyze(context.Background(), "detector-safety", spoken, options)
	if err != nil || quiet.AnalysisVersion == spoken.AnalysisVersion || quiet.Candidates[0].Text != "" || quiet.Candidates[0].Role != "b_roll" {
		t.Fatalf("updated no-voice detection retained stale captions: %#v, %v", quiet, err)
	}
}

func TestNarrationRequiresWorkingSpeechDetector(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	voice := narrationAudioFixture(t, p, dir, "voice.wav", false, "-c:a", "pcm_s16le")
	p.cfg.WhisperVADModel = filepath.Join(dir, "missing-detector.bin")
	refuseSpeech(p)
	options := story.DefaultOptions()
	options.Narration = true
	if _, err := p.Analyze(context.Background(), "narration-detector", voice, options); err == nil || !strings.Contains(err.Error(), "install the voice activity detection model") {
		t.Fatalf("unverified narration accepted or missing setup not explained: %v", err)
	}
}

func TestStoryTokenConfidenceUsesOriginalVADSegmentClock(t *testing.T) {
	words := []story.Word{{Text: "Do", Start: 8, End: 8.3}, {Text: "not", Start: 8.3, End: 8.6}}
	candidates := []story.Candidate{{ID: "source-s1", In: 7.9, Out: 8.7, Words: words}}
	raw := []byte(`{"transcription":[{"offsets":{"from":8000,"to":8300},"tokens":[{"text":" Do","p":0.97,"offsets":{"from":0,"to":300}}]},{"offsets":{"from":8300,"to":8600},"tokens":[{"text":" not","p":0.36,"offsets":{"from":300,"to":600}}]}]}`)
	storyTranscriptConfidence(raw, candidates)
	if candidates[0].Confidence != .36 || len(candidates[0].Words) != 2 || candidates[0].Words[1].Text != "not" {
		t.Fatalf("weak negation was dropped or assigned the wrong confidence: %#v", candidates[0])
	}
}

