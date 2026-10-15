package processing

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"sneepcut/backend-go/internal/aiprovider"
	"sneepcut/backend-go/internal/story"
)

type nativeModelProvider struct {
	models map[aiprovider.Task]string
	calls  int
	err    error
}

func (*nativeModelProvider) Generate(context.Context, string) (string, error) {
	return "", aiprovider.ErrNotConfigured
}

func (p *nativeModelProvider) NativeModels(context.Context) (map[aiprovider.Task]string, error) {
	p.calls++
	return p.models, p.err
}

func TestNativeModelsStayStableDuringOperationAndRefreshForNextOperation(t *testing.T) {
	original := Config{WhisperModel: "original-asr", StoryWhisperModel: "original-story", WhisperVADModel: "original-vad", FaceModel: "original-face"}
	router := &nativeModelProvider{models: map[aiprovider.Task]string{
		aiprovider.TaskTranscription: "selected-asr", aiprovider.TaskStoryTranscription: "selected-story",
		aiprovider.TaskVoiceDetection: "selected-vad", aiprovider.TaskFaceTracking: "selected-face",
	}}
	p := New(original, nil, router)
	before := p.cfg
	active, err := p.withNativeModels(context.Background())
	if err != nil || active == p || active.cfg.WhisperModel != "selected-asr" || active.cfg.StoryWhisperModel != "selected-story" || active.cfg.WhisperVADModel != "selected-vad" || active.cfg.FaceModel != "selected-face" {
		t.Fatalf("native model binding failed: %#v %v", active, err)
	}
	router.models[aiprovider.TaskStoryTranscription] = "next-story"
	nested, err := active.withNativeModels(context.Background())
	if err != nil || nested != active || nested.cfg.StoryWhisperModel != "selected-story" || router.calls != 1 {
		t.Fatal("nested operation reselected native models during execution")
	}
	next, err := p.withNativeModels(context.Background())
	if err != nil || next.cfg.StoryWhisperModel != "next-story" || active.cfg.StoryWhisperModel != "selected-story" || router.calls != 2 || p.cfg != before || p.nativeResolved {
		t.Fatal("model change did not isolate active and subsequent operations")
	}
}

func TestNaturalClipReuseRequiresSelectedFaceModel(t *testing.T) {
	dir := t.TempDir()
	firstModel, nextModel := filepath.Join(dir, "face-first"), filepath.Join(dir, "face-next")
	for _, path := range []string{firstModel, nextModel} {
		if err := os.WriteFile(path, []byte("model fixture"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	router := &nativeModelProvider{models: map[aiprovider.Task]string{aiprovider.TaskFaceTracking: firstModel}}
	p := New(Config{}, nil, router)
	bound, err := p.withNativeModels(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	firstSignature := storyModelSignature(bound.cfg.FaceModel)
	segments := []Segment{{0, 1}, {2, 3}}
	decisions := []BoundaryDecision{{Index: 0, Strategy: "cut"}}
	input := RenderInput{Segments: segments, PreviousDecisions: decisions, Reuse: &Clip{Segments: segments, Metadata: map[string]any{"face_model_signature": firstSignature}}}
	if !canReuseNaturalClip(input, decisions, firstSignature) {
		t.Fatal("unchanged selected face model prevented reuse")
	}
	router.models[aiprovider.TaskFaceTracking] = nextModel
	bound, err = p.withNativeModels(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	nextSignature := storyModelSignature(bound.cfg.FaceModel)
	if canReuseNaturalClip(input, decisions, nextSignature) {
		t.Fatal("changed selected face model reused the old crop")
	}
	input.Reuse.Metadata["face_model_signature"] = nextSignature
	if !canReuseNaturalClip(input, decisions, nextSignature) {
		t.Fatal("fresh crop could not be reused on the following operation")
	}
	input.Reuse.Metadata = nil
	if canReuseNaturalClip(input, decisions, nextSignature) {
		t.Fatal("legacy clip without model identity reused an unverifiable crop")
	}
	if !canReuseNaturalClip(input, decisions, "") {
		t.Fatal("irrelevant face model prevented reuse of a clip without smart crop")
	}
}

func TestNativeSelectionFailureStopsEveryEngineOperationBeforeMediaIO(t *testing.T) {
	unavailable := errors.New("native configuration unavailable")
	request := story.Request{ID: "native-selection", Options: story.Options{AspectRatio: "16:9"}, Assets: []story.Asset{{ID: "source", Key: "source.mp4", Duration: 2, HasAudio: true}}}
	version := story.Version{Timeline: []story.Entry{{OutputOut: 1, Video: story.Interval{SourceID: "source", Out: 1}, Audio: &story.Interval{SourceID: "source", Out: 1}}}}
	for name, run := range map[string]func(*Processor) error{
		"process": func(p *Processor) error {
			_, err := p.Process(context.Background(), Input{Namespace: "native-selection"}, nil)
			return err
		},
		"render": func(p *Processor) error {
			_, err := p.Render(context.Background(), RenderInput{Segments: []Segment{{0, 1}}})
			return err
		},
		"analyze": func(p *Processor) error {
			_, err := p.Analyze(context.Background(), request.ID, request.Assets[0], request.Options)
			return err
		},
		"narration": func(p *Processor) error {
			asset := request.Assets[0]
			asset.Kind = "narration"
			_, err := p.Analyze(context.Background(), request.ID, asset, request.Options)
			return err
		},
		"story render": func(p *Processor) error { _, err := p.RenderStory(context.Background(), request, version); return err },
	} {
		t.Run(name, func(t *testing.T) {
			router := &nativeModelProvider{err: unavailable}
			p := New(Config{TempDir: filepath.Join(t.TempDir(), "missing")}, storyNoAccessStorage{t: t}, router)
			if err := run(p); !errors.Is(err, unavailable) || router.calls != 1 {
				t.Fatalf("native selection was bypassed: %v calls=%d", err, router.calls)
			}
		})
	}
}

func TestStoryAnalysisCacheUsesSelectedNativeModel(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	asset := storySource(t, p, dir, "native-cache", "green", 0)
	firstModel, secondModel := filepath.Join(dir, "first.bin"), filepath.Join(dir, "second.bin")
	for _, path := range []string{firstModel, secondModel} {
		if err := os.WriteFile(path, []byte(path), 0600); err != nil {
			t.Fatal(err)
		}
	}
	router := &nativeModelProvider{models: map[aiprovider.Task]string{aiprovider.TaskStoryTranscription: firstModel}}
	p.ai = router
	first, err := p.Analyze(context.Background(), "native-cache", asset, story.DefaultOptions())
	if err != nil {
		t.Fatal(err)
	}
	ffmpeg := p.cfg.FFmpegPath
	p.cfg.FFmpegPath = filepath.Join(dir, "must-not-run-on-cache-hit")
	cached, err := p.Analyze(context.Background(), "native-cache", first, story.DefaultOptions())
	if err != nil || cached.AnalysisVersion != first.AnalysisVersion {
		t.Fatalf("selected model did not reuse analysis: %v", err)
	}
	p.cfg.FFmpegPath = ffmpeg
	router.models[aiprovider.TaskStoryTranscription] = secondModel
	updated, err := p.Analyze(context.Background(), "native-cache", first, story.DefaultOptions())
	if err != nil || updated.AnalysisVersion == first.AnalysisVersion || updated.ProxyKey != first.ProxyKey || router.calls != 3 || p.cfg.StoryWhisperModel == secondModel {
		t.Fatalf("native model change reused stale analysis or mutated shared configuration: %#v %v", updated, err)
	}
}

func TestStudioOutputIdentityReusesUnchangedResolvedFraming(t *testing.T) {
	p, storage, dir := storyTestProcessor(t)
	asset := storySource(t, p, dir, "face-cache", "blue", 440)
	firstModel, secondModel := filepath.Join(dir, "face-first"), filepath.Join(dir, "face-second")
	for _, path := range []string{firstModel, secondModel} {
		if err := os.WriteFile(path, []byte(path), 0600); err != nil {
			t.Fatal(err)
		}
	}
	router := &nativeModelProvider{models: map[aiprovider.Task]string{aiprovider.TaskFaceTracking: firstModel}}
	p.ai = router
	request := story.Request{ID: "face-cache", Options: story.Options{AspectRatio: "16:9", CaptionMode: "off"}, Assets: []story.Asset{asset}}
	interval := story.Interval{SourceID: asset.ID, In: 0, Out: asset.Duration}
	version := story.Version{Number: 1, Timeline: []story.Entry{{BlockID: "block", OutputOut: asset.Duration, Video: interval, Audio: &interval, Crop: "fit"}}}
	first, err := renderStoryForTest(t, p, context.Background(), request, version)
	if err != nil {
		t.Fatal(err)
	}
	router.models[aiprovider.TaskFaceTracking] = secondModel
	second, err := renderStoryForTest(t, p, context.Background(), request, version)
	// Full-frame fitting has identical geometry regardless of the detector model.
	// Studio's identity follows the actual composition instead of an unused model.
	if err != nil || first.Key != second.Key || first.ThumbnailKey != second.ThumbnailKey || first.StudioArtifactID == "" || storage.segments != 0 {
		t.Fatalf("unchanged composition was not reused: first=%s second=%s segments=%d error=%v", first.Key, second.Key, storage.segments, err)
	}
	repeated, err := renderStoryForTest(t, p, context.Background(), request, version)
	if err != nil || repeated.Key != second.Key || storage.segments != 0 {
		t.Fatalf("unchanged face model invalidated output cache: %#v %v", repeated, err)
	}
}
