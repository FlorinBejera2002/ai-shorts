package processing

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"sneepcut/backend-go/internal/captions"
	"sneepcut/backend-go/internal/story"
)

// Optional permissioned-fixture check. Source footage and raw ASR evidence are
// supplied explicitly; no customer media is committed or read by normal tests.
func TestPermissionedCaptionReviewRendersActualSpeech(t *testing.T) {
	analysisFile, mediaRoot := os.Getenv("SNEEPCUT_REAL_CAPTION_ANALYSIS"), os.Getenv("SNEEPCUT_REAL_CAPTION_MEDIA")
	if analysisFile == "" || mediaRoot == "" {
		t.Skip("requires explicitly supplied permissioned media and ASR analysis")
	}
	p, storage, dir := storyTestProcessor(t)
	cfg, err := ConfigFromEnv(os.Getenv)
	if err != nil {
		t.Fatal(err)
	}
	cfg.TempDir = dir
	p = New(cfg, storage, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	data, err := os.ReadFile(analysisFile)
	if err != nil {
		t.Fatal(err)
	}
	var raw story.Asset
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{raw.Key, raw.ProxyKey} {
		if filepath.IsAbs(key) || strings.Contains(key, "..") || key == "" {
			t.Fatal("fixture media key is not confined")
		}
		if err := storage.Save(ctx, filepath.Join(mediaRoot, filepath.FromSlash(key)), key, "video/mp4"); err != nil {
			t.Fatal(err)
		}
	}
	inspected, err := p.Inspect(ctx, raw.Key)
	if err != nil || inspected.Hash != raw.Hash {
		t.Fatalf("source identity mismatch: %v", err)
	}
	options := story.DefaultOptions()
	options.Language, options.CaptionMode, options.Captions = "ro", "all", true
	options.SubtitleColor, options.SubtitleSize = "#FF00FF", 72
	options.SubtitleFont, options.SubtitlePosition = "Inter", "bottom"
	captionStyle := captions.Default()
	captionStyle.Weight, captionStyle.TextColor = 900, "#FF00FF"
	options.CaptionStyle = &captionStyle
	asset, err := p.prepareStorySpeechCatalog(ctx, dir, raw, options)
	if err != nil {
		t.Fatal(err)
	}
	if len(asset.TranscriptProposals) == 0 {
		t.Fatal("low-confidence speech has no reviewable transcript")
	}
	proposal := asset.TranscriptProposals[0]
	if !proposal.TimingVerified || proposal.Reviewed {
		t.Fatalf("proposal timing/review state: %+v", proposal)
	}
	var text []string
	for _, word := range proposal.Words {
		text = append(text, word.Text)
	}
	approved, err := story.ApproveTranscript(asset, proposal.ID, text)
	if err != nil {
		t.Fatal(err)
	}
	base := story.Version{Number: 1, Timeline: []story.Entry{{
		BlockID: "voice", CandidateID: proposal.CandidateID, OutputOut: proposal.Out - proposal.In,
		Video: story.Interval{SourceID: asset.ID, In: proposal.In, Out: proposal.Out},
		Audio: &story.Interval{SourceID: asset.ID, In: proposal.In, Out: proposal.Out}, Crop: "fit",
	}}}
	version, err := story.RebuildTranscriptCaptions(base, []story.Asset{approved})
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(version.Timeline[0].Video, base.Timeline[0].Video) || !reflect.DeepEqual(version.Timeline[0].Audio, base.Timeline[0].Audio) || version.Timeline[0].OutputOut != base.Timeline[0].OutputOut {
		t.Fatal("caption approval changed the cut")
	}
	if len(version.Timeline[0].Words) != len(proposal.Words) {
		t.Fatal("reviewed words were lost")
	}
	request := story.Request{ID: "permissioned-caption-review", UserID: "fixture-owner", Options: options, Assets: []story.Asset{approved}}
	output, err := renderStoryForTest(t, p, ctx, request, version)
	if err != nil || !output.Captions {
		t.Fatalf("approved captions not rendered: %+v %v", output, err)
	}
	captioned := filepath.Join(dir, "reviewed.mp4")
	if err := p.materialize(ctx, output.Key, captioned); err != nil {
		t.Fatal(err)
	}
	request.Options.CaptionMode, request.Options.Captions = "off", false
	plainOutput, err := renderStoryForTest(t, p, ctx, request, version)
	if err != nil {
		t.Fatal(err)
	}
	plain := filepath.Join(dir, "plain.mp4")
	if err := p.materialize(ctx, plainOutput.Key, plain); err != nil {
		t.Fatal(err)
	}
	magenta := func(file string) int {
		pixels, err := run(ctx, dir, p.cfg.FFmpegPath, "-v", "error", "-ss", "1.5", "-i", file, "-frames:v", "1", "-vf", "scale=360:640", "-pix_fmt", "rgb24", "-f", "rawvideo", "-")
		if err != nil || len(pixels) != 360*640*3 {
			t.Fatalf("cannot decode caption evidence: %v (%d)", err, len(pixels))
		}
		count := 0
		for i := len(pixels) / 2; i+2 < len(pixels); i += 3 {
			if pixels[i] > 170 && pixels[i+1] < 100 && pixels[i+2] > 170 {
				count++
			}
		}
		return count
	}
	plainPixels, captionPixels := magenta(plain), magenta(captioned)
	if captionPixels < plainPixels+50 {
		t.Fatalf("no visible caption pixels: plain=%d reviewed=%d", plainPixels, captionPixels)
	}
	t.Logf("Approved %d measured word slots; caption pixels plain=%d reviewed=%d; source/cut unchanged", len(text), plainPixels, captionPixels)
	if destination := os.Getenv("SNEEPCUT_REAL_CAPTION_OUTPUT"); destination != "" {
		if err := os.MkdirAll(destination, 0700); err != nil {
			t.Fatal(err)
		}
		data, err := os.ReadFile(captioned)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(destination, "reviewed-captions.mp4"), data, 0600); err != nil {
			t.Fatal(err)
		}
		if err := p.ffmpeg(ctx, dir, "-ss", "1.5", "-i", captioned, "-frames:v", "1", filepath.Join(destination, "reviewed-captions.png")); err != nil {
			t.Fatal(err)
		}
	}
}
