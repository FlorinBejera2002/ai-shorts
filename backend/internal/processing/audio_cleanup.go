package processing

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"sneepcut/backend-go/internal/audiocleanup"
	"sneepcut/backend-go/internal/story"
	"strings"
	"time"
)

const cleanupVersion = "deepfilter-speech-v1"

// Sources are processed serially under the durable worker's cancellation context.
// Original ambience/music is retained when aligned speech has not been detected.
func (p *Processor) PrepareStoryAudio(ctx context.Context, project string, asset story.Asset) (story.Asset, error) {
	if !asset.HasAudio {
		asset.AudioCleanup = &audiocleanup.Derivative{Status: "no_audio", Message: "This clip has no audio.", OriginalKey: asset.Key}
		return asset, nil
	}
	speech := asset.Kind == "narration"
	for _, c := range asset.Candidates {
		if len(c.Words) > 0 && strings.TrimSpace(c.Text) != "" {
			speech = true
			break
		}
	}
	if !speech {
		asset.AudioCleanup = &audiocleanup.Derivative{Status: "unchanged", Message: "No aligned speech was detected. Original ambience or music was kept.", OriginalKey: asset.Key}
		return asset, nil
	}
	result, err := p.cleanAudio(ctx, project, asset.Key, asset.Hash, asset.Duration)
	asset.AudioCleanup = &result
	return asset, err
}

func (p *Processor) cleanAudio(ctx context.Context, project, sourceKey, sourceHash string, duration float64) (audiocleanup.Derivative, error) {
	result := audiocleanup.Derivative{Status: "failed", OriginalKey: sourceKey, SourceHash: sourceHash, Provider: "deepfilternet", Duration: duration}
	fail := func(message string) (audiocleanup.Derivative, error) {
		result.Message = message
		return result, &audiocleanup.Failure{Message: message}
	}
	if err := ctx.Err(); err != nil {
		return result, err
	}
	if !storyNamespace(project) || len(sourceHash) != 64 || !finite(duration) || duration <= 0 || duration > 86400 {
		return fail("Audio cleanup could not validate this source. The original is retained.")
	}
	if p.cfg.DeepFilterPath == "" || p.cfg.DeepFilterModel == "" {
		return fail("Background noise reduction is not configured. Retry when available, or turn it off to use original audio.")
	}
	binary, err := os.Stat(p.cfg.DeepFilterPath)
	if err != nil || !binary.Mode().IsRegular() {
		return fail("Background noise reduction is unavailable. Retry, or turn it off to use original audio.")
	}
	model, err := os.Stat(p.cfg.DeepFilterModel)
	if err != nil || !model.Mode().IsRegular() || model.Size() == 0 {
		return fail("Background noise reduction model is unavailable. Retry, or turn it off to use original audio.")
	}
	result.Fingerprint = storyDigest([]any{cleanupVersion, sourceHash, storyModelSignature(p.cfg.DeepFilterPath), storyModelSignature(p.cfg.DeepFilterModel), duration, 48000, 12})
	prefix := "work/" + project + "/audio/" + result.Fingerprint
	result.Key = prefix + "/processed.wav"
	dir, err := os.MkdirTemp(p.cfg.TempDir, "audio-cleanup-")
	if err != nil {
		return fail("Audio cleanup could not prepare storage. Original audio is retained.")
	}
	defer os.RemoveAll(dir)
	cached := filepath.Join(dir, "cached.json")
	if p.materialize(ctx, prefix+"/manifest.json", cached) == nil {
		raw, _ := os.ReadFile(cached)
		var previous audiocleanup.Derivative
		if json.Unmarshal(raw, &previous) == nil && previous.Status == "ready" && previous.SourceHash == sourceHash && previous.Fingerprint == result.Fingerprint && previous.Key == result.Key {
			if exists, e := p.storage.Exists(ctx, result.Key); e == nil && exists {
				previous.OriginalKey = sourceKey
				return previous, nil
			}
		}
	}
	timeout := p.cfg.AudioCleanupTimeout
	if timeout <= 0 {
		timeout = 10 * time.Minute
	}
	work, stop := context.WithTimeout(ctx, timeout)
	defer stop()
	source, err := p.storyMaterialize(work, dir, sourceKey)
	if err != nil {
		return fail("Original audio is unavailable. Restore the source and retry.")
	}
	// Pad BEFORE inference: the Rust CLI removes lookahead samples with -D.
	input := filepath.Join(dir, "source.wav")
	args := []string{"-i", source, "-vn", "-map", "0:a:0", "-af", "aresample=48000:async=1:first_pts=0,apad=pad_dur=1", "-t", seconds(duration + 1), "-ar", "48000", "-c:a", "pcm_s16le", input}
	if err = p.ffmpeg(work, dir, args...); err != nil {
		if work.Err() != nil {
			return cleanupInterrupted(result, work.Err())
		}
		return fail("Audio cleanup could not read this recording. The original is retained.")
	}
	outputDir := filepath.Join(dir, "enhanced")
	if err = os.Mkdir(outputDir, 0700); err != nil {
		return fail("Audio cleanup could not prepare storage. The original is retained.")
	}
	// Moderate attenuation; no loudness normalization, time stretch or speaker selection.
	_, err = run(work, dir, p.cfg.DeepFilterPath, "--model", p.cfg.DeepFilterModel, "--compensate-delay", "--atten-lim-db", "12", "--output-dir", outputDir, input)
	if err != nil {
		if work.Err() != nil {
			return cleanupInterrupted(result, work.Err())
		}
		return fail("Background noise reduction failed. Retry, or turn it off to keep original audio.")
	}
	enhanced := filepath.Join(outputDir, "source.wav")
	if err = p.validateCleanAudio(work, enhanced, duration); err != nil {
		if work.Err() != nil {
			return cleanupInterrupted(result, work.Err())
		}
		return fail("Audio cleanup returned incomplete audio. Retry, or use the original.")
	}
	final := filepath.Join(dir, "processed.wav")
	// Trim padded tail only after validating the complete source duration exists.
	if err = p.ffmpeg(work, dir, "-i", enhanced, "-vn", "-af", "atrim=duration="+seconds(duration)+",asetpts=PTS-STARTPTS", "-ar", "48000", "-c:a", "pcm_s16le", final); err != nil {
		if work.Err() != nil {
			return cleanupInterrupted(result, work.Err())
		}
		return fail("Audio cleanup could not finish. Retry, or use the original.")
	}
	if err = p.storySave(work, final, result.Key, "audio/wav"); err != nil {
		return fail("Cleaned audio could not be saved. Retry, or use the original.")
	}
	result.Status = "ready"
	result.Message = ""
	manifest := filepath.Join(dir, "manifest.json")
	raw, _ := json.Marshal(result)
	if err = os.WriteFile(manifest, raw, 0600); err == nil {
		err = p.storySave(work, manifest, prefix+"/manifest.json", "application/json")
	}
	if err != nil {
		result.Status = "failed"
		return fail("Audio cleanup could not save its checkpoint. Retry, or use the original.")
	}
	return result, nil
}

func cleanupInterrupted(result audiocleanup.Derivative, err error) (audiocleanup.Derivative, error) {
	result.Status = "failed"
	if errors.Is(err, context.DeadlineExceeded) {
		result.Message = "Background noise reduction timed out. Retry, or turn it off to use original audio."
		return result, &audiocleanup.Failure{Message: result.Message}
	}
	result.Message = "Audio cleanup was cancelled. Original audio is retained."
	return result, err
}

func (p *Processor) validateCleanAudio(ctx context.Context, file string, duration float64) error {
	raw, err := run(ctx, "", p.cfg.FFprobePath, "-v", "error", "-show_entries", "format=duration:stream=codec_type,sample_rate,channels", "-of", "json", file)
	if err != nil {
		return err
	}
	var info struct {
		Format  struct{ Duration string }
		Streams []struct {
			CodecType  string `json:"codec_type"`
			SampleRate string `json:"sample_rate"`
			Channels   int
		}
	}
	if err = json.Unmarshal(raw, &info); err != nil {
		return err
	}
	var seconds float64
	if _, err = fmt.Sscan(info.Format.Duration, &seconds); err != nil || !finite(seconds) || seconds < duration-.002 || seconds > duration+1.1 {
		return errors.New("unexpected cleanup duration")
	}
	if len(info.Streams) != 1 || info.Streams[0].CodecType != "audio" || info.Streams[0].SampleRate != "48000" || (info.Streams[0].Channels < 1 || info.Streams[0].Channels > 8) {
		return errors.New("unexpected cleanup format")
	}
	return p.ffmpeg(ctx, "", "-i", file, "-f", "null", "-")
}

func effectiveStoryAudioKey(project string, a story.Asset, settings *audiocleanup.Settings) (string, error) {
	if !audiocleanup.Enabled(settings) {
		return a.Key, nil
	}
	d := a.AudioCleanup
	if d != nil && (d.Status == "no_audio" && !a.HasAudio || d.Status == "unchanged") {
		return a.Key, nil
	}
	if d == nil || d.Status != "ready" || d.SourceHash != a.Hash || d.Fingerprint == "" || d.Key != "work/"+project+"/audio/"+d.Fingerprint+"/processed.wav" || math.Abs(d.Duration-a.Duration) > .002 {
		return "", &audiocleanup.Failure{Message: "Cleaned audio is unavailable. Retry, or turn off noise reduction to use the original."}
	}
	return d.Key, nil
}

func fileSHA256(file string) (string, error) {
	f, err := os.Open(file)
	if err != nil {
		return "", err
	}
	defer f.Close()
	hash := sha256.New()
	if _, err = io.Copy(hash, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

// prepareRenderAudio preserves the immutable original and remuxes its video
// with a separately stored PCM derivative before all edit/music operations.
func (p *Processor) prepareRenderAudio(ctx context.Context, dir, source string, in RenderInput, duration float64) (string, *audiocleanup.Derivative, error) {
	project := strings.Split(in.Namespace, "/")[0]
	hash, err := fileSHA256(source)
	if err != nil {
		return "", nil, err
	}
	prepared := in.PreparedAudio
	if prepared == nil {
		derivative, err := p.cleanAudio(ctx, project, in.SourceKey, hash, duration)
		if err != nil {
			return "", &derivative, err
		}
		prepared = &derivative
	}
	if prepared.Status != "ready" || prepared.SourceHash != hash || prepared.Fingerprint == "" || prepared.Key != "work/"+project+"/audio/"+prepared.Fingerprint+"/processed.wav" || math.Abs(prepared.Duration-duration) > .002 {
		return "", prepared, &audiocleanup.Failure{Message: "Cleaned audio is unavailable. Retry, or turn off noise reduction to use the original."}
	}
	audio, err := p.storyMaterialize(ctx, dir, prepared.Key)
	if err != nil {
		return "", prepared, &audiocleanup.Failure{Message: "Cleaned audio is unavailable. Retry, or use the original."}
	}
	remux := filepath.Join(dir, "cleaned-source.mkv")
	if err = p.ffmpeg(ctx, dir, "-i", source, "-i", audio, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "pcm_s16le", "-t", seconds(duration), remux); err != nil {
		return "", prepared, err
	}
	return remux, prepared, nil
}
