package processing

import (
	"context"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sneepcut/backend-go/internal/aiprovider"
	"sneepcut/backend-go/internal/story"
	"strings"
	"testing"
)

func TestStoryAssemblyOverOneHundredEntriesUsesBoundedInputsAndExactClocks(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	ctx := context.Background()
	source := filepath.Join(dir, "tiny.mp4")
	if err := p.ffmpeg(ctx, dir, "-f", "lavfi", "-i", "color=c=red:s=160x90:r=30", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "0.2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", source); err != nil {
		t.Fatal(err)
	}
	const count = 125
	var parts []string
	var timeline []story.Entry
	for i := 0; i < count; i++ {
		start, end := float64(i)*.073, float64(i+1)*.073
		parts = append(parts, source)
		timeline = append(timeline, story.Entry{BlockID: fmt.Sprint(i), OutputIn: start, OutputOut: end, Video: story.Interval{SourceID: "original", In: 0, Out: .073}})
	}
	video, audio, err := p.prepareStoryAssembly(ctx, dir, parts, timeline, false)
	if err != nil {
		t.Fatal(err)
	}
	for _, manifest := range []string{video, audio} {
		raw, err := os.ReadFile(manifest)
		if err != nil || strings.Count(string(raw), "file '") != 8 {
			t.Fatal("missing assembly batches", string(raw), err)
		}
	}
	output := filepath.Join(dir, "large-story.mp4")
	if err := p.ffmpeg(ctx, dir, "-f", "concat", "-safe", "1", "-i", video, "-f", "concat", "-safe", "1", "-i", audio, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-t", seconds(float64(count)*.073), output); err != nil {
		t.Fatal(err)
	}
	info, err := p.probe(ctx, output)
	if err != nil || math.Abs(info.Duration-float64(count)*.073) > .04 {
		t.Fatal("duration drift", info.Duration, err)
	}
	raw, err := run(ctx, dir, p.cfg.FFmpegPath, "-v", "error", "-i", output, "-vn", "-ar", "48000", "-ac", "1", "-f", "s16le", "-")
	if err != nil || math.Abs(float64(len(raw)/2)/48000-float64(count)*.073) > .04 {
		t.Fatal("audio clock drift", len(raw), err)
	}
	pixel, err := run(ctx, dir, p.cfg.FFmpegPath, "-v", "error", "-ss", "9", "-i", output, "-frames:v", "1", "-vf", "scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-")
	if err != nil || len(pixel) != 3 || pixel[0] < 180 || pixel[1] > 40 {
		t.Fatal("final source disappeared", pixel, err)
	}
	t.Logf("Rendered and decoded %d entries: %.3fs video; %.3fs decoded audio; last-frame RGB %v", count, info.Duration, float64(len(raw)/2)/48000, pixel)
}
func TestStoryRenderPreflightAcceptsLargeTimeline(t *testing.T) {
	request := story.Request{ID: "large-render", Options: story.Options{AspectRatio: "16:9"}, Assets: []story.Asset{{ID: "original", Duration: 1, Width: 160, Height: 90}}}
	version := story.Version{}
	for i := 0; i < 125; i++ {
		version.Timeline = append(version.Timeline, story.Entry{OutputIn: float64(i) / 10, OutputOut: float64(i+1) / 10, Video: story.Interval{SourceID: "original", Out: .1}, Crop: "fit"})
	}
	if _, err := validateStoryRender(request, version); err != nil {
		t.Fatal(err)
	}
}

// Actual source frames traverse seven bounded provider requests. No clip is
// silently lost when the optional provider has no confident visual finding.
func TestStorySemanticAnalysisBatchesOneHundredTwentyFiveSources(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	ctx := context.Background()
	asset := storySource(t, p, dir, "visual", "red", 0)
	asset, err := p.Analyze(ctx, "large-analysis", asset, story.DefaultOptions())
	if err != nil {
		t.Fatal(err)
	}
	var assets []story.Asset
	for i := 0; i < 125; i++ {
		copy := cloneStorySemanticAssets([]story.Asset{asset})[0]
		copy.ID = fmt.Sprintf("source-%03d", i)
		copy.Order = i
		for j := range copy.Candidates {
			copy.Candidates[j].ID = fmt.Sprintf("candidate-%03d-%d", i, j)
			copy.Candidates[j].SourceID = copy.ID
		}
		assets = append(assets, copy)
	}
	reviewer := &storySemanticMock{storyReviewMock: storyReviewMock{result: "{\"candidates\":[]}"}, model: "collection"}
	p.ai = &taskProvider{providers: map[aiprovider.Task]aiprovider.Generator{aiprovider.TaskSourceAnalysis: reviewer}}
	calls := 0
	ctx = story.WithAIBudget(ctx, func(context.Context) error { calls++; return nil })
	result, err := p.AnalyzeStorySources(ctx, assets, story.DefaultOptions())
	if err != nil || len(result) != 125 || calls != 7 || reviewer.calls != 7 {
		t.Fatal("unbounded or missing batches", len(result), calls, reviewer.calls, err)
	}
	for i, source := range result {
		if source.ID != assets[i].ID || source.SemanticAnalysisVersion == "" || len(source.Candidates) != len(assets[i].Candidates) {
			t.Fatal("source missing from analysis", i)
		}
	}
	t.Logf("All %d original source identities analyzed through %d bounded media calls", len(result), calls)
}
