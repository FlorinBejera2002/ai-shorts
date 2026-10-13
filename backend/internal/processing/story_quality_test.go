package processing

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"testing"
)

// Compare actual samples with the former independent FFmpeg passes. Combining
// commands must not change the measurements used to select source footage.
func TestStoryQualitySharedDecodePreservesSamples(t *testing.T) {
	for _, tc := range []struct {
		name     string
		duration float64
		audio    bool
	}{
		{"stereo", 2.4, true},
		{"silent-video", 2.4, false},
		{"subsecond", .2, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			p, _, dir := storyTestProcessor(t)
			ctx := context.Background()
			source := filepath.Join(dir, "source.mp4")
			args := []string{"-f", "lavfi", "-i", "testsrc2=size=96x64:rate=30"}
			if tc.audio {
				args = append(args, "-f", "lavfi", "-i", "aevalsrc=0.2*sin(2*PI*440*t)|0.3*sin(2*PI*660*t):s=48000")
			}
			args = append(args, "-t", seconds(tc.duration), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", source)
			if err := p.ffmpeg(ctx, dir, args...); err != nil {
				t.Fatal(err)
			}
			info, err := p.probe(ctx, source)
			if err != nil {
				t.Fatal(err)
			}
			audio, visual, err := p.storyQuality(ctx, dir, source, info)
			if err != nil || !finite(audio) || !finite(visual) || visual <= 0 || (tc.audio && audio <= 0) || (!tc.audio && audio != 0) {
				t.Fatalf("invalid quality measurements: audio=%v visual=%v error=%v", audio, visual, err)
			}
			oldGray := filepath.Join(dir, "previous.gray")
			if err := p.ffmpeg(ctx, dir, "-i", source, "-an", "-vf", "fps=1:round=up,scale=48:28", "-pix_fmt", "gray", "-f", "rawvideo", oldGray); err != nil {
				t.Fatal(err)
			}
			assertQualitySamplesEqual(t, oldGray, filepath.Join(dir, "quality.gray"))
			if tc.audio {
				oldPCM := filepath.Join(dir, "previous.pcm")
				if err := p.ffmpeg(ctx, dir, "-i", source, "-vn", "-ac", "1", "-ar", "8000", "-c:a", "pcm_s16le", "-f", "s16le", oldPCM); err != nil {
					t.Fatal(err)
				}
				assertQualitySamplesEqual(t, oldPCM, filepath.Join(dir, "quality.pcm"))
			}
		})
	}
}

func assertQualitySamplesEqual(t *testing.T, previous, current string) {
	t.Helper()
	want, err := os.ReadFile(previous)
	if err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(current)
	if err != nil {
		t.Fatal(err)
	}
	if len(want) == 0 || !bytes.Equal(want, got) {
		t.Fatalf("quality samples changed for %s: previous=%d current=%d bytes", filepath.Base(current), len(want), len(got))
	}
}
