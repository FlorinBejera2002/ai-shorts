package processing

import (
	"context"
	"encoding/binary"
	"fmt"
	"math"
	"path/filepath"
	"testing"

	"sneepcut/backend-go/internal/story"
)

func TestStoryAdjacentNaturalIntervalsDoNotAccumulateAudioClockDrift(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	ctx := context.Background()
	file := filepath.Join(dir, "continuous-source.mp4")
	if err := p.ffmpeg(ctx, dir, "-f", "lavfi", "-i", "color=c=black:s=160x90:r=30,format=rgb24,geq=r='60*T':g=0:b=0", "-f", "lavfi", "-i", "anoisesrc=color=pink:amplitude=0.1:sample_rate=48000:seed=42", "-t", "3.2", "-c:v", "libx264", "-c:a", "aac", "-pix_fmt", "yuv420p", file); err != nil {
		t.Fatal(err)
	}
	key := "sources/clock/continuous.mp4"
	if err := p.storage.Save(ctx, file, key, "video/mp4"); err != nil {
		t.Fatal(err)
	}
	asset, err := p.Inspect(ctx, key)
	if err != nil {
		t.Fatal(err)
	}
	asset.ID = "continuous"
	request := story.Request{ID: "natural-clock", Options: story.Options{AspectRatio: "16:9", CaptionMode: "off"}, Assets: []story.Asset{asset}}
	version := story.Version{Number: 1}
	ends := []float64{.26, .58, .86, 1.24, 1.66, 1.91, 2.27, 2.65, 2.9, 3.2}
	start := 0.0
	for i, end := range ends {
		version.Timeline = append(version.Timeline, story.Entry{BlockID: fmt.Sprintf("part-%d", i), OutputIn: start, OutputOut: end, Video: story.Interval{SourceID: asset.ID, In: start, Out: end}, Audio: &story.Interval{SourceID: asset.ID, In: start, Out: end}, Crop: "fit"})
		start = end
	}
	output, err := renderStoryForTest(t, p, ctx, request, version)
	if err != nil {
		t.Fatal(err)
	}
	rendered, err := p.storyMaterialize(ctx, dir, output.Key)
	if err != nil {
		t.Fatal(err)
	}
	decode := func(path string) []float64 {
		raw, err := run(ctx, dir, p.cfg.FFmpegPath, "-v", "error", "-ss", "2.55", "-i", path, "-t", "0.5", "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", "-")
		if err != nil {
			t.Fatal(err)
		}
		samples := make([]float64, len(raw)/2)
		for i := range samples {
			samples[i] = float64(int16(binary.LittleEndian.Uint16(raw[i*2:i*2+2]))) / 32768
		}
		return samples
	}
	correlation, lag := storyFixtureCorrelation(decode(file), decode(rendered))
	t.Logf("original audio correlation %.6f, offset %.3fms after ten fractional-frame boundaries", correlation, float64(lag)/16)
	if correlation < .85 || math.Abs(float64(lag)/16) > 40 {
		t.Fatalf("natural subframe boundaries accumulated source audio drift: correlation %.4f, offset %.2fms", correlation, float64(lag)/16)
	}
	for _, at := range []string{"2.75", "2.95"} {
		pixel := func(path string) int {
			raw, err := run(ctx, dir, p.cfg.FFmpegPath, "-v", "error", "-i", path, "-ss", at, "-frames:v", "1", "-vf", "crop=100:50:0:0,scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-")
			if err != nil || len(raw) != 3 {
				t.Fatalf("frame clock evidence unavailable: %v", err)
			}
			return int(raw[0])
		}
		originalRed, renderedRed := pixel(file), pixel(rendered)
		// Source red rises by two levels per 30fps frame. Three levels allows
		// one boundary frame and codec rounding, never cumulative shot drift.
		if math.Abs(float64(originalRed-renderedRed)) > 3 {
			t.Fatalf("global video clock drift at %ss: source red %d, output red %d", at, originalRed, renderedRed)
		}
	}
}
