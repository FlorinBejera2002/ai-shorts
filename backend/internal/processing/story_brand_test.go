package processing

import (
	"context"
	"path/filepath"
	"sneepcut/backend-go/internal/story"
	"testing"
)

func TestStoryBrandingRendersOwnedLogoAndColoredCaptions(t *testing.T) {
	p, storage, dir := storyTestProcessor(t)
	ctx := context.Background()
	source := storySource(t, p, dir, "brand-source", "black", 440)
	logo := filepath.Join(dir, "logo.png")
	if err := p.ffmpeg(ctx, dir, "-f", "lavfi", "-i", "color=c=red:s=100x100", "-frames:v", "1", logo); err != nil {
		t.Fatal(err)
	}
	key := "brand/owner/logo.png"
	if err := storage.Save(ctx, logo, key, "image/png"); err != nil {
		t.Fatal(err)
	}
	opacity := 1.0
	req := story.Request{ID: "brand-story", UserID: "owner", LogoKey: key, Options: story.Options{AspectRatio: "16:9", Captions: true, SubtitleColor: "#00FF00", SubtitleSize: 70, SubtitlePosition: "top", LogoPosition: "bottom-right", LogoOpacity: &opacity}, Assets: []story.Asset{source}}
	version := story.Version{Number: 1, Timeline: []story.Entry{{OutputIn: 0, OutputOut: 1, Video: story.Interval{SourceID: source.ID, In: 0, Out: 1}, Audio: &story.Interval{SourceID: source.ID, In: 0, Out: 1}, Words: []story.Word{{Text: "BRAND", Start: .1, End: .9}}}}}
	output, err := p.RenderStory(ctx, req, version)
	if err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(dir, "result.mp4")
	if err = p.materialize(ctx, output.Key, file); err != nil {
		t.Fatal(err)
	}
	pixels, err := run(ctx, dir, p.cfg.FFmpegPath, "-v", "error", "-ss", "0.4", "-i", file, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-")
	if err != nil {
		t.Fatal(err)
	}
	info, err := p.probe(ctx, file)
	if err != nil {
		t.Fatal(err)
	}
	red, green := 0, 0
	for i := 0; i+2 < len(pixels); i += 3 {
		x, y := (i/3)%info.Width, (i/3)/info.Width
		r, g, b := int(pixels[i]), int(pixels[i+1]), int(pixels[i+2])
		if x > info.Width/2 && y > info.Height/2 && r > g+80 && r > b+80 {
			red++
		}
		if y < info.Height/2 && g > r+80 && g > b+80 {
			green++
		}
	}
	if red < 1000 || green < 100 {
		t.Fatalf("rendered branding absent/wrong placement: red=%d green=%d", red, green)
	}
	req.Options.SubtitleColor = "#FFFFFF"
	next, err := p.RenderStory(ctx, req, version)
	if err != nil || next.Key == output.Key || storage.segments != 1 {
		t.Fatalf("branding cache incorrect: %v segments=%d", err, storage.segments)
	}
	req.UserID = "other"
	if _, err = validateStoryRender(req, version); err == nil {
		t.Fatal("foreign logo accepted")
	}
}
