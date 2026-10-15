package processing

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/story"
)

func init() {
	fixture := os.Getenv("SNEEPCUT_DTW_ALIGNMENT_FIXTURE")
	if fixture == "" || !slices.Contains(os.Args, "--dtw") {
		return
	}
	if os.Getenv("SNEEPCUT_DTW_ALIGNMENT_MUST_NOT_RUN") == "1" || slices.Contains(os.Args, "--vad") || !slices.Contains(os.Args, "--no-flash-attn") {
		os.Exit(9)
	}
	output := ""
	for i, arg := range os.Args {
		if arg == "-of" && i+1 < len(os.Args) {
			output = os.Args[i+1]
		}
	}
	raw, err := os.ReadFile(fixture)
	if err != nil || output == "" || os.WriteFile(output+".json", raw, 0600) != nil {
		os.Exit(10)
	}
	os.Exit(0)
}

func romanianDTWFixture(t *testing.T) ([]byte, []Segment) {
	t.Helper()
	raw, err := os.ReadFile("testdata/romanian-dtw-alignment.json")
	if err != nil {
		t.Fatal(err)
	}
	return raw, []Segment{{1, 6.07}, {6.76, 8.28}, {8.87, 9.88}, {10.35, 11.22}, {11.47, 13.14}, {13.26, 16.18}, {17.71, 19.45}}
}

func alignmentAsset() story.Asset {
	asset := story.Asset{ID: "source", Hash: strings.Repeat("a", 64), Duration: 23.613333, HasAudio: true, ProxyKey: "sources/source/proxy.mp4", AnalysisVersion: "raw-analysis"}
	asset.Candidates = []story.Candidate{{ID: "phrase", SourceID: asset.ID, In: .93, Out: 19.63, Role: "b_roll"}}
	asset.TranscriptProposals = []story.TranscriptProposal{{CandidateID: "phrase", In: .93, Out: 19.63, Words: []story.Word{{Text: "pe", Start: 16.01, End: 17.73}}}}
	asset.TranscriptProposals[0].ID = story.TranscriptProposalID(asset, asset.TranscriptProposals[0])
	return asset
}

func TestStoryTranscriptAlignmentRealRomanianPreservesFreshTextAndRequiresReview(t *testing.T) {
	raw, intervals := romanianDTWFixture(t)
	words, confidence, err := alignedStoryTranscript(raw, intervals, 23.613333)
	if err != nil || len(words) != 32 || confidence >= .55 {
		t.Fatalf("real DTW evidence failed: %d words %v", len(words), err)
	}
	if words[28] != (story.Word{Text: "pe", Start: 17.92, End: 18.04}) || words[31] != (story.Word{Text: "spate.", Start: 18.66, End: 18.96}) {
		t.Fatalf("wrong lexical transition boundaries: %+v", words)
	}
	asset := alignmentAsset()
	oldID := asset.TranscriptProposals[0].ID
	asset.TranscriptReviews = []story.TranscriptReview{{ProposalID: oldID, SourceHash: asset.Hash, Words: asset.TranscriptProposals[0].Words}}
	got := applyStoryTranscriptAlignment(asset, words, confidence, intervals)
	got = story.ApplyTranscriptReviews(got)
	proposal := got.TranscriptProposals[0]
	if !proposal.TimingVerified || proposal.Reviewed || proposal.ID == oldID || len(proposal.Words) != 32 || len(got.Candidates[0].Words) != 0 {
		t.Fatalf("new transcription inherited stale approval: %+v", proposal)
	}
	var text []string
	for _, word := range proposal.Words {
		text = append(text, word.Text)
	}
	if !strings.Contains(strings.Join(text, " "), "ușă, și pe ușa") {
		t.Fatal("fresh lexical change was dropped to imitate old text")
	}
	approved, err := story.ApproveTranscript(got, proposal.ID, text)
	if err != nil || len(approved.Candidates[0].Words) != 32 {
		t.Fatal("fresh measured text cannot be explicitly reviewed", err)
	}
	unchanged := applyStoryTranscriptAlignment(approved, nil, 0, intervals)
	if !reflect.DeepEqual(approved, unchanged) {
		t.Fatal("alignment overwrote a reviewed proposal")
	}
}

func TestStoryTranscriptAlignmentRejectsIncompleteOrAmbiguousEvidence(t *testing.T) {
	for _, tc := range []struct {
		name   string
		change func(*storyDTWDocument)
	}{
		{"missing-anchor", func(d *storyDTWDocument) { d.Transcription[1].Tokens[0].Time = nil }},
		{"silence-anchor", func(d *storyDTWDocument) { value := 20.0; d.Transcription[1].Tokens[0].Time = &value }},
		{"reversed-anchor", func(d *storyDTWDocument) { value := 110.0; d.Transcription[2].Tokens[0].Time = &value }},
		{"missing-confidence", func(d *storyDTWDocument) { d.Transcription[1].Tokens[0].Probability = nil }},
		{"lost-fragment", func(d *storyDTWDocument) { d.Transcription[2].Tokens = d.Transcription[2].Tokens[:1] }},
		{"coarse-text", func(d *storyDTWDocument) { d.Transcription[1].Text = "Și avem" }},
		{"missing-terminal-boundary", func(d *storyDTWDocument) {
			s := &d.Transcription[len(d.Transcription)-1]
			s.Text = " spate"
			s.Tokens = s.Tokens[:2]
		}},
		{"zero-word-duration", func(d *storyDTWDocument) { value := 136.0; d.Transcription[1].Tokens[0].Time = &value }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			raw, intervals := romanianDTWFixture(t)
			var doc storyDTWDocument
			if json.Unmarshal(raw, &doc) != nil {
				t.Fatal("invalid fixture")
			}
			tc.change(&doc)
			raw, _ = json.Marshal(doc)
			if _, _, err := alignedStoryTranscript(raw, intervals, 23.613333); err == nil {
				t.Fatal("unsafe alignment accepted")
			}
		})
	}
	raw := []byte(`{"transcription":[{"text":"compound.","tokens":[{"text":"com","t_dtw":150,"p":0.9},{"text":"pound","t_dtw":400,"p":0.9},{"text":".","t_dtw":450,"p":0.9}]}]}`)
	if _, _, err := alignedStoryTranscript(raw, []Segment{{1, 2}, {3, 5}}, 6); err == nil {
		t.Fatal("one lexical word spanning separate voice regions was accepted")
	}
}

func alignmentModelFixture(t *testing.T, dir string) string {
	t.Helper()
	values := []uint32{0x67676d6c, 51866, 1500, 1280, 20, 32, 448, 1280, 20, 4, 128, 8}
	data := make([]byte, 48)
	for i, value := range values {
		binary.LittleEndian.PutUint32(data[i*4:], value)
	}
	file := filepath.Join(dir, "model.bin")
	if err := os.WriteFile(file, data, 0600); err != nil {
		t.Fatal(err)
	}
	return file
}

func TestStoryTranscriptAlignmentCacheReusesNativeEvidenceWithoutRetranscribing(t *testing.T) {
	raw, intervals := romanianDTWFixture(t)
	asset := alignmentAsset()
	p, dir := originalSpeechEvidenceFixture(t, asset, nil)
	model := alignmentModelFixture(t, dir)
	if !storyAlignmentModelSupported(model) {
		t.Fatal("known architecture rejected")
	}
	key, version := storyTranscriptAlignmentKey(asset, model, p.cfg.WhisperPath, "ro")
	data, _ := json.Marshal(storyTranscriptAlignmentEvidence{Version: version, SourceHash: asset.Hash, Duration: asset.Duration, Raw: raw})
	file := filepath.Join(dir, "cached-alignment.json")
	if err := os.WriteFile(file, data, 0600); err != nil {
		t.Fatal(err)
	}
	if err := p.storage.Save(context.Background(), file, key, "application/json"); err != nil {
		t.Fatal(err)
	}
	got, err := p.recoverStoryTranscriptTiming(context.Background(), dir, asset, story.Options{Language: "ro"}, intervals, storyPreparedAudio{}, model)
	if err != nil || !got.TranscriptProposals[0].TimingVerified || got.TranscriptProposals[0].Reviewed || got.AnalysisVersion == asset.AnalysisVersion {
		t.Fatalf("cached independent evidence was not reused: %+v %v", got.TranscriptProposals, err)
	}
	for _, language := range []string{"en", "auto"} {
		other, _ := storyTranscriptAlignmentKey(asset, model, p.cfg.WhisperPath, language)
		if other == key {
			t.Fatal("language did not invalidate alignment cache")
		}
	}
	changed := asset
	changed.Hash = strings.Repeat("b", 64)
	other, _ := storyTranscriptAlignmentKey(changed, model, p.cfg.WhisperPath, "ro")
	if other == key {
		t.Fatal("source identity did not invalidate alignment cache")
	}
	asset = alignmentAsset()
	asset.Duration = 61
	before, _ := json.Marshal(asset)
	skipped, err := p.recoverStoryTranscriptTiming(context.Background(), dir, asset, story.Options{Language: "ro"}, intervals, storyPreparedAudio{}, model)
	after, _ := json.Marshal(skipped)
	if err != nil || string(before) != string(after) {
		t.Fatal("resource bound unexpectedly started alignment")
	}
	if err := os.WriteFile(model, []byte("unknown architecture"), 0600); err != nil {
		t.Fatal(err)
	}
	if storyAlignmentModelSupported(model) {
		t.Fatal("unknown model assigned incompatible DTW heads")
	}
}

func TestStoryTranscriptAlignmentColdCachePersistsEvidenceAndOwnerReview(t *testing.T) {
	_, intervals := romanianDTWFixture(t)
	asset := alignmentAsset()
	p, dir := originalSpeechEvidenceFixture(t, asset, nil)
	model := alignmentModelFixture(t, dir)
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	p.cfg.WhisperPath = executable
	fixture, err := filepath.Abs("testdata/romanian-dtw-alignment.json")
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("SNEEPCUT_DTW_ALIGNMENT_FIXTURE", fixture)
	wav := filepath.Join(dir, "audio.wav")
	if err := os.WriteFile(wav, []byte("test-owned prepared samples"), 0600); err != nil {
		t.Fatal(err)
	}
	prepared := storyPreparedAudio{proxyKey: asset.ProxyKey, file: wav}
	first, err := p.recoverStoryTranscriptTiming(context.Background(), dir, asset, story.Options{Language: "ro"}, intervals, prepared, model)
	if err != nil || !first.TranscriptProposals[0].TimingVerified || len(first.TranscriptProposals[0].Words) != 32 {
		t.Fatalf("cold native evidence not adopted as unreviewed proposal: %+v %v", first.TranscriptProposals, err)
	}
	var text []string
	for _, word := range first.TranscriptProposals[0].Words {
		text = append(text, word.Text)
	}
	approved, err := story.ApproveTranscript(first, first.TranscriptProposals[0].ID, text)
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("SNEEPCUT_DTW_ALIGNMENT_MUST_NOT_RUN", "1")
	if err := os.Remove(wav); err != nil {
		t.Fatal(err)
	}
	raw := alignmentAsset()
	raw.TranscriptReviews = approved.TranscriptReviews
	// Analyze gives each retry a new workspace; persisted evidence is shared.
	retryDir := t.TempDir()
	again, err := p.recoverStoryTranscriptTiming(context.Background(), retryDir, raw, story.Options{Language: "ro"}, intervals, storyPreparedAudio{}, model)
	again = story.ApplyTranscriptReviews(again)
	if err != nil || !again.TranscriptProposals[0].Reviewed || !reflect.DeepEqual(again.Candidates[0].Words, approved.Candidates[0].Words) {
		t.Fatalf("warm alignment re-ran native code or lost exact owner review: %+v %v", again.TranscriptProposals, err)
	}
	files, err := filepath.Glob(filepath.Join(dir, "transcript-alignment-*"))
	if err != nil || len(files) != 0 {
		t.Fatalf("temporary native workspace was retained: %v %v", files, err)
	}
}
