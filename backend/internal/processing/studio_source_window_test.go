package processing

import (
	"context"
	"math"
	"os/exec"
	"path/filepath"
	"testing"

	"sneepcut/backend-go/internal/media"
)

func TestStudioWindowBoundsPreserveOriginalTimeline(t *testing.T) {
	for _, s := range []Segment{{0, 1}, {4, 5}, {9, 10}} {
		start, duration, offset := studioWindowBounds(s, 10)
		if math.Abs(start+offset-s.Start) > 1e-8 || start < 0 || start+duration > 10 || offset+s.End-s.Start > duration {
			t.Fatalf("window %v: %f %f %f", s, start, duration, offset)
		}
	}
}

func TestStudioSourceWindowKeepsResolutionAndLocalTiming(t *testing.T) {
	ffmpeg, err := exec.LookPath("ffmpeg")
	if err != nil {
		t.Fatal("FFmpeg is required for the source-window regression")
	}
	ffprobe, err := exec.LookPath("ffprobe")
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	storage, err := media.NewLocalStorage(filepath.Join(dir, "media"))
	if err != nil {
		t.Fatal(err)
	}
	p := New(Config{FFmpegPath: ffmpeg, FFprobePath: ffprobe, MediaOrigin: "https://app.example.invalid", MediaSigningSecret: "synthetic-fixture-secret"}, storage, nil)
	source := filepath.Join(dir, "source.mp4")
	ctx := context.Background()
	if err = p.ffmpeg(ctx, dir, "-f", "lavfi", "-i", "testsrc2=size=3840x2160:rate=5:duration=2", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:v", "libx264", "-preset", "ultrafast", "-threads", "2", "-c:a", "aac", "-shortest", source); err != nil {
		t.Fatal(err)
	}
	plan := studioPlan{}
	video, audio, offset, err := p.studioSourceWindow(ctx, dir, source, "sources/original.mp4", RenderInput{SourceKey: "sources/original.mp4", Namespace: "job/attempts/token/clip-1"}, &plan, probeInfo{Width: 3840, Height: 2160, Duration: 2, Audio: true}, Segment{.5, 1.5}, 0)
	if err != nil {
		t.Fatal(err)
	}
	if video == "" || audio != video || offset != .25 || len(plan.Assets) != 1 {
		t.Fatalf("window assets %+v %s %s %f", plan.Assets, video, audio, offset)
	}
	path, err := storage.Path(plan.Assets[0].Key)
	if err != nil {
		t.Fatal(err)
	}
	info, err := p.probe(ctx, path)
	if err != nil || info.Width != 3840 || info.Height != 2160 || !info.Audio || math.Abs(info.Duration-1.5) > .21 {
		t.Fatalf("4K window %+v %v", info, err)
	}
}
