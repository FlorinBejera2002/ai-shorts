package processing

import (
	"context"
	"encoding/json"
	"math"
	"os"
	"path"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/story"
)

func TestStoryVoicePaddingNormalizesOnlyVerifiedPunctuationTail(t *testing.T) {
	words := []story.Word{{Text: "dreapta,", Start: 9.04, End: 10.62}, {Text: "iar", Start: 10.62, End: 11.04}}
	intervals := []Segment{{1.48, 7.19}, {7.21, 8.24}, {8.24, 10.01}, {10.47, 12.13}, {12.13, 13.37}}
	rawWords, rawIntervals := slices.Clone(words), slices.Clone(intervals)
	got, changed := normalizeStoryProposalPadding(words, intervals, 14.34, configuredStoryVoicePadding(storyVADArguments))
	want := []story.Word{{Text: "dreapta,", Start: 9.04, End: 10.01}, {Text: "iar", Start: 10.62, End: 11.04}}
	if !changed || !reflect.DeepEqual(got, want) || !reflect.DeepEqual(words, rawWords) || !reflect.DeepEqual(intervals, rawIntervals) {
		t.Fatalf("normalization changed source evidence or the wrong word: %+v", got)
	}
	asset := story.Asset{ID: "source", Hash: strings.Repeat("a", 64), Duration: 14.34, Candidates: []story.Candidate{{ID: "phrase", SourceID: "source", In: 8.14, Out: 13.55, Words: rawWords}}}
	strict, err := boundStorySpeechToVoice(asset, intervals, true)
	if err != nil || len(strict.Candidates[0].Words) != 0 {
		t.Fatal("generic automatic-caption guard was relaxed", err)
	}
	asset.Candidates = nil
	asset.TranscriptProposals = []story.TranscriptProposal{{CandidateID: "phrase", In: 8.14, Out: 13.55, Words: rawWords, Confidence: .53, Reason: "Needs review."}}
	oldID := story.TranscriptProposalID(asset, asset.TranscriptProposals[0])
	prepared := prepareStoryTranscriptProposals(asset, intervals, true, configuredStoryVoicePadding(storyVADArguments))
	proposal := prepared.TranscriptProposals[0]
	if !proposal.TimingVerified || proposal.Reviewed || proposal.ID == oldID || proposal.ID != story.TranscriptProposalID(prepared, proposal) || !reflect.DeepEqual(proposal.Words, want) || !strings.Contains(proposal.Reason, storyProposalPaddingReason) {
		t.Fatalf("normalized proposal lacks fresh unreviewed evidence: %+v", proposal)
	}
	if _, err := story.ApproveTranscript(prepared, oldID, []string{"dreapta,", "iar"}); err == nil {
		t.Fatal("old evidence ID was allowed to approve changed timing")
	}
}

func TestStoryVoicePaddingRejectsAmbiguousOrUnprovenRecovery(t *testing.T) {
	for _, tc := range []struct {
		name   string
		change func(*[]story.Word, *[]Segment, **storyVoicePadding)
	}{
		{"unknown-padding", func(_ *[]story.Word, _ *[]Segment, p **storyVoicePadding) { *p = nil }},
		{"wrong-padding", func(_ *[]story.Word, _ *[]Segment, p **storyVoicePadding) { (*p).SpeechPadMS = 200 }},
		{"unknown-clock", func(_ *[]story.Word, _ *[]Segment, p **storyVoicePadding) { (*p).ClockTickMS = 20 }},
		{"unknown-method", func(_ *[]story.Word, _ *[]Segment, p **storyVoicePadding) { (*p).Method = "other-vad" }},
		{"two-speech-cores", func(w *[]story.Word, _ *[]Segment, _ **storyVoicePadding) { (*w)[0].End, (*w)[1].Start = 10.64, 10.64 }},
		{"missing-neighbor", func(w *[]story.Word, _ *[]Segment, _ **storyVoicePadding) { *w = (*w)[:1] }},
		{"no-punctuation", func(w *[]story.Word, _ *[]Segment, _ **storyVoicePadding) { (*w)[0].Text = "dreapta" }},
		{"lexical-hyphen", func(w *[]story.Word, _ *[]Segment, _ **storyVoicePadding) { (*w)[0].Text = "dreapta-" }},
		{"start-only-in-padding", func(w *[]story.Word, _ *[]Segment, _ **storyVoicePadding) { (*w)[0].Start = 1.5 }},
		{"neighbor-clock-gap", func(w *[]story.Word, _ *[]Segment, _ **storyVoicePadding) { (*w)[1].Start = 10.66 }},
		{"neighbor-also-spans-regions", func(w *[]story.Word, _ *[]Segment, _ **storyVoicePadding) { (*w)[1].Start = 9.8 }},
		{"degenerate-core", func(_ *[]story.Word, v *[]Segment, _ **storyVoicePadding) { (*v)[1].End = 10.7 }},
		{"three-regions", func(w *[]story.Word, v *[]Segment, _ **storyVoicePadding) {
			*v = []Segment{{1.48, 5}, {5.5, 10.01}, {10.47, 13.37}}
			(*w)[0].Start = 2
		}},
		{"unordered-evidence", func(_ *[]story.Word, v *[]Segment, _ **storyVoicePadding) {
			*v = []Segment{{10.47, 13.37}, {1.48, 10.01}}
		}},
		{"invalid-word-clock", func(w *[]story.Word, _ *[]Segment, _ **storyVoicePadding) { (*w)[0].End = math.NaN() }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			words := []story.Word{{Text: "dreapta,", Start: 9.04, End: 10.62}, {Text: "iar", Start: 10.62, End: 11.04}}
			intervals := []Segment{{1.48, 10.01}, {10.47, 13.37}}
			padding := configuredStoryVoicePadding(storyVADArguments)
			tc.change(&words, &intervals, &padding)
			if _, changed := normalizeStoryProposalPadding(words, intervals, 14.34, padding); changed {
				t.Fatal("ambiguous or unproven word timing was normalized")
			}
		})
	}
}

func TestStoryVoicePaddingMetadataRequiresKnownDetectorConfiguration(t *testing.T) {
	for _, args := range [][]string{nil, {"--vad-speech-pad-ms"}, {"--vad-speech-pad-ms", "0"}, {"--vad-speech-pad-ms", "150", "--vad-speech-pad-ms", "150"}} {
		if configuredStoryVoicePadding(args).valid() {
			t.Fatalf("unproven detector configuration acquired padding metadata: %v", args)
		}
	}
	padding := configuredStoryVoicePadding(storyVADArguments)
	data, err := json.Marshal(padding)
	var decoded storyVoicePadding
	if err != nil || json.Unmarshal(data, &decoded) != nil || !decoded.valid() {
		t.Fatal("valid typed detector metadata did not survive serialization")
	}
}

func TestStoryVoicePaddingRefreshesLegacyCacheWithoutASROrLostReview(t *testing.T) {
	p, storage, dir := storyTestProcessor(t)
	asset := storySource(t, p, dir, "padding-cache", "blue", 440)
	log := recordPreparedAudioProcessing(t, p, dir)
	t.Setenv("SNEEPCUT_NARRATION_ASR_LOW", "1")
	first, err := p.Analyze(context.Background(), "padding-cache", asset, story.DefaultOptions())
	if err != nil || len(first.TranscriptProposals) != 1 {
		t.Fatalf("no initial transcript proposal: %v", err)
	}
	approved, err := story.ApproveTranscript(first, first.TranscriptProposals[0].ID, []string{"Reviewed", "voice."})
	if err != nil {
		t.Fatal(err)
	}
	proxy, err := storage.Path(first.ProxyKey)
	if err != nil {
		t.Fatal(err)
	}
	files, err := filepath.Glob(filepath.Join(filepath.Dir(proxy), "voice-intervals-*.json"))
	if err != nil || len(files) != 1 {
		t.Fatalf("missing voice evidence: %v %v", files, err)
	}
	data, err := os.ReadFile(files[0])
	var cached storyVoiceEvidence
	if err != nil || json.Unmarshal(data, &cached) != nil || !cached.Padding.valid() {
		t.Fatal("new voice sidecar omitted detector provenance", err)
	}
	// Simulate the old clock's immutable sidecar without a padding contract.
	// The new clock must measure VAD again while retaining the raw ASR cache.
	cached.Padding = nil
	model := p.cfg.StoryWhisperModel
	if model == "" {
		model = p.cfg.WhisperModel
	}
	cached.Version = storyDigest([]any{"voice-clock-2", storyVADArguments, storyModelSignature(p.storyVADModel(model)), storyModelSignature(p.storyVADExecutable())})
	data, err = json.Marshal(cached)
	legacyFile := filepath.Join(filepath.Dir(files[0]), "voice-intervals-"+cached.Version+".json")
	if err != nil || os.WriteFile(legacyFile, data, 0600) != nil || os.WriteFile(log, nil, 0600) != nil {
		t.Fatal("cannot prepare legacy sidecar fixture", err)
	}
	if err := storage.Delete(context.Background(), path.Dir(first.ProxyKey)+"/"+filepath.Base(files[0])); err != nil {
		t.Fatal(err)
	}
	p.cfg.WhisperPath = filepath.Join(dir, "must-not-rerun-asr")
	refreshed, err := p.Analyze(context.Background(), "padding-cache", approved, story.DefaultOptions())
	if err != nil || !refreshed.TranscriptProposals[0].Reviewed || refreshed.TranscriptProposals[0].ID != approved.TranscriptProposals[0].ID || !reflect.DeepEqual(refreshed.Candidates, approved.Candidates) {
		t.Fatalf("voice-only refresh invalidated unchanged reviewed words: %+v %v", refreshed.TranscriptProposals, err)
	}
	assertPreparedAudioExtractions(t, log, []string{"voice-evidence.wav"})
	data, err = os.ReadFile(files[0])
	if err != nil || json.Unmarshal(data, &cached) != nil || !cached.Padding.valid() {
		t.Fatal("new voice clock did not save measured padding evidence", err)
	}
	legacy, err := os.ReadFile(legacyFile)
	var old storyVoiceEvidence
	if err != nil || json.Unmarshal(legacy, &old) != nil || old.Padding != nil {
		t.Fatal("voice-only refresh changed the immutable legacy sidecar", err)
	}
	p.cfg.FFmpegPath = filepath.Join(dir, "must-not-decode-warm-cache")
	warm, err := p.Analyze(context.Background(), "padding-cache", refreshed, story.DefaultOptions())
	if err != nil || !reflect.DeepEqual(warm.Candidates, refreshed.Candidates) {
		t.Fatal("validated voice sidecar was not reused", err)
	}
}
