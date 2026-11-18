package processing

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"sneepcut/backend-go/internal/aiprovider"
	"sneepcut/backend-go/internal/story"
)

// Bump when the prompt, evidence schema or timing interpretation changes.
const hostedMusicVersion = "hosted-music-2"
const hostedMusicMaxBytes = 8 << 20
const hostedMusicMaxResponse = 512 << 10

var errHostedMusicUnavailable = errors.New("Music analysis could not be completed. Retry, or turn off music sync to continue with the selected soundtrack.")

// analyzeHostedMusic sends only the chosen excerpt to the explicitly configured
// audio model. A failed request never silently substitutes a local detector.
// The compressed analysis copy is temporary; rendering retains the FLAC clock.
func (p *Processor) analyzeHostedMusic(ctx context.Context, dir, key, file string, duration float64) (*story.MusicAnalysis, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	generator, err := aiprovider.ForTask(ctx, p.ai, aiprovider.TaskMusicAnalysis)
	if err != nil {
		return nil, musicProviderError(ctx, err)
	}
	reviewer, ok := generator.(aiprovider.MediaReviewer)
	identity, identified := generator.(aiprovider.MediaModelIdentity)
	if !ok || !identified || identity.MediaModelIdentity() == "" {
		return nil, errHostedMusicUnavailable
	}
	model := identity.MediaModelIdentity()
	hash, err := musicFileDigest(ctx, file)
	if err != nil {
		return nil, err
	}
	cacheIdentity := storyDigest([]any{hostedMusicVersion, model, hash, duration})
	// Keep derivatives under the same private account namespace as the audio.
	cacheKey := key + "." + cacheIdentity + ".json"
	cacheFile := filepath.Join(dir, "hosted-music.json")
	_ = os.Remove(cacheFile) // materialize uses exclusive creation, including retries.
	invalidCache := false
	if p.materialize(ctx, cacheKey, cacheFile) == nil {
		invalidCache = true
		if raw, readErr := readBoundedMusicFile(cacheFile, hostedMusicMaxResponse); readErr == nil {
			var cached story.MusicAnalysis
			if json.Unmarshal(raw, &cached) == nil && cached.Version == hostedMusicVersion && cached.Model == model && cached.Duration == duration && validateHostedMusic(&cached, duration) == nil {
				return &cached, nil
			}
		}
	}
	// 96 kbit/s keeps a maximum ten-minute excerpt below the shared inline
	// request limit, retaining full-band audio instead of an 8 kHz energy trace.
	compressed := filepath.Join(dir, "hosted-music.mp3")
	if err := p.ffmpeg(ctx, dir, "-i", file, "-map", "0:a:0", "-vn", "-t", seconds(duration), "-ar", "44100", "-ac", "2", "-c:a", "libmp3lame", "-b:a", "96k", compressed); err != nil {
		return nil, musicAnalysisError(ctx)
	}
	data, err := readBoundedMusicFile(compressed, hostedMusicMaxBytes)
	if err != nil {
		return nil, musicAnalysisError(ctx)
	}
	if err := story.ReserveAICall(ctx); err != nil {
		return nil, err
	}
	callCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()
	prompt := hostedMusicPrompt + fmt.Sprintf("\nEXCERPT DURATION: %.6f seconds. The supplied audio starts at excerpt time zero. Analyze only this audio; no song title or catalogue metadata is evidence.", duration)
	raw, err := reviewer.ReviewMedia(callCtx, prompt, []aiprovider.MediaPart{{Label: "Selected music excerpt, timestamp origin 0 seconds", MIME: "audio/mpeg", Data: data}})
	if err != nil {
		return nil, musicProviderError(ctx, err)
	}
	analysis, err := decodeHostedMusic(raw, duration)
	if err != nil {
		return nil, errHostedMusicUnavailable
	}
	analysis.Version, analysis.Model = hostedMusicVersion, model
	if encoded, err := json.Marshal(analysis); err == nil && os.WriteFile(cacheFile, encoded, 0600) == nil {
		if invalidCache {
			// Only replace this analyzer's invalid derived evidence, never audio.
			_ = p.storage.Delete(ctx, cacheKey)
		}
		// Caching is best effort. A storage error cannot invalidate an otherwise
		// validated response, and invalid responses never become cache entries.
		_ = p.storySave(ctx, cacheFile, cacheKey, "application/json")
	}
	return analysis, nil
}

func musicAnalysisError(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	return errHostedMusicUnavailable
}

func musicProviderError(ctx context.Context, cause error) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if safe := aiprovider.SafeFailure(cause); safe != nil {
		return fmt.Errorf("%w: %w", errHostedMusicUnavailable, safe)
	}
	return errHostedMusicUnavailable
}

func readBoundedMusicFile(file string, maximum int64) ([]byte, error) {
	f, err := os.Open(file)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, maximum+1))
	if err != nil || len(data) == 0 || int64(len(data)) > maximum {
		return nil, errors.New("music analysis input exceeds its limit")
	}
	return data, nil
}

// Hash bytes, not a storage key: replacing an upload under the same key must
// invalidate both the decoded excerpt and its hosted evidence. Memory is bounded.
func musicFileDigest(ctx context.Context, file string) (string, error) {
	f, err := os.Open(file)
	if err != nil {
		return "", storyWorkError("music analysis")
	}
	defer f.Close()
	hash := sha256.New()
	buffer := make([]byte, 64<<10)
	for {
		if err := ctx.Err(); err != nil {
			return "", err
		}
		n, err := f.Read(buffer)
		if n > 0 {
			_, _ = hash.Write(buffer[:n])
		}
		if err == io.EOF {
			return hex.EncodeToString(hash.Sum(nil)), nil
		}
		if err != nil {
			return "", storyWorkError("music analysis")
		}
	}
}
