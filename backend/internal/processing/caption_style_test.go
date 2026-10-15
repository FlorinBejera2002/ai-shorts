package processing

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"sneepcut/backend-go/internal/captions"
	"strconv"
	"strings"
	"testing"
)

func TestCaptionPresetsActuallyRenderRomanianAndPrivateMultiwordFont(t *testing.T) {
	p, storage, dir := storyTestProcessor(t)
	ctx := context.Background()
	data, err := captions.FontBytes("builtin:open-sans", 700)
	if err != nil {
		t.Fatal(err)
	}
	id := "ccaa0000-0000-4000-8000-000000000001"
	key, err := captions.PrivateKey("caption-owner", id)
	if err != nil {
		t.Fatal(err)
	}
	fontFile := filepath.Join(dir, "custom-font.ttf")
	if err = os.WriteFile(fontFile, data, 0600); err != nil {
		t.Fatal(err)
	}
	if err = storage.Save(ctx, fontFile, key, "font/ttf"); err != nil {
		t.Fatal(err)
	}
	groups := [][]Word{{{Text: "ă â î ș ț", Start: .1, End: .55}, {Text: "Ă Â Î Ș Ț", Start: .65, End: 1.15}}}
	for _, ratio := range []struct {
		name string
		w, h int
	}{{"portrait", 180, 320}, {"square", 240, 240}, {"wide", 320, 180}} {
		for _, preset := range captions.Presets {
			t.Run(ratio.name+"/"+preset, func(t *testing.T) {
				s := captions.Default()
				s.FontID = id
				s.Preset = preset
				s.Size = .09
				s.Position = captions.Position{X: .5, Y: .3, Anchor: "center"}
				raw, _ := json.Marshal(s)
				if err = json.Unmarshal(raw, &s); err != nil {
					t.Fatal(err)
				}
				work := filepath.Join(dir, ratio.name+"-"+preset)
				if err = os.MkdirAll(work, 0700); err != nil {
					t.Fatal(err)
				}
				filter, e := p.captionFilter(ctx, work, "caption-owner", s, groups, ratio.w, ratio.h)
				if e != nil {
					t.Fatal(e)
				}
				output := filepath.Join(work, "export.mp4")
				if e = p.ffmpeg(ctx, work, "-f", "lavfi", "-i", "color=black:s="+strings.Join([]string{strconv.Itoa(ratio.w), strconv.Itoa(ratio.h)}, "x")+":r=30:d=1.3", "-vf", filter, "-c:v", "libx264", "-pix_fmt", "yuv420p", output); e != nil {
					t.Fatal(e)
				}
				pixels, e := run(ctx, work, p.cfg.FFmpegPath, "-v", "error", "-ss", "0.35", "-i", output, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-")
				if e != nil {
					t.Fatal(e)
				}
				count, minY, maxY := 0, ratio.h, 0
				for i := 0; i+2 < len(pixels); i += 3 {
					if int(pixels[i])+int(pixels[i+1])+int(pixels[i+2]) > 180 {
						y := (i / 3) / ratio.w
						count++
						minY = min(minY, y)
						maxY = max(maxY, y)
					}
				}
				if count < 30 || minY < 0 || maxY > ratio.h/2 {
					t.Fatalf("caption absent or misplaced pixels=%d y=%d..%d", count, minY, maxY)
				}
				if evidence := os.Getenv("SNEEPCUT_CAPTION_EVIDENCE_DIR"); evidence != "" && ratio.name == "wide" {
					if e = os.MkdirAll(evidence, 0700); e != nil {
						t.Fatal(e)
					}
					if e = copyFile(output, filepath.Join(evidence, preset+".mp4")); e != nil {
						t.Fatal(e)
					}
				}
			})
		}
	}
	s := captions.Default()
	s.FontID = id
	if _, err = p.captionFilter(ctx, dir, "other-owner", s, groups, 320, 180); err == nil {
		t.Fatal("foreign font rendered")
	}
}

func TestCaptionPhraseFallbackRetainsOnlyWholeRealSegments(t *testing.T) {
	phrases := []TranscriptSegment{{Text: "first phrase", Start: 1, End: 2}, {Text: "partially cut", Start: 2.5, End: 4}}
	got := RemapCaptionPhrases(phrases, []Segment{{Start: .5, End: 3}}, "cut", 0)
	if len(got) != 1 || got[0].Text != "first phrase" || got[0].Start != .5 || got[0].End != 1.5 || len(got[0].Words) != 0 {
		t.Fatalf("invented/partial fallback %#v", got)
	}
}

func TestTimedCaptionEffectsAndLongTokensInDecodedFrames(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	ctx := context.Background()
	groups := [][]Word{{{Text: "Salut", Start: .2, End: .4}, {Text: "România", Start: .8, End: 1.0}}}
	pixelsAt := func(file string, at string) []byte {
		t.Helper()
		pixels, err := run(ctx, dir, p.cfg.FFmpegPath, "-v", "error", "-ss", at, "-i", file, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-")
		if err != nil {
			t.Fatal(err)
		}
		return pixels
	}
	count := func(pixels []byte, yellow bool) int {
		n := 0
		for i := 0; i+2 < len(pixels); i += 3 {
			if yellow {
				if pixels[i] > 150 && pixels[i+1] > 120 && pixels[i+2] < 130 {
					n++
				}
			} else if int(pixels[i])+int(pixels[i+1])+int(pixels[i+2]) > 180 {
				n++
			}
		}
		return n
	}
	for _, preset := range []string{"word-by-word", "active-background", "karaoke"} {
		t.Run(preset, func(t *testing.T) {
			s := captions.Default()
			s.Preset = preset
			s.Size = .12
			work := filepath.Join(dir, preset)
			if err := os.MkdirAll(work, 0700); err != nil {
				t.Fatal(err)
			}
			filter, err := p.captionFilter(ctx, work, "owner", s, groups, 320, 180)
			if err != nil {
				t.Fatal(err)
			}
			output := filepath.Join(work, "timed.mp4")
			if err = p.ffmpeg(ctx, work, "-f", "lavfi", "-i", "color=black:s=320x180:r=30:d=1.2", "-vf", filter, "-c:v", "libx264", "-pix_fmt", "yuv420p", output); err != nil {
				t.Fatal(err)
			}
			if count(pixelsAt(output, "0.1"), false) != 0 {
				t.Fatal("caption shown before aligned speech")
			}
			switch preset {
			case "word-by-word":
				if count(pixelsAt(output, "0.3"), false) < 50 || count(pixelsAt(output, "0.6"), false) != 0 || count(pixelsAt(output, "0.9"), false) < 50 {
					t.Fatal("word display drifted across actual speech gap")
				}
			case "active-background":
				if count(pixelsAt(output, "0.3"), true) < 50 || count(pixelsAt(output, "0.6"), true) != 0 || count(pixelsAt(output, "0.9"), true) < 50 {
					t.Fatal("active background drifted across actual speech gap")
				}
			case "karaoke":
				early, filled, next := count(pixelsAt(output, "0.23"), true), count(pixelsAt(output, "0.43"), true), count(pixelsAt(output, "0.93"), true)
				if early >= filled || filled >= next {
					t.Fatalf("karaoke fill did not follow aligned word progress: %d %d %d", early, filled, next)
				}
			}
		})
	}
	s := captions.Default()
	s.Preset = "word-by-word"
	s.Size = .16
	s.Position = captions.Position{X: 0, Y: 0, Anchor: "center"}
	filter, err := p.captionFilter(ctx, dir, "owner", s, [][]Word{{{Text: strings.Repeat("Romanian", 15), Start: .1, End: .8}}}, 180, 320)
	if err != nil {
		t.Fatal(err)
	}
	output := filepath.Join(dir, "long.mp4")
	if err = p.ffmpeg(ctx, dir, "-f", "lavfi", "-i", "color=black:s=180x320:r=30:d=1", "-vf", filter, "-c:v", "libx264", "-pix_fmt", "yuv420p", output); err != nil {
		t.Fatal(err)
	}
	pixels := pixelsAt(output, "0.4")
	minX, maxX, minY, maxY := 180, 0, 320, 0
	for i := 0; i+2 < len(pixels); i += 3 {
		if int(pixels[i])+int(pixels[i+1])+int(pixels[i+2]) > 100 {
			x, y := (i/3)%180, (i/3)/180
			minX = min(minX, x)
			maxX = max(maxX, x)
			minY = min(minY, y)
			maxY = max(maxY, y)
		}
	}
	if minX < 1 || maxX > 178 || minY < 1 || maxY > 318 || maxX <= minX {
		t.Fatalf("long token clipped or absent: %d..%d %d..%d", minX, maxX, minY, maxY)
	}
}

func TestCaptionSilenceDoesNotBecomeMissingAlignmentFailure(t *testing.T) {
	transcript := Transcript{Text: "Speech elsewhere", Words: []Word{{Text: "elsewhere", Start: 3, End: 4}}, Segments: []TranscriptSegment{{Text: "Speech elsewhere", Start: 3, End: 4}}}
	if captionTimingUnavailable(transcript, []Segment{{0, 2}}) {
		t.Fatal("silent selected cut failed captions")
	}
	if !captionTimingUnavailable(Transcript{Text: "Unaligned speech"}, []Segment{{0, 2}}) {
		t.Fatal("unknown text timing silently accepted")
	}
	if !captionTimingUnavailable(transcript, []Segment{{3.5, 4}}) {
		t.Fatal("partially cut phrase silently treated as aligned")
	}
}

func TestWatermarkSizeMarginAndRepeatedOrdinaryExport(t *testing.T) {
	p, storage, dir := storyTestProcessor(t)
	ctx := context.Background()
	file := filepath.Join(dir, "logo.png")
	if err := p.ffmpeg(ctx, dir, "-f", "lavfi", "-i", "color=red:s=20x10", "-frames:v", "1", file); err != nil {
		t.Fatal(err)
	}
	key := "brand/logo-owner/fixture.png"
	if err := storage.Save(ctx, file, key, "image/png"); err != nil {
		t.Fatal(err)
	}
	brand := map[string]any{"apply_brand": true, "logo_key": key, "user_id": "logo-owner", "watermark_enabled": true, "watermark_size": .3, "watermark_margin": .1, "watermark_position": "bottom-right", "watermark_opacity": 1., "hide_platform_badge": true}
	p.cfg.MediaSigningSecret, p.cfg.MediaOrigin = strings.Repeat("m", 32), "http://localhost:3000"
	for i := 0; i < 2; i++ {
		plan := studioPlan{Width: 320, Height: 180, Duration: 1}
		if err := p.studioLogo(ctx, dir, &plan, key, brand); err != nil {
			t.Fatal("repeat logo materialization failed", err)
		}
		if len(plan.Overlays) != 1 || len(plan.Assets) != 1 {
			t.Fatal("logo did not become an independent Studio layer", plan)
		}
		logo := plan.Overlays[0]
		if logo.X != 206 || logo.Y != 114 || logo.Width != 96 || logo.Height != 48 || logo.Opacity != 1 || logo.AssetID != plan.Assets[0].ID {
			t.Fatalf("watermark size/margin differs from preview: %+v", logo)
		}
	}
	if err := p.studioLogo(ctx, dir, &studioPlan{}, "brand/other-owner/fixture.png", brand); err == nil {
		t.Fatal("foreign logo accepted")
	}
}
