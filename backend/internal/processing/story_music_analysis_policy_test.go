package processing

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"sneepcut/backend-go/internal/story"
)

func TestMusicOnlySourceAnalysisDoesNotRequireSpeechModels(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	asset := storySource(t, p, dir, "muted-camera", "blue", 440)
	router := &nativeModelProvider{err: errors.New("speech routing temporarily unavailable")}
	p.ai = router
	p.cfg.WhisperPath = filepath.Join(dir, "speech-must-not-run")
	options := story.DefaultOptions()
	options.Music = &story.MusicSelection{TrackID: "incompetech:test", SourceAudio: "mute", Volume: .5}
	analyzed, err := p.Analyze(context.Background(), "muted-analysis", asset, options)
	if err != nil || router.calls != 0 || !analyzed.HasAudio || len(analyzed.Candidates) == 0 {
		t.Fatalf("inaudible speech model blocked music-only analysis: %+v %v", analyzed, err)
	}
	for _, candidate := range analyzed.Candidates {
		if candidate.Text != "" || len(candidate.Words) != 0 {
			t.Fatal("skipped speech analysis invented dialogue", candidate)
		}
	}
	if len(analyzed.TranscriptProposals) != 0 || len(analyzed.VoiceIntervals) != 0 {
		t.Fatal("muted source manufactured speech evidence")
	}
	p.cfg.FFmpegPath = filepath.Join(dir, "cached-mute-must-not-transcode")
	cached, err := p.Analyze(context.Background(), "muted-analysis", analyzed, options)
	if err != nil || cached.AnalysisVersion != analyzed.AnalysisVersion || router.calls != 0 {
		t.Fatal("muted retry did not reuse visual analysis", err)
	}
	options.Music.SourceAudio = "preserve"
	if _, err := p.Analyze(context.Background(), "muted-analysis", analyzed, options); err == nil || router.calls != 1 {
		t.Fatal("visual-only cache falsely satisfied original-speech analysis", err)
	}
}

func TestMutingPreservesExistingVerifiedSpeechCatalog(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	asset := storySource(t, p, dir, "reviewed-camera", "green", 440)
	t.Setenv("SNEEPCUT_NARRATION_ASR_FIXTURE", "1")
	p.cfg.WhisperPath, _ = os.Executable()
	p.cfg.WhisperVADPath = p.cfg.WhisperPath
	p.cfg.WhisperVADModel = filepath.Join(dir, "mock-vad.bin")
	if err := os.WriteFile(p.cfg.WhisperVADModel, []byte("fixture-model"), 0600); err != nil {
		t.Fatal(err)
	}
	options := story.DefaultOptions()
	analyzed, err := p.Analyze(context.Background(), "preserved-speech", asset, options)
	if err != nil || len(analyzed.Candidates) == 0 || analyzed.Candidates[0].Text == "" {
		t.Fatalf("speech fixture failed: %+v %v", analyzed, err)
	}
	before := story.ApplyTranscriptReviews(analyzed)
	options.Music = &story.MusicSelection{TrackID: "incompetech:test", SourceAudio: "mute", Volume: .5}
	p.ai = &nativeModelProvider{err: errors.New("must not resolve speech")}
	p.cfg.FFmpegPath = filepath.Join(dir, "must-not-transcode-reviewed-source")
	muted, err := p.Analyze(context.Background(), "preserved-speech", analyzed, options)
	if err != nil || !reflect.DeepEqual(before, muted) || !muted.HasAudio {
		t.Fatalf("muting changed source speech evidence: %+v %v", muted, err)
	}
}
