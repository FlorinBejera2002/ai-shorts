package processing

import (
	"context"
	"encoding/json"
	"os"
	"path"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/media"
	"sneepcut/backend-go/internal/story"
)

func originalSpeechEvidenceFixture(t *testing.T, asset story.Asset, intervals []Segment) (*Processor, string) {
	t.Helper()
	dir := t.TempDir()
	storage, err := media.NewLocalStorage(filepath.Join(dir, "media"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = storage.Close() })
	cfg, err := ConfigFromEnv(func(string) string { return "" })
	if err != nil {
		t.Fatal(err)
	}
	cfg.TempDir = dir
	cfg.WhisperPath = filepath.Join(dir, "unavailable-whisper")
	cfg.WhisperVADPath = filepath.Join(dir, "unavailable-vad")
	cfg.WhisperVADModel = filepath.Join(dir, "unavailable-model")
	p := New(cfg, storage, nil)
	if intervals != nil {
		model := p.cfg.StoryWhisperModel
		if model == "" {
			model = p.cfg.WhisperModel
		}
		version := storyDigest([]any{storyVoiceClockVersion, storyVADArguments, storyModelSignature(p.storyVADModel(model)), storyModelSignature(p.storyVADExecutable())})
		data, err := json.Marshal(storyVoiceEvidence{Version: version, SourceHash: asset.Hash, Duration: asset.Duration, Intervals: intervals, Padding: configuredStoryVoicePadding(storyVADArguments)})
		if err != nil {
			t.Fatal(err)
		}
		file := filepath.Join(dir, "measured-voice.json")
		if err := os.WriteFile(file, data, 0600); err != nil {
			t.Fatal(err)
		}
		key := path.Dir(asset.ProxyKey) + "/voice-intervals-" + version + ".json"
		if err := storage.Save(context.Background(), file, key, "application/json"); err != nil {
			t.Fatal(err)
		}
	}
	return p, dir
}

func TestOriginalSpeechEvidenceSurvivesUnverifiedCaptionTiming(t *testing.T) {
	asset := story.Asset{
		ID: "source-seven", Key: "sources/original.mp4", ProxyKey: "sources/proxy/source.mp4", Hash: "original-hash", Duration: 14, HasAudio: true,
		Candidates: []story.Candidate{{ID: "source-seven-phrase", SourceID: "source-seven", In: 8.14, Out: 13.55, Text: "dreapta", Confidence: .1,
			Words: []story.Word{{Text: "dreapta", Start: 9.04, End: 10.62}}}},
	}
	p, dir := originalSpeechEvidenceFixture(t, asset, []Segment{{8.14, 10.01}, {10.47, 13.55}})
	got, err := p.prepareStorySpeechCatalog(context.Background(), dir, asset, story.Options{PreserveOriginalSpeech: true})
	if err != nil {
		t.Fatal(err)
	}
	want := []story.Interval{{SourceID: asset.ID, In: 8.14, Out: 10.01}, {SourceID: asset.ID, In: 10.47, Out: 13.55}}
	if !reflect.DeepEqual(got.VoiceIntervals, want) || got.Key != asset.Key || !got.HasAudio {
		t.Fatalf("unverified captions lost original voice evidence: %+v", got)
	}
	if len(got.TranscriptProposals) != 1 || got.TranscriptProposals[0].TimingVerified || got.TranscriptProposals[0].Reviewed {
		t.Fatal("voice coverage must not certify a word spanning two distant voice intervals")
	}
	for _, candidate := range got.Candidates {
		if len(candidate.Words) != 0 || candidate.Text != "" {
			t.Fatal("unverified source words became executable captions")
		}
	}
}

func TestOriginalSpeechEvidenceMeasuresVoiceWithoutASRWords(t *testing.T) {
	asset := story.Asset{ID: "source", Key: "sources/original.mp4", ProxyKey: "sources/proxy/source.mp4", Hash: "original-hash", Duration: 6, HasAudio: true,
		Candidates: []story.Candidate{{ID: "visual", SourceID: "source", In: 0, Out: 6, Role: "b_roll"}}}
	p, dir := originalSpeechEvidenceFixture(t, asset, []Segment{{1, 2}, {4, 5}})
	options := story.Options{Brief: "Păstrează vocea originală integrală, cu sunetul sincronizat și subtitrări în limba vorbită."}
	got, err := p.prepareStorySpeechCatalog(context.Background(), dir, asset, options)
	if err != nil || !reflect.DeepEqual(got.VoiceIntervals, []story.Interval{{SourceID: "source", In: 1, Out: 2}, {SourceID: "source", In: 4, Out: 5}}) {
		t.Fatalf("an empty transcript was mistaken for silence: %+v %v", got.VoiceIntervals, err)
	}
	if len(got.TranscriptProposals) != 0 {
		t.Fatal("voice detection invented transcript words")
	}
}

func TestOriginalSpeechEvidenceDoesNotTrustStaleOrUnavailableVoiceClock(t *testing.T) {
	asset := story.Asset{ID: "source", Key: "sources/original.mp4", ProxyKey: "sources/proxy/source.mp4", Hash: "original-hash", Duration: 6, HasAudio: true,
		VoiceIntervals: []story.Interval{{SourceID: "source", In: 0, Out: 6}}}
	p, dir := originalSpeechEvidenceFixture(t, asset, nil)
	got, err := p.prepareStorySpeechCatalog(context.Background(), dir, asset, story.Options{PreserveOriginalSpeech: true})
	if err == nil || !strings.Contains(err.Error(), "cannot verify complete original speech") || len(got.VoiceIntervals) != 0 {
		t.Fatalf("missing source evidence was certified: %+v %v", got.VoiceIntervals, err)
	}
	got, err = p.prepareStorySpeechCatalog(context.Background(), dir, asset, story.DefaultOptions())
	if err != nil || len(got.VoiceIntervals) != 0 {
		t.Fatalf("ordinary visual montage acquired a new voice-evidence requirement: %+v %v", got.VoiceIntervals, err)
	}
}
