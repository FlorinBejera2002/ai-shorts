package processing

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/aiprovider"
	"sneepcut/backend-go/internal/media"
	"sneepcut/backend-go/internal/story"
)

func TestStoryProbeRejectsUnsupportedActualFormats(t *testing.T) {
	base := `{"format":{"format_name":"mov,mp4,m4a,3gp,3g2,mj2","duration":"2","start_time":"0.125"},"streams":[{"codec_type":"video","codec_name":"hevc","width":1920,"height":1080,"r_frame_rate":"60/1","avg_frame_rate":"2997/100","side_data_list":[{"side_data_type":"Display Matrix","rotation":-90}]},{"codec_type":"audio","codec_name":"aac"}]}`
	info, err := parseStoryProbe([]byte(base))
	if err != nil || info.Width != 1080 || info.Height != 1920 || !info.Audio || info.Start != .125 || len(info.Warnings) == 0 {
		t.Fatalf("rotation/VFR %#v %v", info, err)
	}
	for _, invalid := range []string{
		strings.Replace(base, `"hevc"`, `"vp9"`, 1),
		strings.Replace(base, `"width":1920`, `"color_transfer":"arib-std-b67","width":1920`, 1),
		strings.Replace(base, `"duration":"2"`, `"duration":"NaN"`, 1),
		strings.Replace(base, `"rotation":-90`, `"rotation":-45`, 1),
		strings.Replace(base, `"width":1920`, `"width":20000`, 1),
		strings.Replace(base, `"codec_name":"aac"`, `"codec_name":"unknown"`, 1),
	} {
		if _, err := parseStoryProbe([]byte(invalid)); err == nil {
			t.Fatal("accepted unsupported source", invalid)
		}
	}
}

func TestStoryCandidatesRetainWholeWordsAndNegation(t *testing.T) {
	asset := story.Asset{ID: "source-a", Duration: 10}
	transcript := Transcript{Language: "ro", Words: []Word{{"", 0, 1}, {"Nu", 1, 1.3}, {"costă", 1.3, 1.7}, {"20", 1.8, 2}, {"lei.", 2, 2.5}, {"Costă", 3, 3.5}, {"30", 3.5, 4}, {"lei.", 4, 4.5}}}
	candidates := storyCandidates(asset, transcript, .7, .6)
	if len(candidates) != 2 || candidates[0].Text != "Nu costă 20 lei." || candidates[1].Text != "Costă 30 lei." {
		t.Fatalf("words changed %#v", candidates)
	}
	for _, candidate := range candidates {
		if candidate.SourceID != asset.ID || candidate.In > candidate.Words[0].Start || candidate.Out < candidate.Words[len(candidate.Words)-1].End {
			t.Fatal("source interval lost words", candidate)
		}
	}
	storyTranscriptConfidence([]byte(`{"transcription":[{"tokens":[{"text":" Nu","p":0.31,"offsets":{"from":1000,"to":1300}},{"text":" costă","p":0.97,"offsets":{"from":1300,"to":1700}},{"text":"[_EOT_]","p":0.01,"offsets":{"from":1700,"to":1800}}]}]}`), candidates)
	if candidates[0].Confidence != .31 || candidates[1].Confidence != 0 {
		t.Fatalf("weak negation or missing ASR confidence hidden %#v", candidates)
	}
}

type storyReviewMock struct {
	calls  int
	prompt string
	parts  []aiprovider.MediaPart
	result string
	err    error
}

func (m *storyReviewMock) Generate(context.Context, string) (string, error) {
	return "", errors.New("text generation is not media review")
}
func (m *storyReviewMock) ReviewMedia(_ context.Context, prompt string, parts []aiprovider.MediaPart) (string, error) {
	m.calls++
	m.prompt = prompt
	m.parts = parts
	return m.result, m.err
}

type storyRecordingStorage struct {
	*media.LocalStorage
	segments int
}

func (s *storyRecordingStorage) Save(ctx context.Context, file, key, mime string) error {
	if strings.Contains(key, "/segments/") {
		s.segments++
	}
	return s.LocalStorage.Save(ctx, file, key, mime)
}

func storyTestProcessor(t *testing.T) (*Processor, *storyRecordingStorage, string) {
	t.Helper()
	for _, binary := range []string{"ffmpeg", "ffprobe"} {
		if _, err := exec.LookPath(binary); err != nil {
			t.Skip("requires FFmpeg/FFprobe")
		}
	}
	dir := t.TempDir()
	storage, err := media.NewLocalStorage(filepath.Join(dir, "media"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = storage.Close() })
	recording := &storyRecordingStorage{LocalStorage: storage}
	cfg, _ := ConfigFromEnv(func(string) string { return "" })
	cfg.TempDir = dir
	return New(cfg, recording, nil), recording, dir
}

func storySource(t *testing.T, p *Processor, dir, id, color string, frequency int) story.Asset {
	t.Helper()
	ctx := context.Background()
	file := filepath.Join(dir, id+".mp4")
	args := []string{"-f", "lavfi", "-i", "color=c=" + color + ":s=320x180:r=24"}
	if frequency > 0 {
		args = append(args, "-f", "lavfi", "-i", fmt.Sprintf("sine=frequency=%d:sample_rate=48000", frequency))
	}
	args = append(args, "-t", "1.6", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", file)
	if err := p.ffmpeg(ctx, dir, args...); err != nil {
		t.Fatal(err)
	}
	key := "sources/test/" + id + ".mp4"
	if err := p.storage.Save(ctx, file, key, "video/mp4"); err != nil {
		t.Fatal(err)
	}
	asset, err := p.Inspect(ctx, key)
	if err != nil {
		t.Fatal(err)
	}
	asset.ID = id
	asset.Name = id
	return asset
}

func TestStorySilentAnalysisIsCachedAndPreservesOriginal(t *testing.T) {
	p, storage, dir := storyTestProcessor(t)
	asset := storySource(t, p, dir, "silent", "green", 0)
	if len(asset.Hash) != 64 || asset.HasAudio {
		t.Fatal("invalid actual inspection", asset)
	}
	got, err := p.Analyze(context.Background(), "story-silent", asset, story.DefaultOptions())
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Candidates) != 1 || got.Candidates[0].Role != "b_roll" || got.Key != asset.Key || got.ProxyKey == asset.Key || got.Mapping.Rate != 1 {
		t.Fatal("silent source lost", got)
	}
	// Cached analysis works without a speech executable and retains user choices.
	got.Include = "required"
	got.Role = "supporting"
	again, err := p.Analyze(context.Background(), "story-silent", got, story.DefaultOptions())
	if err != nil || again.Include != "required" || again.Role != "supporting" || again.ProxyKey != got.ProxyKey {
		t.Fatalf("cache %#v %v", again, err)
	}
	if exists, err := storage.Exists(context.Background(), asset.Key); err != nil || !exists {
		t.Fatal("original removed")
	}
}

func TestStoryAnalysisCacheTracksSpeechModelAndLanguage(t *testing.T) {
	p, storage, dir := storyTestProcessor(t)
	asset := storySource(t, p, dir, "model-cache", "green", 0)
	options := story.DefaultOptions()
	p.cfg.WhisperModel = filepath.Join(dir, "legacy-base.bin")
	p.cfg.StoryWhisperModel = "" // Directly constructed configurations retain fallback.
	first, err := p.Analyze(context.Background(), "story-model-cache", asset, options)
	if err != nil {
		t.Fatal(err)
	}
	p.cfg.StoryWhisperModel = p.cfg.WhisperModel
	ffmpeg := p.cfg.FFmpegPath
	p.cfg.FFmpegPath = filepath.Join(dir, "no-transcoding-on-cache-hit")
	again, err := p.Analyze(context.Background(), "story-model-cache", first, options)
	if err != nil || again.AnalysisVersion != first.AnalysisVersion {
		t.Fatalf("same effective model did not reuse checkpoint: %v", err)
	}
	p.cfg.FFmpegPath = ffmpeg
	p.cfg.StoryWhisperModel = filepath.Join(dir, "story-turbo.bin")
	if err := os.WriteFile(p.cfg.StoryWhisperModel, []byte("model revision one"), 0600); err != nil {
		t.Fatal(err)
	}
	previous := first
	for _, change := range []string{"model", "model content", "language"} {
		if change == "model content" {
			if err := os.WriteFile(p.cfg.StoryWhisperModel, []byte("new model with different length"), 0600); err != nil {
				t.Fatal(err)
			}
		}
		if change == "language" {
			options.Language = "ro"
		}
		fresh, err := p.Analyze(context.Background(), "story-model-cache", previous, options)
		if err != nil || fresh.AnalysisVersion == previous.AnalysisVersion || fresh.ProxyKey == previous.ProxyKey || fresh.Key != asset.Key {
			t.Fatalf("%s reused stale analysis or changed source: %#v %v", change, fresh, err)
		}
		if exists, err := storage.Exists(context.Background(), previous.ProxyKey); err != nil || !exists {
			t.Fatalf("%s overwrote old immutable analysis", change)
		}
		previous = fresh
	}
}

func TestStoryRenderSeparateAudioVideoAndReviewActualMedia(t *testing.T) {
	p, storage, dir := storyTestProcessor(t)
	ctx := context.Background()
	one := storySource(t, p, dir, "one", "red", 440)
	two := storySource(t, p, dir, "two", "blue", 880)
	one.Candidates = []story.Candidate{{ID: "one-s1", SourceID: "one", In: .2, Out: 1, Words: []story.Word{{Text: "Actual", Start: .3, End: .6}}}}
	two.Candidates = []story.Candidate{{ID: "two-s1", SourceID: "two", In: .2, Out: 1}}
	request := story.Request{ID: "story-test", Options: story.Options{AspectRatio: "16:9", Captions: true}, Assets: []story.Asset{one, two}}
	version := story.Version{Number: 1, Timeline: []story.Entry{
		{BlockID: "first", CandidateID: "one-s1", OutputIn: 0, OutputOut: .8, Video: story.Interval{SourceID: "two", In: .2, Out: 1}, Audio: &story.Interval{SourceID: "one", In: .2, Out: 1}, Crop: "fit", Words: []story.Word{{Text: "Actual", Start: .1, End: .4}}},
		{BlockID: "second", CandidateID: "two-s1", OutputIn: .8, OutputOut: 1.6, Video: story.Interval{SourceID: "one", In: .2, Out: 1}, Audio: &story.Interval{SourceID: "two", In: .2, Out: 1}, Crop: "fit"},
	}}
	output, err := p.RenderStory(ctx, request, version)
	if err != nil {
		t.Fatal(err)
	}
	version.Output = output
	if math.Abs(output.Duration-1.6) > .06 || !output.Captions || storage.segments != 2 {
		t.Fatalf("output %#v cache %d", output, storage.segments)
	}
	file := filepath.Join(dir, "actual.mp4")
	if p.materialize(ctx, output.Key, file) != nil {
		t.Fatal("missing output")
	}
	// The first visible source is blue, but its soundtrack must be source one's
	// 440Hz tone. The second is red with source two's 880Hz tone.
	for _, sample := range []struct{ at, freq float64 }{{.2, 440}, {1.0, 880}} {
		pcm, err := run(ctx, dir, p.cfg.FFmpegPath, "-v", "error", "-ss", seconds(sample.at), "-i", file, "-t", "0.3", "-vn", "-ac", "1", "-ar", "8000", "-f", "s16le", "-")
		if err != nil {
			t.Fatal(err)
		}
		crossings := 0
		previous := int16(0)
		for i := 0; i+1 < len(pcm); i += 2 {
			value := int16(binary.LittleEndian.Uint16(pcm[i : i+2]))
			if value > 0 && previous <= 0 {
				crossings++
			}
			previous = value
		}
		frequency := float64(crossings) * 8000 / float64(len(pcm)/2)
		if math.Abs(frequency-sample.freq) > 15 {
			t.Fatalf("wrong audio provenance %.1f, want %.1f", frequency, sample.freq)
		}
		pixel, err := run(ctx, dir, p.cfg.FFmpegPath, "-v", "error", "-ss", seconds(sample.at), "-i", file, "-frames:v", "1", "-vf", "crop=320:180:(iw-320)/2:(ih-180)/2,scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-")
		if err != nil || len(pixel) != 3 {
			t.Fatalf("video provenance could not be read %v", err)
		}
		if sample.at < .8 && int(pixel[2]) < int(pixel[0])+80 || sample.at > .8 && int(pixel[0]) < int(pixel[2])+80 {
			t.Fatalf("wrong independent video provenance: %v", pixel)
		}
	}
	version.Number = 2
	if _, err = p.RenderStory(ctx, request, version); err != nil || storage.segments != 2 {
		t.Fatalf("unchanged media reencoded: saves=%d err=%v", storage.segments, err)
	}
	verdict := `{"coverage":{"audio":true,"visual":true,"captions":true,"semantics":true,"boundaries":true,"incomplete":[]},"reviewed_ranges":[{"start":0,"end":1.6}],"reviewed_boundaries":[0.8],"issues":[]}`
	reviewer := &storyReviewMock{result: verdict}
	p.ai = reviewer
	reserved := 0
	reviewCtx := story.WithAIBudget(ctx, func(context.Context) error { reserved++; return nil })
	report, err := p.ReviewStory(reviewCtx, request, version)
	if err != nil || report.Status != "ready" || !report.Coverage.File || !report.Coverage.Audio || reviewer.calls != 1 || reserved != 1 {
		t.Fatalf("actual review %#v %v calls=%d budget=%d", report, err, reviewer.calls, reserved)
	}
	if len(reviewer.parts) < 6 || reviewer.parts[0].MIME != "video/mp4" || reviewer.parts[1].MIME != "audio/mpeg" || !strings.Contains(string(reviewer.parts[0].Data[:32]), "ftyp") {
		t.Fatal("actual media was not reviewed")
	}
	if strings.Contains(reviewer.prompt, one.Key) || strings.Contains(reviewer.prompt, request.UserID) && request.UserID != "" {
		t.Fatal("private storage reference disclosed")
	}
	if !strings.Contains(reviewer.prompt, `"allowed_source_ids":["one","two"]`) || !strings.Contains(reviewer.prompt, `"allowed_candidate_ids":["one-s1","two-s1"]`) || !strings.Contains(reviewer.prompt, `"candidate_id_to_source_id":{"one-s1":"one","two-s1":"two"}`) {
		t.Fatal("review prompt did not separate file and phrase identifiers")
	}
	reviewer.result = strings.Replace(verdict, `"issues":[]`, `"issues":[{"id":"unknown-source","type":"audio_cut","severity":"major","start":0.1,"end":0.4,"block_id":"first","source_ids":["invented-file-id"],"evidence":"Reported original source comparison.","confidence":0.9}]`, 1)
	report, err = p.ReviewStory(ctx, request, version)
	if err != nil || report.Status != "needs_review" || !report.Coverage.File || report.Coverage.Audio || !strings.Contains(strings.Join(report.Coverage.Incomplete, " "), "invented-file-id") {
		t.Fatalf("unknown media source approved or diagnostic missing: %#v %v", report, err)
	}
	reviewer.err = errors.New("timeout secret diagnostic")
	report, err = p.ReviewStory(ctx, request, version)
	if err != nil || report.Status == "ready" || len(report.Coverage.Incomplete) == 0 || strings.Contains(strings.Join(report.Coverage.Incomplete, ""), "secret") {
		t.Fatalf("reviewer failure accepted %#v %v", report, err)
	}
	deniedCtx := story.WithAIBudget(ctx, func(context.Context) error { return errors.New("budget") })
	previousCalls := reviewer.calls
	report, _ = p.ReviewStory(deniedCtx, request, version)
	if report.Status == "ready" || reviewer.calls != previousCalls {
		t.Fatal("media review exceeded durable AI budget")
	}
}

type storyNoAccessStorage struct {
	media.Storage
	t *testing.T
}

func (s storyNoAccessStorage) Path(string) (string, error) {
	s.t.Fatal("invalid timeline accessed storage before full validation")
	return "", errors.New("unexpected storage access")
}

func TestStoryRenderRejectsCompleteTimelineBeforeMediaIO(t *testing.T) {
	for _, test := range []struct {
		name   string
		change func(*story.Request, *story.Version)
		want   string
	}{
		{"oversized later entry", func(_ *story.Request, v *story.Version) {
			v.Timeline[1].OutputOut = 601
			v.Timeline[1].Video.Out = 600
			v.Timeline[1].Audio.Out = 600
		}, "supported output duration"},
		{"later gap", func(_ *story.Request, v *story.Version) { v.Timeline[1].OutputIn = 1.5 }, "gap or invalid duration"},
		{"later nonfinite output", func(_ *story.Request, v *story.Version) { v.Timeline[1].OutputOut = math.NaN() }, "gap or invalid duration"},
		{"later foreign video", func(_ *story.Request, v *story.Version) { v.Timeline[1].Video.SourceID = "foreign" }, "video interval"},
		{"later out-of-source video", func(_ *story.Request, v *story.Version) { v.Timeline[1].Video.Out = 901 }, "video interval"},
		{"later foreign audio", func(_ *story.Request, v *story.Version) { v.Timeline[1].Audio.SourceID = "foreign" }, "audio interval"},
		{"later nonfinite audio", func(_ *story.Request, v *story.Version) { v.Timeline[1].Audio.In = math.Inf(1) }, "audio interval"},
		{"later caption out of range", func(_ *story.Request, v *story.Version) {
			v.Timeline[1].Words = []story.Word{{Text: "outside", Start: 2, End: 2.3}}
		}, "captions do not match"},
		{"later silent caption", func(_ *story.Request, v *story.Version) {
			v.Timeline[1].Audio = nil
			v.Timeline[1].Words = []story.Word{{Text: "invented", Start: 1.2, End: 1.5}}
		}, "captions do not match"},
		{"ambiguous source identity", func(r *story.Request, _ *story.Version) { r.Assets = append(r.Assets, r.Assets[0]) }, "source identity"},
		{"nonfinite source duration", func(r *story.Request, _ *story.Version) { r.Assets[0].Duration = math.Inf(1) }, "video interval"},
	} {
		t.Run(test.name, func(t *testing.T) {
			request := story.Request{ID: "preflight", Options: story.Options{AspectRatio: "16:9"}, Assets: []story.Asset{{ID: "source", Key: "source.mp4", Duration: 900, HasAudio: true}}}
			version := story.Version{Timeline: []story.Entry{
				{OutputIn: 0, OutputOut: 1, Video: story.Interval{SourceID: "source", In: 0, Out: 1}, Audio: &story.Interval{SourceID: "source", In: 0, Out: 1}},
				{OutputIn: 1, OutputOut: 2, Video: story.Interval{SourceID: "source", In: 0, Out: 1}, Audio: &story.Interval{SourceID: "source", In: 0, Out: 1}},
			}}
			test.change(&request, &version)
			// Even workspace creation must come after the validation failure. This
			// missing directory would otherwise fail before source/cache access.
			processor := New(Config{TempDir: filepath.Join(t.TempDir(), "absent-parent"), FFmpegPath: "must-not-start-ffmpeg"}, storyNoAccessStorage{t: t}, nil)
			output, err := processor.RenderStory(context.Background(), request, version)
			if err == nil || !strings.Contains(err.Error(), test.want) || output.Key != "" {
				t.Fatalf("expected preflight %q before any media work, got %#v %v", test.want, output, err)
			}
		})
	}
}

func TestStoryRenderPreflightAllowsExactDurationCeiling(t *testing.T) {
	request := story.Request{ID: "ceiling", Options: story.Options{AspectRatio: "4:5"}, Assets: []story.Asset{{ID: "source", Duration: 900, HasAudio: true}}}
	version := story.Version{Timeline: []story.Entry{{OutputOut: 600, Video: story.Interval{SourceID: "source", In: 20, Out: 620}, Audio: &story.Interval{SourceID: "source", In: 40, Out: 640}, Words: []story.Word{{Text: "Original", Start: 1, End: 1.5}}}}}
	validated, err := validateStoryRender(request, version)
	if err != nil || validated.duration != 600 || validated.width != 1080 || validated.height != 1350 || len(validated.words) != 1 || validated.words[0].Text != "Original" {
		t.Fatalf("valid source-backed timeline changed: %#v %v", validated, err)
	}
}

func TestStoryMediaReviewRejectsInventedSourcesAndMissingCoverage(t *testing.T) {
	request := story.Request{Assets: []story.Asset{{ID: "source"}}}
	version := story.Version{Timeline: []story.Entry{{BlockID: "block", OutputOut: 2}}}
	good := storyMediaVerdict{Coverage: story.Coverage{Audio: true, Visual: true, Captions: true, Semantics: true, Boundaries: true}, Ranges: []storyReviewRange{{0, 2}}, Issues: []story.Issue{}}
	encoded, _ := json.Marshal(good)
	if _, err := parseStoryMediaVerdict(string(encoded), request, version); err != nil {
		t.Fatal(err)
	}
	good.Ranges[0].End = 1
	encoded, _ = json.Marshal(good)
	if _, err := parseStoryMediaVerdict(string(encoded), request, version); err == nil {
		t.Fatal("partial review accepted")
	}
	good.Ranges[0].End = 2
	good.Issues = []story.Issue{{ID: "issue", Type: "crop", Severity: "major", Start: 0, End: 1, BlockID: "block", SourceIDs: []string{"another-user-source"}, Evidence: "actual crop", Confidence: .9}}
	encoded, _ = json.Marshal(good)
	if _, err := parseStoryMediaVerdict(string(encoded), request, version); err == nil {
		t.Fatal("fabricated source accepted")
	}
}

func TestStoryMediaReviewNormalizesOnlyExactUnambiguousCandidateSources(t *testing.T) {
	request := story.Request{Assets: []story.Asset{
		{ID: "source-a", Candidates: []story.Candidate{{ID: "phrase-a", SourceID: "source-a"}}},
		{ID: "source-b", Candidates: []story.Candidate{{ID: "phrase-b", SourceID: "source-b"}}},
	}}
	version := story.Version{Timeline: []story.Entry{{BlockID: "block", CandidateID: "phrase-a", OutputOut: 2}}}
	verdict := storyMediaVerdict{
		Coverage: story.Coverage{Audio: true, Visual: true, Captions: true, Semantics: true, Boundaries: true},
		Ranges:   []storyReviewRange{{0, 2}},
		Issues:   []story.Issue{{ID: "defect", Type: "audio_cut", Severity: "major", Start: .2, End: 1, BlockID: "block", SourceIDs: []string{"phrase-a", "source-a", "phrase-b"}, Evidence: "Audible original and output audio differ at this boundary.", Confidence: .9}},
	}
	encoded, _ := json.Marshal(verdict)
	got, err := parseStoryMediaVerdict(string(encoded), request, version)
	if err != nil || len(got.Issues) != 1 || strings.Join(got.Issues[0].SourceIDs, ",") != "source-a,source-b" || got.Issues[0].Evidence != verdict.Issues[0].Evidence || got.Issues[0].Severity != "major" {
		t.Fatalf("exact candidate normalization lost evidence or provenance: %#v %v", got, err)
	}
	for _, unknown := range []string{"", "phrase-a-suffix", "source", "../source-a", "invented\n" + strings.Repeat("x", 180)} {
		verdict.Issues[0].SourceIDs = []string{unknown}
		encoded, _ = json.Marshal(verdict)
		_, err := parseStoryMediaVerdict(string(encoded), request, version)
		if err == nil || !strings.Contains(err.Error(), "issues[0].source_ids[0]") || !strings.Contains(err.Error(), storyReviewIdentifier(unknown)) || strings.ContainsAny(err.Error(), "\r\n") || len(err.Error()) > 600 {
			t.Fatalf("unknown reference accepted or diagnostic unbounded: %v", err)
		}
	}
	verdict.Issues[0].SourceIDs = []string{"phrase-a"}
	encoded, _ = json.Marshal(verdict)
	request.Assets[1].Candidates = append(request.Assets[1].Candidates, story.Candidate{ID: "phrase-a", SourceID: "source-b"})
	if _, err = parseStoryMediaVerdict(string(encoded), request, version); err == nil {
		t.Fatal("ambiguous candidate was mapped to an arbitrary source")
	}
	request.Assets[1].Candidates = request.Assets[1].Candidates[:1]
	request.Assets[0].Candidates[0].SourceID = "source-b"
	if _, err = parseStoryMediaVerdict(string(encoded), request, version); err == nil {
		t.Fatal("inconsistent candidate source provenance was normalized")
	}
}

func TestStoryMediaReviewPreservesLexicalDefectsWithoutFutileRepairs(t *testing.T) {
	request := story.Request{Assets: []story.Asset{{ID: "source", Candidates: []story.Candidate{{ID: "selected"}, {ID: "alternative"}}}}}
	version := story.Version{Timeline: []story.Entry{{BlockID: "block", CandidateID: "selected", OutputOut: 2}}}
	for _, test := range []struct {
		name, kind, operation, candidate, wantOperation string
	}{
		{"wrong spoken ASR words", "transcription", "restore_context", "alternative", ""},
		{"wrong subtitle words", "caption_text", "retime_captions", "", ""},
		{"legacy caption defect", "captions", "retime_captions", "", ""},
		{"correct words wrong timing", "caption_timing", "retime_captions", "", "retime_captions"},
		{"context without replacement", "audio_cut", "restore_context", "", ""},
		{"context unchanged take", "audio_cut", "restore_context", "selected", ""},
		{"context with alternative", "audio_cut", "restore_context", "alternative", "restore_context"},
	} {
		t.Run(test.name, func(t *testing.T) {
			verdict := storyMediaVerdict{
				Coverage: story.Coverage{Audio: true, Visual: true, Captions: true, Semantics: true, Boundaries: true},
				Ranges:   []storyReviewRange{{0, 2}},
				Issues:   []story.Issue{{ID: "observed-defect", Type: test.kind, Severity: "major", Start: .2, End: 1.2, BlockID: "block", SourceIDs: []string{"source"}, Evidence: "The actual original audio and rendered audio provide the comparison evidence.", Confidence: .9, Operation: test.operation, CandidateID: test.candidate, Resolved: true}},
			}
			encoded, _ := json.Marshal(verdict)
			got, err := parseStoryMediaVerdict(string(encoded), request, version)
			if err != nil || len(got.Issues) != 1 {
				t.Fatalf("blocking evidence was lost: %#v %v", got, err)
			}
			issue := got.Issues[0]
			if issue.Operation != test.wantOperation || issue.Resolved || issue.Severity != "major" || issue.Evidence != verdict.Issues[0].Evidence {
				t.Fatalf("incorrect repair or hidden defect: %#v", issue)
			}
			if issue.Operation == "" && issue.CandidateID != "" {
				t.Fatal("unusable replacement candidate retained")
			}
		})
	}
}

func TestStoryReviewNeverApprovesTextOnlyProvider(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	asset := storySource(t, p, dir, "only", "blue", 440)
	request := story.Request{ID: "story-no-review", Options: story.Options{AspectRatio: "1:1"}, Assets: []story.Asset{asset}}
	version := story.Version{Number: 1, Timeline: []story.Entry{{BlockID: "one", OutputOut: .5, Video: story.Interval{SourceID: asset.ID, Out: .5}, Audio: &story.Interval{SourceID: asset.ID, Out: .5}}}}
	output, err := p.RenderStory(context.Background(), request, version)
	if err != nil {
		t.Fatal(err)
	}
	version.Output = output
	report, err := p.ReviewStory(context.Background(), request, version)
	if err != nil || report.Status == "ready" || !report.Coverage.File || report.Coverage.Audio || len(report.Coverage.Incomplete) == 0 {
		t.Fatalf("text-only review false success %#v %v", report, err)
	}
	path, err := p.storage.(interface{ Path(string) (string, error) }).Path(output.Key)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, []byte("corrupt media"), 0600); err != nil {
		t.Fatal(err)
	}
	report, _ = p.ReviewStory(context.Background(), request, version)
	if report.Coverage.File || len(report.Issues) != 1 || report.Issues[0].Severity != "critical" {
		t.Fatal("corrupt output passed", report)
	}
}

func TestStorySpeakerComparisonCannotBeApprovedFromMatchingText(t *testing.T) {
	original := story.Candidate{ID: "original", SourceID: "a", Text: "Same exact words.", Language: "en", Speaker: "unknown", In: 0, Out: 2}
	replacement := original
	replacement.ID = "replacement"
	replacement.SourceID = "b"
	request := story.Request{Assets: []story.Asset{{ID: "a", Candidates: []story.Candidate{original}}, {ID: "b", Candidates: []story.Candidate{replacement}}}}
	version := story.Version{Plan: story.Plan{Blocks: []story.Block{{ID: "block", CandidateID: replacement.ID, IdentityReferenceID: original.ID}}}, Timeline: []story.Entry{{BlockID: "block", OutputOut: 2}}}
	verdict := storyMediaVerdict{Coverage: story.Coverage{Audio: true, Visual: true, Captions: true, Semantics: true, Boundaries: true, SourceIdentity: true}, Ranges: []storyReviewRange{{0, 2}}}
	encoded, _ := json.Marshal(verdict)
	got, err := parseStoryMediaVerdict(string(encoded), request, version)
	if err != nil || got.Coverage.SourceIdentity || got.Coverage.Semantics || len(got.Issues) != 1 || got.Issues[0].Type != "unknown_speaker" {
		t.Fatalf("metadata-only identity passed %#v %v", got, err)
	}
	verdict.Identity = []storyIdentityFinding{{BlockID: "block", Match: true, Confidence: .96, Evidence: "Original and replacement audio voice and visible speaker agree in both provided clips."}}
	encoded, _ = json.Marshal(verdict)
	got, err = parseStoryMediaVerdict(string(encoded), request, version)
	if err != nil || !got.Coverage.SourceIdentity || !got.Coverage.Semantics || len(got.Issues) != 0 {
		t.Fatalf("verified comparison rejected %#v %v", got, err)
	}
	// One recording can contain multiple speakers. Different takes from that
	// same file still need actual audio/video identity evidence.
	replacement.SourceID = original.SourceID
	replacement.In, replacement.Out = 3, 5
	request.Assets = []story.Asset{{ID: original.SourceID, Candidates: []story.Candidate{original, replacement}}}
	verdict.Identity = nil
	encoded, _ = json.Marshal(verdict)
	got, err = parseStoryMediaVerdict(string(encoded), request, version)
	if err != nil || got.Coverage.SourceIdentity || len(got.Issues) != 1 {
		t.Fatalf("same-file unknown speaker bypassed media comparison %#v %v", got, err)
	}
}

func TestStoryRenderPreservesSourceAudioStartOffset(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	ctx := context.Background()
	file := filepath.Join(dir, "delayed.mp4")
	if err := p.ffmpeg(ctx, dir, "-f", "lavfi", "-i", "color=c=red:s=320x180:r=30", "-itsoffset", "0.4", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "1.2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", file); err != nil {
		t.Fatal(err)
	}
	if err := p.storage.Save(ctx, file, "sources/test/delayed.mp4", "video/mp4"); err != nil {
		t.Fatal(err)
	}
	asset, err := p.Inspect(ctx, "sources/test/delayed.mp4")
	if err != nil {
		t.Fatal(err)
	}
	asset.ID = "delayed"
	request := story.Request{ID: "offset", Options: story.Options{AspectRatio: "1:1"}, Assets: []story.Asset{asset}}
	version := story.Version{Number: 1, Timeline: []story.Entry{{BlockID: "one", OutputOut: 1, Video: story.Interval{SourceID: asset.ID, Out: 1}, Audio: &story.Interval{SourceID: asset.ID, Out: 1}}}}
	output, err := p.RenderStory(ctx, request, version)
	if err != nil {
		t.Fatal(err)
	}
	rendered, err := p.storyMaterialize(ctx, dir, output.Key)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := run(ctx, dir, p.cfg.FFmpegPath, "-v", "error", "-i", rendered, "-t", "0.2", "-vn", "-ac", "1", "-ar", "8000", "-f", "s16le", "-")
	if err != nil {
		t.Fatal(err)
	}
	peak := 0.0
	for i := 0; i+1 < len(raw); i += 2 {
		peak = max(peak, math.Abs(float64(int16(binary.LittleEndian.Uint16(raw[i:i+2]))))/32768)
	}
	if peak > .005 {
		t.Fatalf("audio was moved earlier than source PTS: leading peak=%f", peak)
	}
}

func TestStoryNormalizesActualRotatedVariableFrameMOV(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	ctx := context.Background()
	vfr := filepath.Join(dir, "vfr.mp4")
	if err := p.ffmpeg(ctx, dir, "-f", "lavfi", "-i", "testsrc2=size=160x90:rate=30", "-vf", "select='if(lt(t,0.8),not(mod(n,2)),1)'", "-fps_mode", "vfr", "-t", "1.6", "-c:v", "libx264", "-pix_fmt", "yuv420p", vfr); err != nil {
		t.Fatal(err)
	}
	rotated := filepath.Join(dir, "phone.mov")
	if err := p.ffmpeg(ctx, dir, "-display_rotation:v:0", "90", "-i", vfr, "-c", "copy", rotated); err != nil {
		t.Fatal(err)
	}
	if err := p.storage.Save(ctx, rotated, "sources/test/phone.mov", "video/quicktime"); err != nil {
		t.Fatal(err)
	}
	asset, err := p.Inspect(ctx, "sources/test/phone.mov")
	if err != nil {
		t.Fatal(err)
	}
	asset.ID = "phone"
	if asset.Width != 90 || asset.Height != 160 || len(asset.Warnings) == 0 {
		t.Fatalf("actual rotation/VFR lost %#v", asset)
	}
	analyzed, err := p.Analyze(ctx, "phones", asset, story.DefaultOptions())
	if err != nil {
		t.Fatal(err)
	}
	proxy, err := p.storyMaterialize(ctx, dir, analyzed.ProxyKey)
	if err != nil {
		t.Fatal(err)
	}
	info, err := p.probe(ctx, proxy)
	if err != nil || info.Width != 90 || info.Height != 160 || math.Abs(info.Duration-asset.Duration) > .08 || analyzed.Mapping.Rate != 1 {
		t.Fatalf("presentation clock changed %#v %#v %v", info, analyzed.Mapping, err)
	}
}

func TestStoryAnalyzesSubsecondSupportingFootage(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	ctx := context.Background()
	file := filepath.Join(dir, "short-reaction.mp4")
	if err := p.ffmpeg(ctx, dir, "-f", "lavfi", "-i", "color=c=blue:s=160x90:r=30", "-t", "0.4", "-c:v", "libx264", "-pix_fmt", "yuv420p", file); err != nil {
		t.Fatal(err)
	}
	if err := p.storage.Save(ctx, file, "sources/test/short.mp4", "video/mp4"); err != nil {
		t.Fatal(err)
	}
	asset, err := p.Inspect(ctx, "sources/test/short.mp4")
	if err != nil {
		t.Fatal(err)
	}
	asset.ID = "short"
	analyzed, err := p.Analyze(ctx, "short-source", asset, story.DefaultOptions())
	if err != nil {
		t.Fatal(err)
	}
	if len(analyzed.Candidates) != 1 || analyzed.Candidates[0].Role != "b_roll" || analyzed.Candidates[0].In != 0 || math.Abs(analyzed.Candidates[0].Out-.4) > .04 || analyzed.Candidates[0].VisualScore <= 0 {
		t.Fatalf("subsecond source lost %#v", analyzed.Candidates)
	}
	request := story.Request{ID: "silent-render", Options: story.Options{AspectRatio: "16:9"}, Assets: []story.Asset{analyzed}}
	version := story.Version{Number: 1, Timeline: []story.Entry{{BlockID: "silent", CandidateID: analyzed.Candidates[0].ID, OutputOut: .4, Video: story.Interval{SourceID: analyzed.ID, Out: .4}, Crop: "fit"}}}
	output, err := p.RenderStory(ctx, request, version)
	if err != nil {
		t.Fatal("intentional silent track must not be loudness-normalized", err)
	}
	rendered, err := p.storyMaterialize(ctx, dir, output.Key)
	if err != nil {
		t.Fatal(err)
	}
	if err = p.decodeStory(ctx, rendered); err != nil {
		t.Fatal("silent rendered video does not decode", err)
	}
}
