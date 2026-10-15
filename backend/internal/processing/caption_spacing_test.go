package processing

import (
	"context"
	"path/filepath"
	"testing"

	"sneepcut/backend-go/internal/captions"
)

func TestInterBlackSpacingActuallyRenders(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	ctx := context.Background()
	s := captions.Default()
	s.Weight, s.Outline, s.Size, s.MaxWidth = 900, 0, .1, .96
	words := [][]Word{{{Text: "Știință", Start: .1, End: .6}, {Text: "română", Start: .6, End: 1.2}}}
	widths := []int{}
	for _, extra := range []bool{false, true} {
		if extra {
			s.LetterSpacing, s.WordSpacing = .12, .4
		}
		filter, err := p.captionFilter(ctx, dir, "caption-spacing", s, words, 640, 360)
		if err != nil {
			t.Fatal(err)
		}
		file := filepath.Join(dir, "spacing.mp4")
		if err = p.ffmpeg(ctx, dir, "-f", "lavfi", "-i", "color=black:s=640x360:r=30:d=1.3", "-vf", filter, "-c:v", "libx264", "-pix_fmt", "yuv420p", file); err != nil {
			t.Fatal(err)
		}
		pixels, err := run(ctx, dir, p.cfg.FFmpegPath, "-v", "error", "-ss", "0.4", "-i", file, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-")
		if err != nil {
			t.Fatal(err)
		}
		left, right := 640, 0
		for i := 0; i+2 < len(pixels); i += 3 {
			if pixels[i] > 160 && pixels[i+1] > 160 && pixels[i+2] > 160 {
				x := i / 3 % 640
				left, right = min(left, x), max(right, x)
			}
		}
		if left >= right {
			t.Fatal("Inter Black caption is missing from export")
		}
		widths = append(widths, right-left)
	}
	if widths[1] <= widths[0]+20 {
		t.Fatalf("spacing sliders did not change rendered glyph positions: %v", widths)
	}
}
