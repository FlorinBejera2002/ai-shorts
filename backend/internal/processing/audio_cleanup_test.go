package processing

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"sneepcut/backend-go/internal/audiocleanup"
	"sneepcut/backend-go/internal/story"
	"strings"
	"testing"
	"time"
)

// A deterministic native process fixture exercises the adapter and actual
// FFmpeg exports, not the quality of a pretrained speech-denoising model.
func init() {
	mode := os.Getenv("SNEEPCUT_CLEANUP_FIXTURE")
	if mode == "" || len(os.Args) < 2 || os.Args[1] != "--model" {
		return
	}
	if log := os.Getenv("SNEEPCUT_CLEANUP_LOG"); log != "" {
		f, _ := os.OpenFile(log, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
		if f != nil {
			fmt.Fprintln(f, strings.Join(os.Args[1:], " "))
			f.Close()
		}
	}
	if mode == "fail" {
		os.Exit(1)
	}
	if mode == "timeout" {
		time.Sleep(time.Minute)
		os.Exit(1)
	}
	out := ""
	for i, arg := range os.Args {
		if arg == "--output-dir" && i+1 < len(os.Args) {
			out = os.Args[i+1]
		}
	}
	if out == "" || !strings.Contains(strings.Join(os.Args, " "), "--compensate-delay") {
		os.Exit(2)
	}
	input := os.Args[len(os.Args)-1]
	args := []string{"-v", "error", "-y", "-i", input, "-af", "volume=0.25", "-c:a", "pcm_s16le"}
	if mode == "short" {
		args = append(args, "-t", "0.1")
	}
	args = append(args, filepath.Join(out, "source.wav"))
	cmd := exec.Command(os.Getenv("SNEEPCUT_CLEANUP_FFMPEG"), args...)
	cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
	if cmd.Run() != nil {
		os.Exit(3)
	}
	os.Exit(0)
}

func cleanupFixture(t *testing.T) (*Processor, *storyRecordingStorage, string, story.Asset, string) {
	t.Helper()
	p, store, dir := storyTestProcessor(t)
	binary, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	ffmpeg, err := exec.LookPath(p.cfg.FFmpegPath)
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("SNEEPCUT_CLEANUP_FIXTURE", "ok")
	t.Setenv("SNEEPCUT_CLEANUP_FFMPEG", ffmpeg)
	log := filepath.Join(dir, "cleanup.log")
	t.Setenv("SNEEPCUT_CLEANUP_LOG", log)
	p.cfg.DeepFilterPath = binary
	p.cfg.DeepFilterModel = filepath.Join(dir, "cleanup-model.tar.gz")
	if err = os.WriteFile(p.cfg.DeepFilterModel, []byte("synthetic adapter fixture"), 0600); err != nil {
		t.Fatal(err)
	}
	a := storySource(t, p, dir, "voice", "blue", 430)
	a.Candidates = []story.Candidate{{ID: "phrase", SourceID: a.ID, In: 0, Out: a.Duration, Text: "test", Words: []story.Word{{Text: "test", Start: 0, End: a.Duration}}}}
	return p, store, dir, a, log
}

func TestAudioCleanupImmutableDerivativeCacheRetryAndValidation(t *testing.T) {
	p, _, dir, a, log := cleanupFixture(t)
	original, _ := p.storyMaterialize(context.Background(), dir, a.Key)
	before, _ := fileSHA256(original)
	result, err := p.PrepareStoryAudio(context.Background(), "cleanup-project", a)
	if err != nil || result.AudioCleanup.Status != "ready" || result.Key != a.Key {
		t.Fatalf("cleanup: %+v %v", result.AudioCleanup, err)
	}
	after, _ := fileSHA256(original)
	if before != after {
		t.Fatal("original was changed")
	}
	if _, err = p.PrepareStoryAudio(context.Background(), "cleanup-project", a); err != nil {
		t.Fatal(err)
	}
	calls, _ := os.ReadFile(log)
	if len(strings.Split(strings.TrimSpace(string(calls)), "\n")) != 1 {
		t.Fatal("warm derivative repeated inference")
	}
	if !strings.Contains(string(calls), "--atten-lim-db 12") {
		t.Fatal("conservative attenuation missing")
	}
	// Project ownership is also part of the cache scope.
	if _, err = p.PrepareStoryAudio(context.Background(), "other-project", a); err != nil {
		t.Fatal(err)
	}
	calls, _ = os.ReadFile(log)
	if len(strings.Split(strings.TrimSpace(string(calls)), "\n")) != 2 {
		t.Fatal("cross-project cache reused")
	}
	for _, mode := range []string{"fail", "short"} {
		t.Setenv("SNEEPCUT_CLEANUP_FIXTURE", mode)
		failed, err := p.PrepareStoryAudio(context.Background(), "cleanup-"+mode, a)
		if err == nil || failed.AudioCleanup.Status != "failed" || failed.Key != a.Key {
			t.Fatalf("provider failure hidden: %+v %v", failed, err)
		}
	}
	t.Setenv("SNEEPCUT_CLEANUP_FIXTURE", "ok")
	retry, err := p.PrepareStoryAudio(context.Background(), "cleanup-fail", a)
	if err != nil || retry.AudioCleanup.Status != "ready" {
		t.Fatalf("retry failed: %v", err)
	}
}

func TestAudioCleanupNoAudioMusicMissingConfigurationAndCancellation(t *testing.T) {
	p, _, _, a, _ := cleanupFixture(t)
	p.cfg.DeepFilterPath = ""
	silent := a
	silent.HasAudio = false
	got, err := p.PrepareStoryAudio(context.Background(), "silent", silent)
	if err != nil || got.AudioCleanup.Status != "no_audio" {
		t.Fatalf("silent: %+v %v", got, err)
	}
	music := a
	music.Candidates = nil
	got, err = p.PrepareStoryAudio(context.Background(), "music", music)
	if err != nil || got.AudioCleanup.Status != "unchanged" {
		t.Fatalf("ambience changed: %+v %v", got, err)
	}
	got, err = p.PrepareStoryAudio(context.Background(), "missing", a)
	if err == nil || !strings.Contains(err.Error(), "not configured") || got.AudioCleanup.Status != "failed" {
		t.Fatalf("missing configuration hidden: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err = p.PrepareStoryAudio(ctx, "cancel", a); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancel ignored: %v", err)
	}
}

func TestAudioCleanupCancellationStopsActiveProviderAndCanRetry(t *testing.T) {
	p, _, _, a, log := cleanupFixture(t)
	t.Setenv("SNEEPCUT_CLEANUP_FIXTURE", "timeout")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	go func() {
		_, err := p.PrepareStoryAudio(ctx, "active-cancel", a)
		done <- err
	}()
	deadline := time.Now().Add(10 * time.Second)
	for {
		if raw, _ := os.ReadFile(log); len(raw) > 0 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("provider did not start")
		}
		time.Sleep(10 * time.Millisecond)
	}
	cancel()
	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("active cancellation was hidden: %v", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("provider continued after cancellation")
	}
	t.Setenv("SNEEPCUT_CLEANUP_FIXTURE", "ok")
	got, err := p.PrepareStoryAudio(context.Background(), "active-cancel", a)
	if err != nil || got.AudioCleanup.Status != "ready" {
		t.Fatalf("cancelled attempt prevented retry: %+v %v", got.AudioCleanup, err)
	}
}
func TestAudioCleanupTimeoutRetainsOriginal(t *testing.T) {
	p, _, _, a, _ := cleanupFixture(t)
	t.Setenv("SNEEPCUT_CLEANUP_FIXTURE", "timeout")
	p.cfg.AudioCleanupTimeout = 500 * time.Millisecond
	got, err := p.PrepareStoryAudio(context.Background(), "timeout", a)
	if err == nil || got.AudioCleanup.Status != "failed" || !strings.Contains(err.Error(), "timed out") || got.Key != a.Key {
		t.Fatalf("timeout hidden: %+v %v", got, err)
	}
}

func cleanupRMS(t *testing.T, p *Processor, dir, key string) float64 {
	t.Helper()
	file, err := p.storyMaterialize(context.Background(), dir, key)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := run(context.Background(), dir, p.cfg.FFmpegPath, "-v", "error", "-i", file, "-ss", "0.2", "-t", "1", "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", "-")
	if err != nil || len(raw) == 0 {
		t.Fatalf("decode: %v", err)
	}
	energy := 0.0
	for i := 0; i+1 < len(raw); i += 2 {
		x := float64(int16(binary.LittleEndian.Uint16(raw[i : i+2])))
		energy += x * x
	}
	return math.Sqrt(energy / float64(len(raw)/2))
}

func TestAudioCleanupReachesStoryExportAndCanBeDisabled(t *testing.T) {
	p, _, dir, a, _ := cleanupFixture(t)
	cleaned, err := p.PrepareStoryAudio(context.Background(), "export-cleanup", a)
	if err != nil {
		t.Fatal(err)
	}
	req := story.Request{ID: "export-cleanup", Options: story.Options{AspectRatio: "16:9", CaptionMode: "off", AudioCleanup: &audiocleanup.Settings{Enabled: true}}, Assets: []story.Asset{cleaned}}
	version := story.Version{Number: 1, Timeline: []story.Entry{{BlockID: "one", OutputIn: 0, OutputOut: a.Duration, Video: story.Interval{SourceID: a.ID, In: 0, Out: a.Duration}, Audio: &story.Interval{SourceID: a.ID, In: 0, Out: a.Duration}, Crop: "fit"}}}
	result, err := renderStoryForTest(t, p, context.Background(), req, version)
	if err != nil {
		t.Fatal(err)
	}
	sourceRMS := cleanupRMS(t, p, dir, a.Key)
	cleanRMS := cleanupRMS(t, p, dir, result.Key)
	ratio := cleanRMS / sourceRMS
	if ratio < .15 || ratio > .30 || math.Abs(result.Duration-a.Duration) > .04 {
		t.Fatalf("derivative not exported or timing changed: ratio %.4f duration %.4f", ratio, result.Duration)
	}
	req.Options.AudioCleanup.Enabled = false
	version.Number = 2
	original, err := renderStoryForTest(t, p, context.Background(), req, version)
	if err != nil {
		t.Fatal(err)
	}
	ratio = cleanRMS / cleanupRMS(t, p, dir, original.Key)
	if ratio < .20 || ratio > .30 {
		t.Fatalf("disable did not restore original audio: cleaned/original %.4f", ratio)
	}
	if evidence := os.Getenv("SNEEPCUT_AUDIO_EVIDENCE_DIR"); evidence != "" {
		if err = os.MkdirAll(evidence, 0700); err != nil {
			t.Fatal(err)
		}
		for name, key := range map[string]string{"original-export": original.Key, "processed-export": result.Key} {
			file, e := p.storyMaterialize(context.Background(), dir, key)
			if e != nil {
				t.Fatal(e)
			}
			if e = p.ffmpeg(context.Background(), dir, "-i", file, "-c", "copy", filepath.Join(evidence, name+".mp4")); e != nil {
				t.Fatal(e)
			}
			if e = p.ffmpeg(context.Background(), dir, "-i", file, "-vn", "-c:a", "pcm_s16le", filepath.Join(evidence, name+".wav")); e != nil {
				t.Fatal(e)
			}
		}
	}
	req.Options.AudioCleanup.Enabled = true
	req.ID = "different-project"
	if _, err = renderStoryForTest(t, p, context.Background(), req, version); err == nil {
		t.Fatal("foreign derivative accepted")
	}
}

func TestAudioCleanupOrdinaryRenderUsesDerivativeAndOriginalRecipe(t *testing.T) {
	p, _, dir, a, _ := cleanupFixture(t)
	in := RenderInput{Namespace: "ordinary-cleanup/clip", SourceKey: a.Key, AspectRatio: "16:9", Segments: []Segment{{Start: 0, End: a.Duration}}, AudioCleanup: &audiocleanup.Settings{Enabled: true}}
	result, err := renderClipForTest(t, p, context.Background(), in)
	if err != nil {
		t.Fatal(err)
	}
	ratio := cleanupRMS(t, p, dir, result.StorageKey) / cleanupRMS(t, p, dir, a.Key)
	if ratio < .20 || ratio > .30 {
		t.Fatalf("ordinary renderer omitted cleanup: %.4f", ratio)
	}
	if result.Metadata["audio_cleanup"] == nil {
		t.Fatal("comparison derivative lost")
	}
}

func TestAudioCleanupMaintainsSampleClock(t *testing.T) {
	p, _, dir, _, _ := cleanupFixture(t)
	ctx := context.Background()
	file := filepath.Join(dir, "clock.mp4")
	if err := p.ffmpeg(ctx, dir, "-f", "lavfi", "-i", "color=c=black:s=160x90:r=30", "-f", "lavfi", "-i", "anoisesrc=color=pink:amplitude=0.1:sample_rate=48000:seed=44", "-t", "2.4", "-c:v", "libx264", "-c:a", "aac", "-pix_fmt", "yuv420p", file); err != nil {
		t.Fatal(err)
	}
	key := "sources/clock-audio/source.mp4"
	if err := p.storage.Save(ctx, file, key, "video/mp4"); err != nil {
		t.Fatal(err)
	}
	asset, err := p.Inspect(ctx, key)
	if err != nil {
		t.Fatal(err)
	}
	derivative, err := p.cleanAudio(ctx, "clock-audio", key, asset.Hash, asset.Duration)
	if err != nil {
		t.Fatal(err)
	}
	clean, err := p.storyMaterialize(ctx, dir, derivative.Key)
	if err != nil {
		t.Fatal(err)
	}
	decode := func(file string) []float64 {
		raw, err := run(ctx, dir, p.cfg.FFmpegPath, "-v", "error", "-i", file, "-ss", "0.25", "-t", "1.75", "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", "-")
		if err != nil {
			t.Fatal(err)
		}
		samples := make([]float64, len(raw)/2)
		for i := range samples {
			samples[i] = float64(int16(binary.LittleEndian.Uint16(raw[i*2:i*2+2]))) / 32768
		}
		return samples
	}
	correlation, lag := storyFixtureCorrelation(decode(file), decode(clean))
	if correlation < .98 || math.Abs(float64(lag)/16) > 1 {
		t.Fatalf("cleanup changed timing: correlation %.4f lag %.3fms", correlation, float64(lag)/16)
	}
}
