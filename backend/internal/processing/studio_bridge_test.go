package processing

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"sneepcut/backend-go/internal/audiocleanup"
	"sneepcut/backend-go/internal/captions"
	"sneepcut/backend-go/internal/media"
	"sneepcut/backend-go/internal/music"
	"sneepcut/backend-go/internal/story"
)

const studioTestOwner = "11111111-1111-4111-8111-111111111111"

func captureStudioPlan(t *testing.T, p *Processor) *studioPlan {
	t.Helper()
	captured := new(studioPlan)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var envelope struct {
			Operation string `json:"operation"`
			RequestID string `json:"request_id"`
			Input     struct {
				Plan studioPlan `json:"plan"`
			} `json:"input"`
		}
		if err := json.NewDecoder(r.Body).Decode(&envelope); err != nil {
			t.Error(err)
			w.WriteHeader(400)
			return
		}
		if envelope.Operation == "composition.render" {
			*captured = envelope.Input.Plan
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"artifact_id": envelope.RequestID, "status": "failed"})
	}))
	t.Cleanup(server.Close)
	p.cfg.StudioURL, p.cfg.StudioSecret, p.cfg.MediaSigningSecret, p.cfg.MediaOrigin = server.URL, strings.Repeat("s", 32), strings.Repeat("m", 32), "http://localhost:3000"
	return captured
}

func writeStudioContractFixture(t *testing.T, name string, plan *studioPlan) {
	t.Helper()
	dir := os.Getenv("SNEEPCUT_STUDIO_CONTRACT_DIR")
	if dir == "" {
		return
	}
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	raw, err := json.MarshalIndent(plan, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(filepath.Join(dir, name+".json"), raw, 0600); err != nil {
		t.Fatal(err)
	}
}

func TestStudioStoryPlanPreservesCutsSpeechCaptionFontAndTransition(t *testing.T) {
	dir := t.TempDir()
	storage, err := media.NewLocalStorage(filepath.Join(dir, "media"))
	if err != nil {
		t.Fatal(err)
	}
	defer storage.Close()
	p := New(Config{TempDir: dir}, storage, nil)
	plan := captureStudioPlan(t, p)
	words := []story.Word{{Text: "first", Start: .1, End: .5}, {Text: "second", Start: 1.1, End: 1.5}}
	style := captions.Default()
	request := story.Request{ID: "studio-story", UserID: studioTestOwner, Options: story.Options{AspectRatio: "16:9", CaptionMode: "all", CaptionStyle: &style}, Assets: []story.Asset{{ID: "source", Key: "uploads/" + studioTestOwner + "/source.mp4", Hash: "hash", Duration: 2, Width: 1920, Height: 1080, HasAudio: true, Candidates: []story.Candidate{{ID: "first", SourceID: "source", In: 0, Out: 1, Words: words[:1]}, {ID: "second", SourceID: "source", In: 1, Out: 2, Words: words[1:]}}}}}
	version := story.Version{Number: 2, Plan: story.Plan{Title: "Editable example"}, Timeline: []story.Entry{{BlockID: "one", CandidateID: "first", OutputOut: 1, Video: story.Interval{SourceID: "source", Out: 1}, Audio: &story.Interval{SourceID: "source", Out: 1}, Words: words[:1], Crop: "fit"}, {BlockID: "two", CandidateID: "second", OutputIn: 1, OutputOut: 2, Video: story.Interval{SourceID: "source", In: 1, Out: 2}, Audio: &story.Interval{SourceID: "source", In: 1, Out: 2}, Words: words[1:], Crop: "fit", Transition: "fade"}}}
	output, err := p.RenderStory(context.Background(), request, version)
	if err == nil || output.StudioArtifactID != "" {
		t.Fatal("unverified output published", output, err)
	}
	if len(plan.Scenes) != 2 || len(plan.Audio) != 2 || plan.Scenes[0].FadeOut != .08 || plan.Scenes[1].FadeIn != .08 || plan.Audio[1].Start != 1 || plan.Audio[1].SourceIn != 1 || plan.Audio[1].SceneID != plan.Scenes[1].ID {
		t.Fatalf("cut or speech clock lost: %#v", plan)
	}
	if plan.Captions == nil || len(plan.Captions.Groups) != 2 || plan.Captions.FontAssetID == "" || plan.Captions.Style != style {
		t.Fatalf("captions are not editable: %#v", plan.Captions)
	}
	for _, asset := range plan.Assets {
		if asset.Kind == "video" && asset.Duration != 2 {
			t.Fatal("missing media duration")
		}
		if !strings.HasPrefix(asset.URL, "/media/") || !strings.Contains(asset.URL, "sig=") {
			t.Fatal("unsigned or arbitrary asset URL")
		}
	}
	writeStudioContractFixture(t, "story", plan)
}

func TestStudioNarrationMusicHDRPlanRetainsIndependentLayers(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	plan := captureStudioPlan(t, p)
	ctx := context.Background()
	source := storySource(t, p, dir, "studio-layer-source", "blue", 440)
	voiceFile := filepath.Join(dir, "voice.wav")
	if err := p.ffmpeg(ctx, dir, "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "2", "-c:a", "pcm_s16le", voiceFile); err != nil {
		t.Fatal(err)
	}
	voiceKey := "work/studio-layers/audio/cleaned/processed.wav"
	if err := p.storage.Save(ctx, voiceFile, voiceKey, "audio/wav"); err != nil {
		t.Fatal(err)
	}
	musicKey := "music/incompetech/studio-fixture.flac"
	musicFile := filepath.Join(dir, "music.flac")
	if err := p.ffmpeg(ctx, dir, "-f", "lavfi", "-i", "sine=frequency=220:sample_rate=48000", "-t", "3", "-c:a", "flac", musicFile); err != nil {
		t.Fatal(err)
	}
	if err := p.storage.Save(ctx, musicFile, musicKey, "audio/flac"); err != nil {
		t.Fatal(err)
	}
	voice := story.Asset{ID: "voice", Kind: "narration", Key: voiceKey, Hash: "voice-hash", Duration: 2, HasAudio: true, AudioCleanup: &audiocleanup.Derivative{Status: "ready", Key: voiceKey, Fingerprint: "cleaned", SourceHash: "voice-hash", Duration: 2}}
	word := story.Word{Text: "Narration", Start: .2, End: 1.4}
	voice.Candidates = []story.Candidate{{ID: "voice-phrase", SourceID: voice.ID, In: 0, Out: 2, Words: []story.Word{word}}}
	style := captions.Default()
	request := story.Request{ID: "studio-layers", UserID: studioTestOwner, Options: story.Options{Narration: true, AspectRatio: "16:9", DynamicRange: "hdr", CaptionMode: "all", CaptionStyle: &style, AudioCleanup: &audiocleanup.Settings{Enabled: true}, Music: &story.MusicSelection{TrackID: "fixture", Volume: .2}}, Assets: []story.Asset{source, voice}, Music: &story.PreparedMusic{Key: musicKey, Track: music.Track{ID: "fixture", Title: "Test music", Artist: "Test artist", DurationSeconds: 3, Attribution: "Test attribution"}}}
	version := story.Version{Number: 1, Plan: story.Plan{Title: "Narration and music"}, Timeline: []story.Entry{{BlockID: "one", CandidateID: "visual", OutputOut: 1, Video: story.Interval{SourceID: source.ID, Out: 1}, Audio: &story.Interval{SourceID: voice.ID, Out: 1}, Words: []story.Word{word}, Crop: "fit"}, {BlockID: "two", CandidateID: "visual", OutputIn: 1, OutputOut: 2, Video: story.Interval{SourceID: source.ID, In: .6, Out: 1.6}, Audio: &story.Interval{SourceID: voice.ID, In: 1, Out: 2}, Crop: "fit"}}}
	if _, err := p.RenderStory(ctx, request, version); err == nil || plan.SchemaVersion == 0 {
		t.Fatal("Studio plan was not submitted", err)
	}
	if len(plan.Scenes) != 2 || len(plan.Audio) != 2 || plan.Audio[0].ID != "narration" || plan.Audio[0].Duration != 2 || plan.Audio[0].SceneID != "" || plan.DynamicRange != "hdr" {
		t.Fatalf("narration/HDR composition lost: %#v", plan)
	}
	if len(plan.Audio[1].Envelope) < 2 || len(plan.Overlays) != 1 || plan.Overlays[0].ID != "music-credit" {
		t.Fatal("music automation or credit flattened")
	}
	writeStudioContractFixture(t, "narration-music-hdr", plan)
}

func TestStudioLegacyPlanUsesOriginalSourceAndSeparateCleanupAudio(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	plan := captureStudioPlan(t, p)
	source := storySource(t, p, dir, "studio-legacy", "green", 440)
	in := RenderInput{UserID: studioTestOwner, Namespace: "studio-legacy/clip", SourceKey: source.Key, AspectRatio: "16:9", Segments: []Segment{{0, .8}, {.8, 1.6}}, Transition: "fade", TransitionDuration: .1, BurnSubtitles: true, SubtitleStyle: "clean", Transcript: Transcript{Words: []Word{{"first", .1, .5}, {"second", 1.1, 1.5}}}, Brand: map[string]any{"user_id": studioTestOwner, "apply_brand": true, "apply_brand_colors": true, "primary_color": "#112233", "secondary_color": "#FFFFFF"}, HookText: "Editable hook"}
	if _, err := p.Render(context.Background(), in); err == nil || plan.SchemaVersion == 0 {
		t.Fatal("Studio plan was not submitted", err)
	}
	if len(plan.Scenes) != 2 || len(plan.Audio) != 2 || plan.Duration != 1.5 || plan.Scenes[1].Start != .7 || plan.Audio[1].Envelope[0].Value != 0 || plan.Captions == nil || len(plan.Overlays) != 2 {
		t.Fatalf("legacy timeline lost: %#v", plan)
	}
	writeStudioContractFixture(t, "legacy", plan)
}

func TestStudioRenderingDoesNotFallBackWhenUnavailable(t *testing.T) {
	p := New(Config{}, nil, nil)
	_, err := p.Render(context.Background(), RenderInput{UserID: studioTestOwner, Namespace: "unavailable", Segments: []Segment{{0, 1}}})
	if err == nil || !strings.Contains(err.Error(), "Studio rendering is unavailable") {
		t.Fatal(err)
	}
}

func TestStudioCropAndMusicAutomationUseEditableLocalClocks(t *testing.T) {
	frames := []studioCropFrame{{Time: 0, studioCrop: studioCrop{X: 10, Width: 100, Height: 100}}, {Time: 1, studioCrop: studioCrop{X: 20, Width: 100, Height: 100}}, {Time: 2, studioCrop: studioCrop{X: 30, Width: 100, Height: 100}}}
	crop, window := studioWindowCrop(frames, Segment{1.5, 2.5})
	if crop.X != 20 || len(window) != 2 || window[1].Time != .5 {
		t.Fatal(crop, window)
	}
	levels := make([]float64, 1000)
	for i := 200; i < 600; i++ {
		levels[i] = .5
	}
	points := studioDuckEnvelope(levels, 20, .5)
	if len(points) > 512 || points[0].Value != 0 || points[len(points)-1].Value != 0 {
		t.Fatal("invalid envelope", points)
	}
	quiet, loud := studioEnvelopeWindow(points, 2, 1)[0].Value, studioEnvelopeWindow(points, 6, 1)[0].Value
	if loud >= quiet*.5 {
		t.Fatal("music did not duck for actual voice energy", quiet, loud)
	}
}

func TestStudioVerifiesOutputBeforePublishingIdentity(t *testing.T) {
	p, storage, dir := storyTestProcessor(t)
	ctx := context.Background()
	source := storySource(t, p, dir, "studio-verified", "red", 440)
	file, err := storage.Path(source.Key)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	valid := true
	seenRender := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var envelope struct {
			Operation string `json:"operation"`
			RequestID string `json:"request_id"`
			Input     struct {
				Plan studioPlan `json:"plan"`
			} `json:"input"`
		}
		_ = json.NewDecoder(r.Body).Decode(&envelope)
		if envelope.Operation == "composition.output" {
			if valid {
				_, _ = w.Write(raw)
			} else {
				_, _ = w.Write([]byte("broken"))
			}
			return
		}
		if envelope.Operation == "composition.render" {
			seenRender = true
		}
		size := len(raw)
		if !valid {
			size = 6
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"artifact_id": envelope.RequestID, "status": "complete", "duration": source.Duration, "width": source.Width, "height": source.Height, "size": size})
	}))
	defer server.Close()
	p.cfg.StudioURL, p.cfg.StudioSecret, p.cfg.MediaSigningSecret, p.cfg.MediaOrigin = server.URL, strings.Repeat("s", 32), strings.Repeat("m", 32), "http://localhost"
	in := RenderInput{UserID: studioTestOwner, Namespace: "studio-verified/first", SourceKey: source.Key, PreserveGeometry: true, Segments: []Segment{{0, source.Duration}}}
	clip, err := p.Render(ctx, in)
	if err != nil || !seenRender || clip.StudioArtifactID == "" || clip.FileSize != int64(len(raw)) {
		t.Fatal(clip, err)
	}
	if exists, _ := storage.Exists(ctx, clip.StorageKey); !exists {
		t.Fatal("verified output not durable")
	}
	valid = false
	in.Namespace = "studio-verified/invalid"
	clip, err = p.Render(ctx, in)
	if err == nil || clip.StudioArtifactID != "" {
		t.Fatal("corrupt output published", clip, err)
	}
}

func TestStudioNativeTrimDerivesExactArtifactWithoutReadingFlattenedMedia(t *testing.T) {
	dir := t.TempDir()
	p := New(Config{TempDir: dir, Timeout: time.Second * 5}, nil, nil)
	seen := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var envelope struct {
			Operation string `json:"operation"`
			RequestID string `json:"request_id"`
			Input     struct {
				Artifact string                       `json:"base_artifact_id"`
				Trim     struct{ Start, End float64 } `json:"trim"`
			} `json:"input"`
		}
		_ = json.NewDecoder(r.Body).Decode(&envelope)
		if envelope.Operation == "composition.derive" {
			seen = true
			if envelope.Input.Artifact != "22222222-2222-4222-8222-222222222222" || envelope.Input.Trim.Start != .5 || envelope.Input.Trim.End != 2 {
				t.Error("wrong native window")
			}
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"artifact_id": envelope.RequestID, "status": "failed"})
	}))
	defer server.Close()
	p.cfg.StudioURL, p.cfg.StudioSecret = server.URL, strings.Repeat("s", 32)
	_, err := p.Render(context.Background(), RenderInput{UserID: studioTestOwner, Namespace: "native/trim", SourceKey: "must-not-read.mp4", StudioArtifactID: "22222222-2222-4222-8222-222222222222", StudioTrim: true, Segments: []Segment{{.5, 2}}})
	if err == nil || !seen {
		t.Fatal("native artifact was flattened", err)
	}
}

func TestStudioSharedSourceCanAppearAsSpeechBeforeVideo(t *testing.T) {
	dir := t.TempDir()
	storage, err := media.NewLocalStorage(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer storage.Close()
	p := New(Config{MediaOrigin: "http://localhost", MediaSigningSecret: strings.Repeat("s", 32)}, storage, nil)
	plan := studioPlan{}
	audio, err := p.studioAsset(context.Background(), &plan, "sources/interview.mp4", "audio")
	if err != nil {
		t.Fatal(err)
	}
	studioAudioMetadata(&plan, audio, 3)
	video, err := p.studioAsset(context.Background(), &plan, "sources/interview.mp4", "video")
	if err != nil || video != audio || len(plan.Assets) != 1 || plan.Assets[0].Kind != "video" || plan.Assets[0].Duration != 3 {
		t.Fatal("source capability was not preserved", plan, err)
	}
}

func TestStudioIndependentCameraSpeechKeepsItsBrowserPreview(t *testing.T) {
	storage, err := media.NewLocalStorage(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer storage.Close()
	p := New(Config{MediaOrigin: "http://localhost:3000", MediaSigningSecret: strings.Repeat("m", 32)}, storage, nil)
	plan := studioPlan{Assets: []studioAsset{{ID: "speech", Kind: "audio", URL: "/media/sources/camera.mov"}}}
	source := story.Asset{Key: "sources/camera.mov", ProxyKey: "work/story/camera-proxy.mp4", VideoCodec: "prores", AudioCodec: "pcm_s24le", HasAudio: true}
	if err := p.studioSourcePreview(context.Background(), "", "story", &plan, "speech", source, story.Options{}); err != nil {
		t.Fatal(err)
	}
	asset := plan.Assets[0]
	if asset.URL != "/media/sources/camera.mov" || !strings.HasPrefix(asset.PreviewURL, "/media/work/story/camera-proxy.mp4?") || !strings.Contains(asset.PreviewURL, "sig=") {
		t.Fatal("camera speech was flattened or lacks its playback proxy", asset)
	}
}

func TestStudioNaturalBridgePreservesParentAudioCaptionAndCropClocks(t *testing.T) {
	left := studioScene{ID: "scene-1", AssetID: "source", Start: 0, Duration: 2, SourceIn: 4, Fit: "cover", Crop: &studioCrop{X: 10, Y: 20, Width: 160, Height: 160}, CropKeyframes: []studioCropFrame{{Time: 1, studioCrop: studioCrop{X: 30, Y: 20, Width: 160, Height: 160}}}}
	right := studioScene{ID: "scene-2", AssetID: "source", Start: 2, Duration: 1, SourceIn: 8, Fit: "contain"}
	plan := studioPlan{SchemaVersion: 1, Title: "Bridge", Width: 180, Height: 180, Duration: 3, DynamicRange: "sdr", Assets: []studioAsset{{ID: "source", Name: "source.mp4", Kind: "video", URL: "/media/sources/source.mp4", Duration: 10, Width: 320, Height: 180, HasAudio: true}, {ID: "bridge", Name: "bridge.mp4", Kind: "video", URL: "/media/work/bridge.mp4", Duration: .2, Width: 180, Height: 180}}, Scenes: []studioScene{left, right}, Audio: []studioAudio{{ID: "speech", AssetID: "source", Start: 0, Duration: 2, SourceIn: 4, Volume: 1, SceneID: left.ID}}, Captions: &studioCaption{Groups: [][]Word{{{Text: "Original", Start: .1, End: 1.8}}}, Style: captions.Default()}}
	studioAttachBridge(&plan, 0, "bridge")
	if len(plan.Scenes) != 4 || plan.Scenes[0].SourceIn != 4 || plan.Audio[0].SceneID != left.ID || plan.Captions.Groups[0][0].Start != .1 {
		t.Fatal("bridge changed source layers", plan)
	}
	if first, second := plan.Scenes[2], plan.Scenes[3]; first.Start != 1.9 || second.Start != 2 || second.SourceIn != .1 || first.ParentSceneID != left.ID || second.ParentSceneID != right.ID || first.Role != "bridge" {
		t.Fatal("bridge replacement is not attached to source clocks", first, second)
	}
	if filter := studioBridgeFrameFilter(left, 1.9, 180, 180); !strings.HasPrefix(filter, "crop=160.000000:160.000000:30.000000:20.000000,") {
		t.Fatal("interpolation endpoint ignored current crop", filter)
	}
	writeStudioContractFixture(t, "natural-bridge", &plan)
}

func TestStudioMotionBridgePreparesOnlyIndependentSilentFrames(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	p.ai = studioBridgeAdvisor{}
	p.cfg.MediaSigningSecret, p.cfg.MediaOrigin = strings.Repeat("m", 32), "http://localhost:3000"
	source := filepath.Join(dir, "bridge-source.mp4")
	ctx := context.Background()
	if err := p.ffmpeg(ctx, dir, "-f", "lavfi", "-i", "color=c=gray:s=160x90:r=30,geq=lum='80+40*T':cb=128:cr=128", "-t", "2", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", source); err != nil {
		t.Fatal(err)
	}
	left := studioScene{ID: "left", Duration: .6, Fit: "contain"}
	right := studioScene{ID: "right", Start: .6, SourceIn: 1.4, Duration: .6, Fit: "contain"}
	plan := studioPlan{Width: 160, Height: 90, Scenes: []studioScene{left, right}, Audio: []studioAudio{{ID: "speech", AssetID: "source", SceneID: left.ID, Duration: .6, Volume: 1}}}
	input := RenderInput{Namespace: "motion-fixture/clip", SourceKey: "sources/motion-fixture.mp4", Segments: []Segment{{0, .6}, {1.4, 2}}}
	decisions := []BoundaryDecision{{Outgoing: .6, Incoming: 1.4, Score: .7, VisualSimilarity: .7, Motion: .1, SpeechSafe: true}}
	if err := p.studioNaturalBridges(ctx, dir, source, input, &plan, decisions); err != nil {
		t.Fatal("motion bridge preparation failed", err)
	}
	if decisions[0].Strategy != "interpolated_bridge" || len(plan.Assets) != 1 || len(plan.Scenes) != 4 || plan.Audio[0].SceneID != left.ID {
		t.Fatal("approved bridge did not become an independent editable visual", decisions, plan)
	}
	file, err := p.storyMaterialize(ctx, dir, plan.Assets[0].Key)
	if err != nil {
		t.Fatal(err)
	}
	info, err := p.probe(ctx, file)
	if err != nil || info.Duration < .19 || info.Duration > .21 || info.Width != 160 || info.Height != 90 || info.Audio {
		t.Fatal("bridge is not a separate .2-second visual asset", info, err)
	}
}

type studioBridgeAdvisor struct{}

func (studioBridgeAdvisor) Generate(context.Context, string) (string, error) {
	return `{"bridge":true}`, nil
}
