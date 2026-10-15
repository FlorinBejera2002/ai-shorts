package processing

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/story"
)

func TestStoryProbeAcceptsHDRAndProResButRejectsIncompatibleDolbyVision(t *testing.T) {
	base := `{"format":{"format_name":"mov,mp4","duration":"0.4"},"streams":[{"codec_type":"video","codec_name":"hevc","width":160,"height":90,"color_transfer":"arib-std-b67"}]}`
	for _, data := range []string{base, strings.ReplaceAll(base, "arib-std-b67", "smpte2084"), strings.ReplaceAll(base, "hevc", "prores"), strings.ReplaceAll(base, `"color_transfer"`, `"side_data_list":[{"side_data_type":"DOVI configuration record","dv_profile":8,"dv_bl_signal_compatibility_id":4}],"color_transfer"`)} {
		info, err := parseStoryProbe([]byte(data))
		if err != nil || info.ColorTransfer == "" || len(info.Warnings) == 0 {
			t.Fatalf("compatible HDR rejected: %+v %v", info, err)
		}
	}
	invalid := strings.ReplaceAll(base, `"color_transfer"`, `"side_data_list":[{"side_data_type":"DOVI configuration record","dv_profile":5,"dv_bl_signal_compatibility_id":0}],"color_transfer"`)
	if _, err := parseStoryProbe([]byte(invalid)); err == nil {
		t.Fatal("accepted Dolby Vision without a compatible base layer")
	}
}

func storyHDRFixture(t *testing.T, p *Processor, dir string) story.Asset {
	t.Helper()
	ctx := context.Background()
	file := filepath.Join(dir, "hdr.mov")
	// PQ code 723 is about 1000 nits; the other half is approximately 100.
	args := []string{"-f", "lavfi", "-i", "nullsrc=s=160x90:r=30,format=yuv420p10le,geq=lum='if(lt(X,W/2),723,512)':cb=512:cr=512", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "0.4"}
	args = append(args, storyDelivery(true)...)
	args = append(args, file)
	if err := p.ffmpeg(ctx, dir, args...); err != nil {
		t.Fatal(err)
	}
	key := "sources/test/hdr.mov"
	if err := p.storage.Save(ctx, file, key, "video/quicktime"); err != nil {
		t.Fatal(err)
	}
	asset, err := p.Inspect(ctx, key)
	if err != nil {
		t.Fatal(err)
	}
	asset.ID, asset.Name = "hdr-source", "HDR source"
	return asset
}

func storySampleNits(t *testing.T, p *Processor, dir, file, crop string) float64 {
	t.Helper()
	pixels, err := run(context.Background(), dir, p.cfg.FFmpegPath, "-v", "error", "-ss", "0.2", "-i", file, "-frames:v", "1", "-vf", crop+",zscale=t=linear:npl=1,format=gbrpf32le", "-f", "rawvideo", "-pix_fmt", "gbrpf32le", "-")
	if err != nil || len(pixels) < 12 {
		t.Fatalf("cannot measure rendered luminance: %v (%d bytes)", err, len(pixels))
	}
	return float64(math.Float32frombits(binary.LittleEndian.Uint32(pixels[:4])))
}

func TestStoryHDRExportPreservesHighlightsAndCompositesSDRGraphics(t *testing.T) {
	p, storage, dir := storyTestProcessor(t)
	ctx := context.Background()
	asset := storyHDRFixture(t, p, dir)
	sourceFile, err := p.storyMaterialize(ctx, dir, asset.Key)
	if err != nil {
		t.Fatal(err)
	}
	sourceNits := storySampleNits(t, p, dir, sourceFile, "crop=32:32:8:30")
	if sourceNits < 700 || sourceNits > 1300 {
		t.Fatalf("invalid HDR fixture: %.1f nits", sourceNits)
	}
	if asset.ColorTransfer != "smpte2084" {
		file, _ := p.storyMaterialize(ctx, dir, asset.Key)
		metadata, _ := run(ctx, dir, p.cfg.FFprobePath, "-v", "error", "-show_streams", "-of", "json", file)
		t.Fatalf("HDR inspection lost transfer metadata: %s", metadata)
	}
	proxyAsset := asset
	proxy, err := p.prepareStoryProxy(ctx, dir, "hdr-project", &proxyAsset, story.DefaultOptions())
	if err != nil {
		t.Fatal(err)
	}
	probe, err := p.probeStory(ctx, proxy)
	if err != nil || probe.ColorTransfer != "" {
		t.Fatalf("analysis proxy must be tone-mapped SDR: %+v %v", probe, err)
	}
	logo := filepath.Join(dir, "white-logo.png")
	if err := p.ffmpeg(ctx, dir, "-f", "lavfi", "-i", "color=white:s=100x100", "-frames:v", "1", logo); err != nil {
		t.Fatal(err)
	}
	logoKey := "brand/" + studioMediaTestOwner + "/logo.png"
	if err := storage.Save(ctx, logo, logoKey, "image/png"); err != nil {
		t.Fatal(err)
	}
	opacity := 1.0
	request := story.Request{ID: "hdr-project", UserID: studioMediaTestOwner, LogoKey: logoKey, Assets: []story.Asset{asset}, Options: story.Options{AspectRatio: "16:9", DynamicRange: "hdr", Captions: true, SubtitleColor: "#00FF00", SubtitlePosition: "top", SubtitleSize: 60, LogoPosition: "bottom-right", LogoOpacity: &opacity}}
	version := story.Version{Number: 1, Timeline: []story.Entry{{OutputIn: 0, OutputOut: .4, Video: story.Interval{SourceID: asset.ID, In: 0, Out: .4}, Audio: &story.Interval{SourceID: asset.ID, In: 0, Out: .4}, Words: []story.Word{{Text: "HDR", Start: .05, End: .35}}}}}
	output, err := renderStoryForTest(t, p, ctx, request, version)
	if err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(dir, "actual-hdr.mp4")
	if err := p.materialize(ctx, output.Key, file); err != nil {
		t.Fatal(err)
	}
	retainStoryHDRTestArtifact(t, file, "highlight-hdr.mp4")
	data, err := run(ctx, dir, p.cfg.FFprobePath, "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,pix_fmt,color_transfer,color_primaries,color_space", "-of", "json", file)
	var metadata struct{ Streams []map[string]string }
	if err != nil || json.Unmarshal(data, &metadata) != nil || len(metadata.Streams) != 1 {
		t.Fatalf("missing output metadata: %s %v", data, err)
	}
	for key, expected := range map[string]string{"codec_name": "hevc", "pix_fmt": "yuv420p10le", "color_transfer": "smpte2084", "color_primaries": "bt2020", "color_space": "bt2020nc"} {
		if metadata.Streams[0][key] != expected {
			t.Fatalf("%s = %q; expected %q", key, metadata.Streams[0][key], expected)
		}
	}
	highlight := storySampleNits(t, p, dir, file, "crop=64:64:40:300")
	white := storySampleNits(t, p, dir, file, "crop=32:32:iw-100:ih-100")
	if highlight < 700 || highlight > 1300 {
		t.Fatalf("HDR highlight was clipped or changed: %.1f nits", highlight)
	}
	if white < 170 || white > 240 {
		t.Fatalf("SDR white graphic must be near 203 nits, got %.1f", white)
	}
	t.Logf("measured source highlights %.1f nits; SDR graphic white %.1f nits", highlight, white)
	pcm, err := run(ctx, dir, p.cfg.FFmpegPath, "-v", "error", "-ss", "0.1", "-i", file, "-t", "0.2", "-vn", "-ac", "1", "-ar", "8000", "-f", "s16le", "-")
	crossings, previous := 0, int16(0)
	for i := 0; i+1 < len(pcm); i += 2 {
		value := int16(binary.LittleEndian.Uint16(pcm[i : i+2]))
		if value > 0 && previous <= 0 {
			crossings++
		}
		previous = value
	}
	frequency := float64(crossings) * 8000 / float64(len(pcm)/2)
	if err != nil || len(pcm) < 2000 || math.Abs(frequency-440) > 15 {
		t.Fatalf("HDR export changed its source audio: %.1f Hz, %v", frequency, err)
	}
	if output.PreviewKey == "" || output.PreviewKey == output.Key {
		t.Fatal("HDR export is missing its separate browser preview")
	}
	previewFile, err := p.storyMaterialize(ctx, dir, output.PreviewKey)
	if err != nil {
		t.Fatal(err)
	}
	retainStoryHDRTestArtifact(t, previewFile, "highlight-sdr-preview.mp4")
	previewInfo, err := p.probeStory(ctx, previewFile)
	if err != nil || previewInfo.ColorTransfer != "" || math.Abs(previewInfo.Duration-output.Duration) > .08 {
		t.Fatalf("browser preview changed duration or remains HDR: %+v %v", previewInfo, err)
	}
	pixels, err := run(ctx, dir, p.cfg.FFmpegPath, "-v", "error", "-ss", "0.2", "-i", file, "-frames:v", "1", "-vf", storyColorFilter("smpte2084")+"scale=320:180", "-f", "rawvideo", "-pix_fmt", "rgb24", "-")
	green := 0
	for i := 0; i+2 < len(pixels); i += 3 {
		if int(pixels[i+1]) > int(pixels[i])+40 && int(pixels[i+1]) > int(pixels[i+2])+40 {
			green++
		}
	}
	if err != nil || green < 10 {
		t.Fatalf("colored captions disappeared in HDR composition: green=%d %v", green, err)
	}
	request.Options.DynamicRange = "sdr"
	sdr, err := renderStoryForTest(t, p, ctx, request, version)
	if err != nil || sdr.Key == output.Key || output.StudioArtifactID == "" || sdr.StudioArtifactID == "" || sdr.StudioArtifactID == output.StudioArtifactID || storage.segments != 0 {
		t.Fatalf("SDR/HDR Studio cache collision: hdr=%q sdr=%q segments=%d %v", output.StudioArtifactID, sdr.StudioArtifactID, storage.segments, err)
	}
}

func TestStoryHDRGraphicsOpacityUsesLinearLight(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	ctx := context.Background()
	asset := storyHDRFixture(t, p, dir)
	source, err := p.storyMaterialize(ctx, dir, asset.Key)
	if err != nil {
		t.Fatal(err)
	}
	sourceNits := storySampleNits(t, p, dir, source, "crop=32:32:8:30")
	for _, opacity := range []float64{0, .5, 1} {
		t.Run(fmt.Sprintf("opacity-%.1f", opacity), func(t *testing.T) {
			filters := []string{"[0:v]null[base]", fmt.Sprintf("color=c=white@%g:s=160x90:r=30:d=0.4,format=rgba[graphics]", opacity)}
			filters = append(filters, storyHDROverlayFilters("base", "graphics", "output")...)
			file := filepath.Join(dir, fmt.Sprintf("opacity-%g.mp4", opacity))
			args := []string{"-i", source, "-filter_complex", strings.Join(filters, ";"), "-map", "[output]"}
			args = append(args, storyDelivery(true)...)
			args = append(args, "-t", "0.4", file)
			if err := p.ffmpeg(ctx, dir, args...); err != nil {
				t.Fatal(err)
			}
			nits := storySampleNits(t, p, dir, file, "crop=32:32:8:30")
			expected := sourceNits*(1-opacity) + 203*opacity
			if math.Abs(nits-expected) > expected*.05 {
				t.Fatalf("alpha must blend linear luminance: got %.1f nits; expected %.1f", nits, expected)
			}
		})
	}
}

func TestStoryCameraMOVIngestAndHLGNormalization(t *testing.T) {
	p, storage, dir := storyTestProcessor(t)
	ctx := context.Background()
	for _, format := range []string{"prores", "hlg"} {
		t.Run(format, func(t *testing.T) {
			file := filepath.Join(dir, format+".mov")
			args := []string{"-f", "lavfi", "-i", "testsrc2=s=160x90:r=30", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "0.4"}
			if format == "prores" {
				args = append(args, "-c:v", "prores_ks", "-profile:v", "3", "-pix_fmt", "yuv422p10le", "-c:a", "pcm_s24be")
			} else {
				args = append(args, "-vf", "zscale=pin=bt709:tin=bt709:min=bt709:rin=limited:p=bt709:t=linear:npl=203,format=gbrpf32le,zscale=p=bt2020:t=arib-std-b67:m=bt2020nc:r=limited:npl=203,format=yuv420p10le", "-c:v", "libx265", "-preset", "ultrafast", "-x265-params", "pools=2:log-level=error:colorprim=bt2020:transfer=arib-std-b67:colormatrix=bt2020nc", "-c:a", "aac")
			}
			args = append(args, file)
			if err := p.ffmpeg(ctx, dir, args...); err != nil {
				t.Fatal(err)
			}
			key := "sources/test/" + format + ".mov"
			if err := storage.Save(ctx, file, key, "video/quicktime"); err != nil {
				t.Fatal(err)
			}
			asset, err := p.Inspect(ctx, key)
			if err != nil || !asset.HasAudio {
				t.Fatalf("valid camera MOV rejected: %+v %v", asset, err)
			}
			videoCodec, audioCodec := "hevc", "aac"
			if format == "prores" {
				videoCodec, audioCodec = "prores", "pcm_s24be"
			}
			if asset.VideoCodec != videoCodec || asset.AudioCodec != audioCodec {
				t.Fatalf("inspection lost actual source codecs: video=%q audio=%q", asset.VideoCodec, asset.AudioCodec)
			}
			if format == "hlg" && asset.ColorTransfer != "arib-std-b67" {
				t.Fatal("HLG transfer was lost")
			}
			asset.ID = format
			proxy, err := p.prepareStoryProxy(ctx, dir, "camera-mov", &asset, story.DefaultOptions())
			if err != nil {
				t.Fatal(err)
			}
			info, err := p.probeStory(ctx, proxy)
			if err != nil || info.ColorTransfer != "" || math.Abs(info.Duration-asset.Duration) > .08 {
				t.Fatalf("camera proxy changed source duration or is not SDR: %+v %v", info, err)
			}
			// A mixed timeline must accept both SDR ProRes and HLG originals
			// when the user chooses the common PQ HDR delivery format.
			output := filepath.Join(dir, format+"-hdr.mp4")
			entry := story.Entry{OutputOut: .4, Video: story.Interval{SourceID: asset.ID, Out: .4}}
			if err := p.renderStoryEntry(ctx, dir, output, entry, asset, story.Asset{}, 160, 90, true); err != nil {
				t.Fatal(err)
			}
			rendered, err := p.probeStory(ctx, output)
			if err != nil || rendered.ColorTransfer != "smpte2084" {
				t.Fatalf("mixed source lost HDR output: %+v %v", rendered, err)
			}
		})
	}
}

func TestStoryHDRRenderFailurePreservesOriginalAndCleansWorkspace(t *testing.T) {
	p, storage, dir := storyTestProcessor(t)
	asset := storyHDRFixture(t, p, dir)
	request := story.Request{ID: "failed-hdr", Options: story.Options{AspectRatio: "16:9", DynamicRange: "hdr"}, Assets: []story.Asset{asset}}
	version := story.Version{Number: 1, Timeline: []story.Entry{{OutputOut: .4, Video: story.Interval{SourceID: asset.ID, Out: .4}}}}
	for _, failure := range []string{"cancelled", "encoder-unavailable"} {
		t.Run(failure, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			if failure == "cancelled" {
				cancel()
			} else {
				p.cfg.FFmpegPath = filepath.Join(dir, "unavailable-encoder")
			}
			output, err := renderStoryForTest(t, p, ctx, request, version)
			if err == nil || output.Key != "" {
				t.Fatalf("failed work was accepted: %+v %v", output, err)
			}
			if exists, err := storage.Exists(context.Background(), asset.Key); err != nil || !exists {
				t.Fatal("failure removed the original source")
			}
			workspaces, err := filepath.Glob(filepath.Join(dir, "story-render-*"))
			if err != nil || len(workspaces) != 0 {
				t.Fatalf("failed render workspace retained: %v %v", workspaces, err)
			}
			if data, err := os.ReadFile(filepath.Join(dir, "hdr.mov")); err != nil || len(data) == 0 {
				t.Fatal("original camera fixture was removed")
			}
		})
	}
}
