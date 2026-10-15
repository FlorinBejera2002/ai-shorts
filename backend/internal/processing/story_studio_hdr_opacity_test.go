package processing

import (
	"context"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"testing"

	"sneepcut/backend-go/internal/story"
)

// This exercises the actual Studio producer, including browser graphics capture
// and HDR composition, so it covers the same export boundary as the main editor.
func TestStoryStudioHDRLogoOpacityUsesLinearLight(t *testing.T) {
	p, storage, dir := storyTestProcessor(t)
	ctx := context.Background()
	asset := storyHDRFixture(t, p, dir)
	source, err := p.storyMaterialize(ctx, dir, asset.Key)
	if err != nil {
		t.Fatal(err)
	}
	sourceNits := storySampleNits(t, p, dir, source, "crop=32:32:8:30")
	retainStoryHDRTestArtifact(t, source, "source-hdr.mov")
	if sourceNits < 700 || sourceNits > 1300 {
		t.Fatalf("invalid HDR fixture: %.1f nits", sourceNits)
	}

	logo := filepath.Join(dir, "opacity-white-logo.png")
	if err := p.ffmpeg(ctx, dir, "-f", "lavfi", "-i", "color=white:s=100x100", "-frames:v", "1", logo); err != nil {
		t.Fatal(err)
	}
	logoKey := "brand/" + studioMediaTestOwner + "/opacity-logo.png"
	if err := storage.Save(ctx, logo, logoKey, "image/png"); err != nil {
		t.Fatal(err)
	}
	version := story.Version{Number: 1, Timeline: []story.Entry{{
		OutputOut: .4,
		Video:     story.Interval{SourceID: asset.ID, Out: .4},
	}}}
	artifacts := make(map[string]bool)
	for _, opacity := range []float64{0, .5, 1} {
		t.Run(fmt.Sprintf("opacity-%.1f", opacity), func(t *testing.T) {
			request := story.Request{
				ID: "studio-hdr-opacity", UserID: studioMediaTestOwner,
				LogoKey: logoKey, Assets: []story.Asset{asset},
				Options: story.Options{AspectRatio: "16:9", DynamicRange: "hdr", LogoPosition: "bottom-left", LogoOpacity: &opacity},
			}
			output, err := renderStoryForTest(t, p, ctx, request, version)
			if err != nil {
				t.Fatal(err)
			}
			if output.StudioArtifactID == "" || artifacts[output.StudioArtifactID] || storage.segments != 0 {
				t.Fatalf("opacity must use a distinct Studio artifact without legacy segment rendering: artifact=%q segments=%d", output.StudioArtifactID, storage.segments)
			}
			artifacts[output.StudioArtifactID] = true
			file := filepath.Join(dir, fmt.Sprintf("studio-opacity-%g.mp4", opacity))
			if err := p.materialize(ctx, output.Key, file); err != nil {
				t.Fatal(err)
			}
			retainStoryHDRTestArtifact(t, file, fmt.Sprintf("studio-opacity-%g.mp4", opacity))
			info, err := p.probeStory(ctx, file)
			if err != nil || info.ColorTransfer != "smpte2084" {
				t.Fatalf("Studio opacity output is not PQ HDR: %+v %v", info, err)
			}

			// This point is well inside the bottom-left square logo and the
			// source's bright half. Testing against ~1000 nits distinguishes
			// linear mixing from averaging nonlinear PQ or SDR code values.
			nits := storySampleNits(t, p, dir, file, "crop=32:32:80:ih-100")
			expected := sourceNits*(1-opacity) + 203*opacity
			if math.Abs(nits-expected) > expected*.05 {
				t.Fatalf("Studio logo alpha must blend linear luminance: opacity=%.1f got %.1f nits; expected %.1f", opacity, nits, expected)
			}
			outside := storySampleNits(t, p, dir, file, "crop=32:32:40:300")
			if math.Abs(outside-sourceNits) > sourceNits*.05 {
				t.Fatalf("Studio logo changed uncovered HDR highlights: got %.1f nits; expected %.1f", outside, sourceNits)
			}
			t.Logf("Studio logo opacity=%.1f measured=%.1f expected=%.1f outside=%.1f nits", opacity, nits, expected, outside)
		})
	}
}

// Opt-in retention keeps failed native exports available after Go removes its
// temporary fixture directories. It is only enabled by the isolated test lane.
func retainStoryHDRTestArtifact(t *testing.T, file, name string) {
	t.Helper()
	dir := os.Getenv("SNEEPCUT_HDR_TEST_OUTPUT")
	if dir == "" {
		return
	}
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, name), data, 0600); err != nil {
		t.Fatal(err)
	}
}
