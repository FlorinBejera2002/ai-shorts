package processing

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/story"
)

// The native pipeline invokes this test executable as a deterministic speech
// recognizer. Actual audio decode/render remains FFmpeg; no model download or
// paid service is required to verify caption provenance and cache behavior.
func TestMain(m *testing.M) {
	if os.Getenv("SNEEPCUT_NARRATION_ASR_FIXTURE") == "1" && len(os.Args) > 1 && os.Args[1] == "-m" {
		if _, err := os.Stat("audio.wav"); err != nil {
			os.Exit(2)
		}
		raw := `{"result":{"language":"en"},"transcription":[{"text":"Original","offsets":{"from":400,"to":1000},"tokens":[{"text":"Original","p":0.97,"offsets":{"from":400,"to":1000}}]},{"text":"voice.","offsets":{"from":1100,"to":1400},"tokens":[{"text":"voice.","p":0.98,"offsets":{"from":1100,"to":1400}}]}]}`
		if os.Getenv("SNEEPCUT_NARRATION_ASR_EMPTY") == "1" {
			raw = `{"result":{"language":"en"},"transcription":[]}`
		}
		if os.WriteFile("transcript.json", []byte(raw), 0600) != nil {
			os.Exit(3)
		}
		os.Exit(0)
	}
	os.Exit(m.Run())
}

func narrationAudioFixture(t *testing.T, p *Processor, dir, name string, silence bool, codecArgs ...string) story.Asset {
	t.Helper()
	signal := "sine=frequency=997.3:sample_rate=48000"
	if silence {
		signal = "anullsrc=sample_rate=48000:channel_layout=mono"
	}
	file := filepath.Join(dir, name)
	args := []string{"-f", "lavfi", "-i", signal, "-t", "2", "-ac", "1"}
	args = append(args, codecArgs...)
	args = append(args, file)
	if err := p.ffmpeg(context.Background(), dir, args...); err != nil {
		t.Fatal(err)
	}
	key := "sources/narration-test/" + name
	if err := p.storage.Save(context.Background(), file, key, "application/octet-stream"); err != nil {
		t.Fatal(err)
	}
	asset, err := p.InspectNarration(context.Background(), key)
	if err != nil {
		t.Fatal(err)
	}
	asset.ID = "narrator"
	asset.Include = "required"
	return asset
}

func TestNarrationInspectionAcceptsActualAudioIncludingRecorderWebM(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	for _, tc := range []struct {
		name string
		args []string
	}{
		{"voice.wav", []string{"-c:a", "pcm_s16le"}},
		{"voice.mp3", []string{"-c:a", "libmp3lame"}},
		{"voice.m4a", []string{"-c:a", "aac"}},
		{"voice.ogg", []string{"-c:a", "libopus"}},
		{"voice.webm", []string{"-c:a", "libopus", "-f", "webm", "-live", "1"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			asset := narrationAudioFixture(t, p, dir, tc.name, false, tc.args...)
			if asset.Kind != "narration" || !asset.HasAudio || asset.Width != 0 || len(asset.Hash) != 64 || math.Abs(asset.Duration-2) > .06 || asset.Mapping.Rate != 1 {
				t.Fatalf("invalid audio inspection: %#v", asset)
			}
			if strings.HasSuffix(tc.name, ".webm") {
				raw, err := run(context.Background(), dir, p.cfg.FFprobePath, "-v", "error", "-show_entries", "format=duration", "-of", "json", filepath.Join(dir, tc.name))
				if err != nil || strings.Contains(string(raw), `"duration"`) {
					t.Fatalf("fixture did not exercise missing MediaRecorder duration: %s %v", raw, err)
				}
			}
		})
	}
	video := storySource(t, p, dir, "video-disguised-as-audio", "blue", 440)
	if _, err := p.InspectNarration(context.Background(), video.Key); err == nil || !strings.Contains(err.Error(), "no video") {
		t.Fatal("video accepted as narration", err)
	}
	broken := filepath.Join(dir, "broken.webm")
	if err := os.WriteFile(broken, []byte("not valid audio"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := p.storage.Save(context.Background(), broken, "sources/narration-test/broken.webm", "audio/webm"); err != nil {
		t.Fatal(err)
	}
	if _, err := p.InspectNarration(context.Background(), "sources/narration-test/broken.webm"); err == nil {
		t.Fatal("damaged narration accepted")
	}
}

func TestNarrationInspectionRejectsOversizedDecodedRecorderAudio(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	file := filepath.Join(dir, "long.webm")
	if err := p.ffmpeg(context.Background(), dir, "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", "181", "-c:a", "libopus", "-f", "webm", "-live", "1", file); err != nil {
		t.Fatal(err)
	}
	if err := p.storage.Save(context.Background(), file, "sources/narration-test/long.webm", "audio/webm"); err != nil {
		t.Fatal(err)
	}
	if _, err := p.InspectNarration(context.Background(), "sources/narration-test/long.webm"); err == nil || !strings.Contains(err.Error(), "duration") {
		t.Fatal("missing duration bypassed decoded sample limit", err)
	}
}

func TestNarrationAnalysisCachesAlignedVoiceAndMutesVideoAnalysis(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	voice := narrationAudioFixture(t, p, dir, "voice.wav", false, "-c:a", "pcm_s16le")
	t.Setenv("SNEEPCUT_NARRATION_ASR_FIXTURE", "1")
	p.cfg.WhisperPath, _ = os.Executable()
	options := story.DefaultOptions()
	options.Narration = true
	analyzed, err := p.Analyze(context.Background(), "narration-analysis", voice, options)
	if err != nil || len(analyzed.Candidates) != 1 || analyzed.Candidates[0].Text != "Original voice." || analyzed.Candidates[0].Words[0].Start != .4 || analyzed.Candidates[0].Confidence != .97 || !strings.HasSuffix(analyzed.ProxyKey, ".wav") {
		t.Fatalf("voice source/timing changed: %#v %v", analyzed, err)
	}
	p.cfg.WhisperPath = filepath.Join(dir, "must-not-transcribe-again")
	again, err := p.Analyze(context.Background(), "narration-analysis", analyzed, options)
	if err != nil || again.AnalysisVersion != analyzed.AnalysisVersion || again.Key != voice.Key {
		t.Fatalf("narration cache failed: %#v %v", again, err)
	}
	video := storySource(t, p, dir, "visual-with-sound", "blue", 440)
	visual, err := p.Analyze(context.Background(), "narration-analysis", video, options)
	if err != nil || len(visual.Candidates) == 0 || visual.Candidates[0].Text != "" || len(visual.Candidates[0].Words) != 0 || visual.Candidates[0].Role != "b_roll" {
		t.Fatalf("video speech entered narration planning: %#v %v", visual, err)
	}
	file, err := p.storyMaterialize(context.Background(), dir, visual.ProxyKey)
	if err != nil {
		t.Fatal(err)
	}
	info, err := p.probe(context.Background(), file)
	if err != nil || info.Audio {
		t.Fatal("visual proxy retained original video sound", err)
	}
	p.cfg.WhisperPath, _ = os.Executable()
	sourceOptions := options
	sourceOptions.Narration = false
	spokenVideo, err := p.Analyze(context.Background(), "narration-analysis", visual, sourceOptions)
	if err != nil || spokenVideo.AnalysisVersion == visual.AnalysisVersion || len(spokenVideo.Candidates) == 0 || spokenVideo.Candidates[0].Text == "" {
		t.Fatalf("mode conversion reused a muted visual cache: %#v %v", spokenVideo, err)
	}
	p.cfg.WhisperPath = filepath.Join(dir, "must-not-transcribe-visuals")
	backToVisual, err := p.Analyze(context.Background(), "narration-analysis", spokenVideo, options)
	if err != nil || backToVisual.AnalysisVersion != visual.AnalysisVersion || backToVisual.Candidates[0].Text != "" || !backToVisual.HasAudio {
		t.Fatalf("mode conversion reused speech or lost original audio provenance: %#v %v", backToVisual, err)
	}
	silent := narrationAudioFixture(t, p, dir, "silent.wav", true, "-c:a", "pcm_s16le")
	silent.ID = "silent"
	if _, err := p.Analyze(context.Background(), "narration-analysis", silent, options); err == nil || !strings.Contains(err.Error(), "silent") {
		t.Fatal("silent narration accepted or sent to ASR", err)
	}
	p.cfg.WhisperPath, _ = os.Executable()
	t.Setenv("SNEEPCUT_NARRATION_ASR_EMPTY", "1")
	if _, err := p.Analyze(context.Background(), "no-spoken-voice", voice, options); err == nil || !strings.Contains(err.Error(), "spoken narration") {
		t.Fatal("no-speech ASR output accepted", err)
	}
}

func TestNarrationRecorderWebMVoiceRemainsOnOriginalSampleClock(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	ctx := context.Background()
	voice := narrationAudioFixture(t, p, dir, "recorder.webm", false, "-c:a", "libopus", "-f", "webm", "-live", "1")
	visual := storySource(t, p, dir, "camera-with-audio", "blue", 440)
	request := story.Request{ID: "recorder-clock", Assets: []story.Asset{visual, voice}, Options: story.Options{Narration: true, AspectRatio: "16:9"}}
	version := story.Version{Number: 1}
	previous := 0.0
	for i, at := range []float64{.5, 1, voice.Duration} {
		videoIn := 0.0
		if i == 2 {
			videoIn = .5
		}
		version.Timeline = append(version.Timeline, story.Entry{BlockID: string(rune('a' + i)), OutputIn: previous, OutputOut: at, Video: story.Interval{SourceID: visual.ID, In: videoIn, Out: videoIn + at - previous}, Audio: &story.Interval{SourceID: voice.ID, In: previous, Out: at}, Crop: "fit"})
		previous = at
	}
	output, err := p.RenderStory(ctx, request, version)
	if err != nil || math.Abs(output.Duration-voice.Duration) > .035 {
		t.Fatalf("recorder duration changed: %#v %v", output, err)
	}
	file, err := p.storyMaterialize(ctx, dir, output.Key)
	if err != nil {
		t.Fatal(err)
	}
	compareDir := filepath.Join(dir, "normalized-reference")
	if err := os.Mkdir(compareDir, 0700); err != nil {
		t.Fatal(err)
	}
	normalized, _, _, err := p.normalizeNarration(ctx, compareDir, filepath.Join(dir, "recorder.webm"))
	if err != nil {
		t.Fatal(err)
	}
	decode := func(path string) []byte {
		data, err := run(ctx, dir, p.cfg.FFmpegPath, "-v", "error", "-i", path, "-t", seconds(voice.Duration), "-vn", "-ac", "1", "-ar", "48000", "-f", "s16le", "-")
		if err != nil {
			t.Fatal(err)
		}
		return data
	}
	original, rendered := decode(normalized), decode(file)
	if len(original) != len(rendered) {
		t.Fatal("recorder sample duration was lost", len(original), len(rendered))
	}
	var errorEnergy, signalEnergy float64
	for i := 4800; i+4800 < len(original); i += 2 {
		a := float64(int16(binary.LittleEndian.Uint16(original[i:])))
		b := float64(int16(binary.LittleEndian.Uint16(rendered[i:])))
		errorEnergy += (a - b) * (a - b)
		signalEnergy += a * a
	}
	if errorEnergy/signalEnergy > .03 {
		t.Fatalf("recorder voice shifted or camera audio leaked: relative sample error %.4f", errorEnergy/signalEnergy)
	}
}

func TestNarrationRendersOneContinuousVoiceAcrossVisualCuts(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	ctx := context.Background()
	voice := narrationAudioFixture(t, p, dir, "voice.wav", false, "-c:a", "pcm_s16le")
	words := []story.Word{{Text: "Original", Start: .4, End: 1}, {Text: "voice.", Start: 1.1, End: 1.4}}
	voice.Candidates = []story.Candidate{{ID: "spoken", SourceID: voice.ID, In: 0, Out: voice.Duration, Text: "Original voice.", Words: words}}
	red := storySource(t, p, dir, "red", "red", 440)
	blue := storySource(t, p, dir, "blue", "blue", 880)
	request := story.Request{ID: "continuous-narration", Assets: []story.Asset{red, blue, voice}, Options: story.Options{Narration: true, Captions: true, AspectRatio: "1:1"}}
	logo := filepath.Join(dir, "narration-logo.png")
	if err := p.ffmpeg(ctx, dir, "-f", "lavfi", "-i", "color=c=green:s=100x100", "-frames:v", "1", logo); err != nil {
		t.Fatal(err)
	}
	request.UserID, request.LogoKey = "owner", "brand/owner/narration-logo.png"
	if err := p.storage.Save(ctx, logo, request.LogoKey, "image/png"); err != nil {
		t.Fatal(err)
	}
	version := story.Version{Number: 1, Timeline: []story.Entry{
		{BlockID: "one", OutputIn: 0, OutputOut: .7, Video: story.Interval{SourceID: red.ID, In: 0, Out: .7}, Audio: &story.Interval{SourceID: voice.ID, In: 0, Out: .7}, Words: words[:1], Crop: "fit"},
		{BlockID: "two", OutputIn: .7, OutputOut: 1.3, Video: story.Interval{SourceID: blue.ID, In: 0, Out: .6}, Audio: &story.Interval{SourceID: voice.ID, In: .7, Out: 1.3}, Words: words[1:], Crop: "fit"},
		{BlockID: "three", OutputIn: 1.3, OutputOut: 2, Video: story.Interval{SourceID: red.ID, In: .7, Out: 1.4}, Audio: &story.Interval{SourceID: voice.ID, In: 1.3, Out: 2}, Crop: "fit"},
	}}
	output, err := p.RenderStory(ctx, request, version)
	if err != nil || math.Abs(output.Duration-voice.Duration) > .035 {
		t.Fatalf("continuous narration render failed: %#v %v", output, err)
	}
	version.Output = output
	file, err := p.storyMaterialize(ctx, dir, output.Key)
	if err != nil {
		t.Fatal(err)
	}
	decode := func(path string) []byte {
		raw, err := run(ctx, dir, p.cfg.FFmpegPath, "-v", "error", "-i", path, "-t", "2", "-vn", "-ac", "1", "-ar", "48000", "-f", "s16le", "-")
		if err != nil {
			t.Fatal(err)
		}
		return raw
	}
	original := decode(filepath.Join(dir, "voice.wav"))
	rendered := decode(file)
	if len(original) != len(rendered) {
		t.Fatal("narration duration changed in decoded samples", len(original), len(rendered))
	}
	for _, interval := range [][2]float64{{.05, 1.95}, {.65, .75}, {1.25, 1.35}} {
		var errorEnergy, signalEnergy float64
		for i := int(interval[0]*48000) * 2; i < int(interval[1]*48000)*2; i += 2 {
			a := float64(int16(binary.LittleEndian.Uint16(original[i:])))
			b := float64(int16(binary.LittleEndian.Uint16(rendered[i:])))
			errorEnergy += (a - b) * (a - b)
			signalEnergy += a * a
		}
		if errorEnergy/signalEnergy > .02 {
			t.Fatalf("voice shifted/spliced or source audio leaked at %v: relative error %.4f", interval, errorEnergy/signalEnergy)
		}
	}
	verdict := storyMediaVerdict{Coverage: story.Coverage{Audio: true, Visual: true, Captions: true, Semantics: true, Boundaries: true}, Ranges: []storyReviewRange{{0, 2}}, Boundaries: []float64{.7, 1.3}}
	for _, entry := range version.Timeline {
		verdict.NarrationMatches = append(verdict.NarrationMatches, storyNarrationMatch{BlockID: entry.BlockID, Match: true, Confidence: .95, Evidence: "The observed colored visual illustrates the explicitly verified audible topic."})
	}
	raw, _ := json.Marshal(verdict)
	reviewer := &storyReviewMock{result: string(raw)}
	p.ai = reviewer
	report, err := p.ReviewStory(ctx, request, version)
	if err != nil || report.Status != "ready" || !report.Coverage.Semantics {
		t.Fatalf("actual narration review failed: %#v %v", report, err)
	}
	voiceReferences := 0
	for _, part := range reviewer.parts {
		if strings.Contains(part.Label, "ORIGINAL FULL NARRATION") {
			voiceReferences++
		}
		if strings.Contains(part.Label, "ORIGINAL SOURCE AUDIO reference for block") {
			t.Fatal("narration review split the continuous voice into per-cut references")
		}
	}
	if voiceReferences != 1 {
		t.Fatal("full original voice was not reviewed exactly once")
	}
	verdict.NarrationMatches = verdict.NarrationMatches[:2]
	raw, _ = json.Marshal(verdict)
	parsed, err := parseStoryMediaVerdict(string(raw), request, version)
	if err != nil || parsed.Coverage.Semantics || len(parsed.Issues) == 0 || parsed.Issues[0].Type != "visual_match" {
		t.Fatal("missing visual match was approved", err)
	}
	version.Timeline[1].Audio.SourceID = blue.ID
	if _, err := validateStoryRender(request, version); err == nil {
		t.Fatal("source-video sound substituted for narration")
	}
}

func TestNarrationSourceSemanticsUsesOnlyVideoFrames(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	ctx := context.Background()
	options := story.DefaultOptions()
	options.Narration = true
	video := storySource(t, p, dir, "visual-only", "blue", 440)
	visual, err := p.Analyze(ctx, "narration-semantics", video, options)
	if err != nil {
		t.Fatal(err)
	}
	voice := story.Asset{ID: "voice", Kind: "narration", Duration: 2, HasAudio: true, ProxyKey: "must-not-be-decoded-as-video.wav", Candidates: []story.Candidate{{ID: "spoken", SourceID: "voice", In: 0, Out: 2, Text: "A blue scene.", Role: "a_roll", Confidence: .92}}}
	finding := storySemanticFinding{CandidateID: visual.Candidates[0].ID, Role: "b_roll", Idea: "A plain blue field.", Evidence: "Actual source frames show a plain blue field across the sampled interval.", Confidence: .95}
	raw, _ := json.Marshal(map[string]any{"candidates": []storySemanticFinding{finding}})
	reviewer := &storySemanticMock{storyReviewMock: storyReviewMock{result: string(raw)}, model: "narration-visuals"}
	p.ai = reviewer
	result, err := p.AnalyzeStorySources(ctx, []story.Asset{visual, voice}, options)
	if err != nil || reviewer.calls != 1 || len(reviewer.parts) != 3 || result[0].Candidates[0].Idea != finding.Idea || result[1].Candidates[0].Text != voice.Candidates[0].Text || result[1].Candidates[0].Confidence != .92 {
		t.Fatalf("narration treated as visual or modified during enrichment: %#v %v", result, err)
	}
	for _, part := range reviewer.parts {
		if part.MIME != "image/jpeg" || strings.Contains(part.Label, "source voice ") {
			t.Fatal("audio narration was sent as video-frame evidence")
		}
	}
	if !strings.Contains(reviewer.prompt, "NARRATION MODE") || !strings.Contains(reviewer.prompt, `"source_kind":"narration"`) {
		t.Fatal("source meaning prompt omitted narration provenance")
	}
	var payload struct {
		Candidates []storySemanticCandidate `json:"candidates"`
		Narration  []storySemanticCandidate `json:"narration_context"`
		Allowed    []string                 `json:"allowed_candidate_ids"`
	}
	_, data, found := strings.Cut(reviewer.prompt, "\nDATA:\n")
	if !found || json.Unmarshal([]byte(data), &payload) != nil || len(payload.Candidates) != 1 || len(payload.Narration) != 1 || len(payload.Allowed) != 1 || payload.Allowed[0] == "spoken" {
		t.Fatal("narration context was mixed with visual annotation targets")
	}
}
