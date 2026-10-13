package processing

import (
	"bytes"
	"context"
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/story"
)

func TestStoryReviewCombinedOutputsPreserveFullMediaEvidence(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	ctx := context.Background()
	const duration = 2.4
	output := filepath.Join(dir, "actual-output.mp4")
	// Moving pictures and distinct stereo channels expose accidental truncation,
	// incorrect stream maps and audio settings leaking between FFmpeg outputs.
	if err := p.ffmpeg(ctx, dir,
		"-f", "lavfi", "-i", "testsrc2=s=960x540:r=30",
		"-f", "lavfi", "-i", "aevalsrc=0.2*sin(2*PI*(220*t+100*t*t))|0.15*sin(2*PI*880*t):s=48000",
		"-t", seconds(duration), "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", output,
	); err != nil {
		t.Fatal(err)
	}
	const sourceKey = "sources/review-output/original.mp4"
	if err := p.storage.Save(ctx, output, sourceKey, "video/mp4"); err != nil {
		t.Fatal(err)
	}
	for _, narration := range []bool{false, true} {
		name := "ordinary"
		if narration {
			name = "narration"
		}
		t.Run(name, func(t *testing.T) {
			work := filepath.Join(dir, name)
			if err := os.Mkdir(work, 0700); err != nil {
				t.Fatal(err)
			}
			request := story.Request{Options: story.Options{Narration: narration}}
			if narration {
				request.Assets = []story.Asset{{ID: "voice", Key: sourceKey, Kind: "narration", HasAudio: true, Duration: duration}}
			}
			version := story.Version{
				Output:   story.Output{Duration: duration},
				Timeline: []story.Entry{{BlockID: "whole-output", OutputOut: duration}},
			}
			parts, labels, err := p.storyReviewMedia(ctx, work, output, request, version)
			if err != nil {
				t.Fatal(err)
			}
			wantParts := 2
			if narration {
				wantParts++
			}
			if len(parts) != wantParts || len(labels) != wantParts || parts[0].MIME != "video/mp4" || parts[1].MIME != "audio/mpeg" ||
				!strings.Contains(labels[0], "FULL ACTUAL OUTPUT VIDEO") || !strings.Contains(labels[1], "FULL ACTUAL OUTPUT AUDIO") {
				t.Fatalf("full output evidence changed: parts=%d labels=%v", len(parts), labels)
			}
			if narration && (parts[2].MIME != "audio/mpeg" || !strings.Contains(labels[2], "ORIGINAL FULL NARRATION AUDIO")) {
				t.Fatal("original narration reference is missing")
			}

			// These are the former separate invocations. Decode and compare their
			// complete outputs, rather than just comparing container metadata.
			legacyVideo := filepath.Join(work, "separate.mp4")
			legacyAudio := filepath.Join(work, "separate.mp3")
			videoRate, audioRate := "600k", "64k"
			if narration {
				videoRate, audioRate = "240k", "48k"
			}
			if err := p.ffmpeg(ctx, work, "-i", output, "-vf", "scale=w='min(640,iw)':h='min(640,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=10", "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-maxrate", videoRate, "-bufsize", "480k", "-c:a", "aac", "-b:a", audioRate, "-ac", "1", "-movflags", "+faststart", legacyVideo); err != nil {
				t.Fatal(err)
			}
			if err := p.ffmpeg(ctx, work, "-i", output, "-vn", "-ac", "1", "-ar", "24000", "-c:a", "libmp3lame", "-b:a", "64k", legacyAudio); err != nil {
				t.Fatal(err)
			}
			for i, pair := range []struct {
				combined, separate string
				rate               int
			}{
				{filepath.Join(work, "review.mp4"), legacyVideo, 48000},
				{filepath.Join(work, "review.mp3"), legacyAudio, 24000},
			} {
				stored, err := os.ReadFile(pair.combined)
				if err != nil || !bytes.Equal(stored, parts[i].Data) {
					t.Fatalf("review part %d does not contain the actual encoded output: %v", i, err)
				}
				assertStoryReviewOutputStreams(t, p, pair.combined, duration, i == 0, pair.rate)
				decode := func(file string, args ...string) []byte {
					t.Helper()
					decoded, err := run(ctx, work, p.cfg.FFmpegPath, append([]string{"-v", "error", "-i", file}, args...)...)
					if err != nil {
						t.Fatal(err)
					}
					return decoded
				}
				pcmArgs := []string{"-map", "0:a:0", "-vn", "-c:a", "pcm_s16le", "-f", "s16le", "-"}
				pcm := decode(pair.combined, pcmArgs...)
				if !bytes.Equal(pcm, decode(pair.separate, pcmArgs...)) {
					t.Fatalf("review part %d audio differs from separate extraction", i)
				}
				if decodedDuration := float64(len(pcm)) / float64(2*pair.rate); math.Abs(decodedDuration-duration) > .04 {
					t.Fatalf("review part %d audio is incomplete: %.6fs", i, decodedDuration)
				}
				if i == 0 {
					assertStoryReviewDecodedFrames(t, p, work, pair.combined, pair.separate)
				}
			}
		})
	}
}

func assertStoryReviewDecodedFrames(t *testing.T, p *Processor, dir, combined, separate string) {
	t.Helper()
	decode := func(file, name string) []byte {
		t.Helper()
		raw := filepath.Join(dir, name+".yuv")
		if err := p.ffmpeg(context.Background(), dir, "-i", file, "-map", "0:v:0", "-an", "-pix_fmt", "yuv420p", "-f", "rawvideo", raw); err != nil {
			t.Fatal(err)
		}
		frames, err := os.ReadFile(raw)
		if err != nil {
			t.Fatal(err)
		}
		return frames
	}
	actual, reference := decode(combined, "combined-frames"), decode(separate, "separate-frames")
	const frameSize = 640 * 360 * 3 / 2
	if len(actual) != 24*frameSize || len(reference) != len(actual) {
		t.Fatalf("decoded review video does not cover all frames: actual=%d reference=%d", len(actual), len(reference))
	}
	// Multithreaded x264 VBV can make even identical separate invocations vary
	// slightly. Compare every decoded frame with a 40 dB PSNR floor (at most
	// 2.55 levels RMS error), rather than requiring nondeterministic bit equality.
	for frame := range 24 {
		var squaredError float64
		for i := frame * frameSize; i < (frame+1)*frameSize; i++ {
			difference := float64(actual[i]) - float64(reference[i])
			squaredError += difference * difference
		}
		psnr := math.Inf(1)
		if squaredError > 0 {
			psnr = 10 * math.Log10(255*255*frameSize/squaredError)
		}
		if psnr < 40 {
			t.Fatalf("review frame %d differs substantially from separate extraction: PSNR %.3f dB", frame, psnr)
		}
	}
}

func assertStoryReviewOutputStreams(t *testing.T, p *Processor, file string, duration float64, video bool, rate int) {
	t.Helper()
	raw, err := run(context.Background(), "", p.cfg.FFprobePath, "-v", "error", "-count_frames", "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,sample_rate,channels,avg_frame_rate,nb_read_frames", "-of", "json", file)
	if err != nil {
		t.Fatal(err)
	}
	var info struct {
		Format  struct{ Duration string }
		Streams []struct {
			CodecType               string `json:"codec_type"`
			CodecName               string `json:"codec_name"`
			SampleRate              string `json:"sample_rate"`
			FrameRate               string `json:"avg_frame_rate"`
			Frames                  string `json:"nb_read_frames"`
			Width, Height, Channels int
		}
	}
	if err := json.Unmarshal(raw, &info); err != nil {
		t.Fatal(err)
	}
	actualDuration, err := strconv.ParseFloat(info.Format.Duration, 64)
	if err != nil || math.Abs(actualDuration-duration) > .12 {
		t.Fatalf("review duration differs from complete output: %s, %v", info.Format.Duration, err)
	}
	videos, audios := 0, 0
	for _, stream := range info.Streams {
		switch stream.CodecType {
		case "video":
			videos++
			if stream.CodecName != "h264" || stream.Width != 640 || stream.Height != 360 || stream.FrameRate != "10/1" || stream.Frames != "24" {
				t.Fatalf("review video lost frames or encoding settings: %#v", stream)
			}
		case "audio":
			audios++
			codec := "mp3"
			if video {
				codec = "aac"
			}
			if stream.CodecName != codec || stream.SampleRate != strconv.Itoa(rate) || stream.Channels != 1 {
				t.Fatalf("review audio encoding changed: %#v", stream)
			}
		}
	}
	if audios != 1 || video && videos != 1 || !video && videos != 0 {
		t.Fatalf("review stream coverage changed: video=%d audio=%d", videos, audios)
	}
}
