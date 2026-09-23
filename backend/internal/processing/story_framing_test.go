package processing

import (
	"context"
	"math"
	"path/filepath"
	"testing"

	"sneepcut/backend-go/internal/story"
)

func TestStoryLowResolutionFramingFillsCanvasWithoutDistortion(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	ctx := context.Background()
	source := filepath.Join(dir, "low-resolution.mp4")
	if err := p.ffmpeg(ctx, dir, "-f", "lavfi", "-i", "color=c=red:s=320x180:r=30,drawbox=x=140:y=70:w=40:h=40:color=lime:t=fill", "-t", "0.5", "-c:v", "libx264", "-pix_fmt", "yuv420p", source); err != nil {
		t.Fatal(err)
	}
	key := "sources/framing/low-resolution.mp4"
	if err := p.storage.Save(ctx, source, key, "video/mp4"); err != nil {
		t.Fatal(err)
	}
	asset, err := p.Inspect(ctx, key)
	if err != nil {
		t.Fatal(err)
	}
	asset.ID = "low-resolution"
	p.cfg.FaceModel = filepath.Join(dir, "unavailable-face-model")
	for _, mode := range []string{"fit", "track"} {
		t.Run(mode, func(t *testing.T) {
			request := story.Request{ID: "framing-" + mode, Options: story.Options{AspectRatio: "9:16"}, Assets: []story.Asset{asset}}
			version := story.Version{Number: 1, Timeline: []story.Entry{{BlockID: "one", OutputOut: .4, Video: story.Interval{SourceID: asset.ID, Out: .4}, Crop: mode}}}
			output, err := p.RenderStory(ctx, request, version)
			if err != nil {
				t.Fatal(err)
			}
			file, err := p.storyMaterialize(ctx, dir, output.Key)
			if err != nil {
				t.Fatal(err)
			}
			// An uncertain track must preserve the full image exactly like fit.
			pixels, err := run(ctx, dir, p.cfg.FFmpegPath, "-v", "error", "-i", file, "-frames:v", "1", "-vf", "scale=108:192:flags=neighbor", "-f", "rawvideo", "-pix_fmt", "rgb24", "-")
			if err != nil {
				t.Fatal(err)
			}
			colored, square := storyFramingPixelBounds(t, pixels, 108, 192)
			if colored.width() < 106 || colored.height() < 59 || colored.height() > 63 || colored.y1 < 64 || colored.y1 > 67 {
				t.Fatalf("small source did not fill width with preserved 16:9 proportions: %#v", colored)
			}
			if math.Abs(float64(square.width()-square.height())) > 2 || square.width() < 12 || square.width() > 15 {
				t.Fatalf("square subject stretched or not scaled with source: %#v", square)
			}
		})
	}
	// Exercise the exact framing filter used after a successful tracker crop.
	// Its 100x180 input approximates the target aspect after even-pixel rounding.
	pixels, err := run(ctx, dir, p.cfg.FFmpegPath, "-v", "error", "-i", source, "-frames:v", "1", "-vf", storyFramingFilter(1080, 1920, "crop=100:180:110:0")+",scale=108:192:flags=neighbor", "-f", "rawvideo", "-pix_fmt", "rgb24", "-")
	if err != nil {
		t.Fatal(err)
	}
	colored, square := storyFramingPixelBounds(t, pixels, 108, 192)
	if colored.x1 != 0 || colored.y1 != 0 || colored.width() != 108 || colored.height() != 192 {
		t.Fatalf("verified tracked crop did not fill output canvas: %#v", colored)
	}
	if math.Abs(float64(square.width()-square.height())) > 2 || square.width() < 41 || square.width() > 45 {
		t.Fatalf("tracked subject distorted or remained source-sized: %#v", square)
	}
}

type storyPixelBounds struct{ x1, y1, x2, y2 int }

func (b storyPixelBounds) width() int  { return b.x2 - b.x1 + 1 }
func (b storyPixelBounds) height() int { return b.y2 - b.y1 + 1 }

func storyFramingPixelBounds(t *testing.T, pixels []byte, w, h int) (storyPixelBounds, storyPixelBounds) {
	t.Helper()
	if len(pixels) != w*h*3 {
		t.Fatalf("wrong decoded frame size: got %d want %d", len(pixels), w*h*3)
	}
	colored, square := storyPixelBounds{w, h, -1, -1}, storyPixelBounds{w, h, -1, -1}
	include := func(b *storyPixelBounds, x, y int) {
		b.x1, b.x2 = min(b.x1, x), max(b.x2, x)
		b.y1, b.y2 = min(b.y1, y), max(b.y2, y)
	}
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			i := (y*w + x) * 3
			r, g, b := int(pixels[i]), int(pixels[i+1]), int(pixels[i+2])
			if r > 120 || g > 120 {
				include(&colored, x, y)
			}
			if g > r+60 && g > b+60 {
				include(&square, x, y)
			}
		}
	}
	return colored, square
}
