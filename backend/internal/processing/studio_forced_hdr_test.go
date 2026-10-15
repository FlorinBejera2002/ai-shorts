package processing

import (
	"context"
	"encoding/json"
	"math"
	"path/filepath"
	"testing"

	"sneepcut/backend-go/internal/story"
)

// Both modes go through the native Studio producer. Checking decoded pixels as
// well as codec tags prevents a mislabeled SDR or HLG stream passing as a conversion.
func TestStudioForcedDynamicRangeConvertsPixels(t *testing.T) {
	for _, mode := range []string{"sdr-to-pq", "hlg-to-sdr"} {
		t.Run(mode, func(t *testing.T) {
			p, storage, dir := storyTestProcessor(t)
			ctx := context.Background()
			source := filepath.Join(dir, mode+"-source.mp4")
			dynamicRange := "hdr"
			args := []string{"-f", "lavfi", "-i", "color=c=white:s=160x90:r=30,drawbox=x=80:y=0:w=80:h=90:color=0x808080:t=fill", "-t", "0.4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv"}
			if mode == "hlg-to-sdr" {
				dynamicRange = "sdr"
				args = []string{"-f", "lavfi", "-i", "nullsrc=s=160x90:r=30,format=yuv420p10le,geq=lum=512:cb='if(lt(X,W/2),256,768)':cr='if(lt(X,W/2),768,256)'", "-t", "0.4", "-c:v", "libx265", "-preset", "ultrafast", "-pix_fmt", "yuv420p10le", "-color_primaries", "bt2020", "-color_trc", "arib-std-b67", "-colorspace", "bt2020nc", "-color_range", "tv", "-x265-params", "pools=2:frame-threads=2:log-level=error:colorprim=bt2020:transfer=arib-std-b67:colormatrix=bt2020nc"}
			}
			if err := p.ffmpeg(ctx, dir, append(args, source)...); err != nil {
				t.Fatal(err)
			}
			retainStoryHDRTestArtifact(t, source, mode+"-source.mp4")
			key := "sources/test/" + mode + ".mp4"
			if err := storage.Save(ctx, source, key, "video/mp4"); err != nil {
				t.Fatal(err)
			}
			asset, err := p.Inspect(ctx, key)
			if err != nil {
				t.Fatal(err)
			}
			asset.ID = mode
			if mode == "hlg-to-sdr" {
				if asset.ColorTransfer != "arib-std-b67" {
					t.Fatalf("test input lost HLG transfer: %q", asset.ColorTransfer)
				}
				// Deliberately make the preview URL use the same original HLG
				// bytes: neither a preview rewrite nor ingest tone mapping may
				// mask missing conversion in the native force-SDR renderer.
				asset.ProxyKey = asset.Key
			}
			request := story.Request{ID: mode, Assets: []story.Asset{asset}, Options: story.Options{AspectRatio: "16:9", DynamicRange: dynamicRange}}
			version := story.Version{Number: 1, Timeline: []story.Entry{{OutputOut: .4, Video: story.Interval{SourceID: asset.ID, Out: .4}}}}
			output, err := renderStoryForTest(t, p, ctx, request, version)
			if err != nil {
				t.Fatal(err)
			}
			if output.StudioArtifactID == "" || storage.segments != 0 {
				t.Fatalf("conversion bypassed native Studio: artifact=%q segments=%d", output.StudioArtifactID, storage.segments)
			}
			file, err := p.storyMaterialize(ctx, dir, output.Key)
			if err != nil {
				t.Fatal(err)
			}
			retainStoryHDRTestArtifact(t, file, mode+"-output.mp4")
			expected := map[string]string{"codec_name": "hevc", "pix_fmt": "yuv420p10le", "color_transfer": "smpte2084", "color_primaries": "bt2020", "color_space": "bt2020nc"}
			if mode == "hlg-to-sdr" {
				expected = map[string]string{"codec_name": "h264", "pix_fmt": "yuv420p", "color_transfer": "bt709", "color_primaries": "bt709", "color_space": "bt709"}
			}
			assertStudioDynamicRangeMetadata(t, p, dir, file, expected)
			if mode == "sdr-to-pq" {
				white := storySampleNits(t, p, dir, file, "crop=16:16:iw/4:ih/2")
				gray := storySampleNits(t, p, dir, file, "crop=16:16:3*iw/4:ih/2")
				// SDR reference white is 203 nits. sRGB code 128 is ~21.6%
				// linear light. Relabeling these code values as PQ fails both.
				if white < 170 || white > 240 || gray < 35 || gray > 55 {
					t.Fatalf("SDR pixels were not converted to PQ: white=%.2f gray=%.2f nits", white, gray)
				}
				t.Logf("SDR→PQ white=%.2f gray=%.2f nits", white, gray)
				return
			}
			for _, crop := range []string{"crop=16:16:iw/4:ih/2", "crop=16:16:3*iw/4:ih/2"} {
				// The existing delivery tone map is the reference, independently
				// applied to the original HLG file rather than the rendered output.
				reference := studioSampleRGB(t, p, dir, source, storyColorFilter("arib-std-b67")+crop)
				unmapped := studioSampleRGB(t, p, dir, source, crop)
				actual := studioSampleRGB(t, p, dir, file, crop)
				if studioRGBDifference(reference, unmapped) < 40 {
					t.Fatalf("HLG fixture cannot distinguish tone mapping from retagging: reference=%v unmapped=%v", reference, unmapped)
				}
				if studioRGBDifference(actual, reference) > 12 {
					t.Fatalf("HLG pixels were not tone-mapped to SDR: actual=%v reference=%v unmapped=%v", actual, reference, unmapped)
				}
				t.Logf("HLG→SDR RGB=%v reference=%v unmapped=%v", actual, reference, unmapped)
			}
		})
	}
}

func assertStudioDynamicRangeMetadata(t *testing.T, p *Processor, dir, file string, expected map[string]string) {
	t.Helper()
	data, err := run(context.Background(), dir, p.cfg.FFprobePath, "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,pix_fmt,color_transfer,color_primaries,color_space", "-of", "json", file)
	var metadata struct{ Streams []map[string]string }
	if err != nil || json.Unmarshal(data, &metadata) != nil || len(metadata.Streams) != 1 {
		t.Fatalf("missing output metadata: %s %v", data, err)
	}
	for key, value := range expected {
		if metadata.Streams[0][key] != value {
			t.Fatalf("%s=%q; expected %q", key, metadata.Streams[0][key], value)
		}
	}
}

func studioSampleRGB(t *testing.T, p *Processor, dir, file, filter string) [3]float64 {
	t.Helper()
	pixels, err := run(context.Background(), dir, p.cfg.FFmpegPath, "-v", "error", "-ss", "0.2", "-i", file, "-frames:v", "1", "-vf", filter, "-f", "rawvideo", "-pix_fmt", "rgb24", "-")
	if err != nil || len(pixels) != 16*16*3 {
		t.Fatalf("cannot measure SDR pixels: %v (%d bytes)", err, len(pixels))
	}
	var result [3]float64
	for index, value := range pixels {
		result[index%3] += float64(value) / 256
	}
	return result
}

func studioRGBDifference(left, right [3]float64) float64 {
	return max(math.Abs(left[0]-right[0]), math.Abs(left[1]-right[1]), math.Abs(left[2]-right[2]))
}
