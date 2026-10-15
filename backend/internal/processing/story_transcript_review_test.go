package processing

import (
	"context"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/story"
)

func TestTranscriptProposalUsesVoiceEvidenceBeforeApprovingOverlappingWords(t *testing.T) {
	raw := story.Asset{ID: "source", Hash: strings.Repeat("a", 64), Duration: 12, Candidates: []story.Candidate{{ID: "source-s1", SourceID: "source", In: 1, Out: 11, Confidence: .506, Words: []story.Word{{Text: "o", Start: 2, End: 2.16}, {Text: "să", Start: 2.08, End: 2.5}, {Text: "un", Start: 3, End: 3.59}, {Text: "follow", Start: 3.51, End: 4}}}}}
	asset, err := applyStorySpeechPolicy(raw, story.DefaultOptions())
	if err != nil {
		t.Fatal(err)
	}
	asset = prepareStoryTranscriptProposals(asset, []Segment{{1.9, 4.1}}, true, nil)
	p := asset.TranscriptProposals[0]
	if !p.TimingVerified || len(p.Words) != 2 || p.Words[0].Text != "o să" || p.Words[1].Text != "un follow" {
		t.Fatalf("overlap was not resolved by measured voice bounds: %+v", p)
	}
	approved, err := story.ApproveTranscript(asset, p.ID, []string{"o să", "un follow"})
	if err != nil {
		t.Fatal(err)
	}
	if len(approved.Candidates[0].Words) != 2 || approved.Candidates[0].In != 1 || approved.Candidates[0].Out != 11 || strings.Contains(strings.Join(approved.Warnings, " "), storySpeechWithheldPrefix) {
		t.Fatalf("review did not preserve full speech or clear resolved warning: %+v", approved)
	}
	for _, intervals := range [][]Segment{nil, {{1.9, 2.1}, {3.8, 4.1}}} {
		unsafe, _ := applyStorySpeechPolicy(raw, story.DefaultOptions())
		unsafe = prepareStoryTranscriptProposals(unsafe, intervals, len(intervals) > 0, nil)
		if unsafe.TranscriptProposals[0].TimingVerified {
			t.Fatal("missing or ambiguous voice timing certified")
		}
	}
}

func TestReviewedTranscriptSurvivesImmutableASRCacheWithoutRetranscription(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	asset := storySource(t, p, dir, "reviewed", "blue", 440)
	t.Setenv("SNEEPCUT_NARRATION_ASR_FIXTURE", "1")
	t.Setenv("SNEEPCUT_NARRATION_ASR_LOW", "1")
	p.cfg.WhisperPath, _ = os.Executable()
	p.cfg.WhisperVADPath = p.cfg.WhisperPath
	p.cfg.WhisperVADModel = filepath.Join(dir, "mock-vad.bin")
	if err := os.WriteFile(p.cfg.WhisperVADModel, []byte("mock-model"), 0600); err != nil {
		t.Fatal(err)
	}
	first, err := p.Analyze(context.Background(), "review-cache", asset, story.DefaultOptions())
	if err != nil {
		t.Fatal(err)
	}
	if len(first.TranscriptProposals) != 1 || !first.TranscriptProposals[0].TimingVerified {
		t.Fatalf("no timed proposal: %+v", first)
	}
	var text []string
	for _, word := range first.TranscriptProposals[0].Words {
		text = append(text, word.Text)
	}
	text[0] = "Reviewed"
	approved, err := story.ApproveTranscript(first, first.TranscriptProposals[0].ID, text)
	if err != nil {
		t.Fatal(err)
	}
	p.cfg.WhisperPath, p.cfg.FFmpegPath = filepath.Join(dir, "must-not-transcribe"), filepath.Join(dir, "must-not-transcode")
	again, err := p.Analyze(context.Background(), "review-cache", approved, story.DefaultOptions())
	if err != nil || !again.TranscriptProposals[0].Reviewed || !reflect.DeepEqual(again.Candidates[0].Words, approved.Candidates[0].Words) {
		t.Fatalf("cache dropped owner transcript or retranscribed: %+v %v", again, err)
	}
}
