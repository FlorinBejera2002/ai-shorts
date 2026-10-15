package processing

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path"
	"path/filepath"
	"time"

	"sneepcut/backend-go/internal/story"
)

var storyTranscriptAlignmentArguments = []string{"-ojf", "-sow", "-ml", "1", "--max-context", "0", "--no-speech-thold", "0.6", "-t", "2", "--dtw", "large.v3.turbo", "--no-flash-attn"}

type storyTranscriptAlignmentEvidence struct {
	Version    string          `json:"version"`
	SourceHash string          `json:"source_hash"`
	Duration   float64         `json:"duration"`
	Raw        json.RawMessage `json:"raw"`
}

// The DTW heads must match the actual installed model, including after an
// administrator changes the transcription route. A filename is insufficient.
func storyAlignmentModelSupported(file string) bool {
	f, err := os.Open(file)
	if err != nil {
		return false
	}
	defer f.Close()
	var data [48]byte
	if _, err := io.ReadFull(f, data[:]); err != nil {
		return false
	}
	var header [12]uint32
	for i := range header {
		header[i] = binary.LittleEndian.Uint32(data[i*4:])
	}
	return header[0] == 0x67676d6c && header[1] == 51866 && header[2] == 1500 && header[3] == 1280 && header[4] == 20 && header[5] == 32 && header[6] == 448 && header[7] == 1280 && header[8] == 20 && header[9] == 4 && header[10] == 128
}

func storyTranscriptAlignmentKey(asset story.Asset, model, binaryPath, language string) (string, string) {
	version := storyDigest([]any{storyTranscriptAlignmentVersion, asset.Hash, asset.ProxyKey, asset.Duration, storyModelSignature(model), storyModelSignature(binaryPath), language, storyTranscriptAlignmentArguments})
	return path.Dir(asset.ProxyKey) + "/transcript-alignment-" + version + ".json", version
}

func (p *Processor) recoverStoryTranscriptTiming(ctx context.Context, dir string, asset story.Asset, options story.Options, intervals []Segment, audio storyPreparedAudio, model string) (story.Asset, error) {
	needed := false
	for _, proposal := range asset.TranscriptProposals {
		needed = needed || (!proposal.TimingVerified && !proposal.Reviewed)
	}
	if !needed || asset.Kind == "narration" || asset.Duration > 60 || !asset.HasAudio || !storyAlignmentModelSupported(model) {
		return asset, nil
	}
	language := options.Language
	if language == "" {
		language = "auto"
	}
	key, version := storyTranscriptAlignmentKey(asset, model, p.cfg.WhisperPath, language)
	asset.AnalysisVersion = storyDigest([]any{asset.AnalysisVersion, version})
	raw, err := p.storyTranscriptAlignment(ctx, dir, asset, model, language, key, version, audio)
	if ctx.Err() != nil {
		return asset, ctx.Err()
	}
	if err != nil {
		return asset, nil
	}
	words, confidence, err := alignedStoryTranscript(raw, intervals, asset.Duration)
	if err != nil {
		return asset, nil
	}
	return applyStoryTranscriptAlignment(asset, words, confidence, intervals), nil
}

func (p *Processor) storyTranscriptAlignment(ctx context.Context, dir string, asset story.Asset, model, language, key, version string, audio storyPreparedAudio) ([]byte, error) {
	invalid := errors.New("independent transcript alignment is unavailable")
	file := filepath.Join(dir, "transcript-alignment.json")
	if p.materialize(ctx, key, file) == nil {
		data, err := os.ReadFile(file)
		var cached storyTranscriptAlignmentEvidence
		if err == nil && len(data) <= 8<<20 && json.Unmarshal(data, &cached) == nil && cached.Version == version && cached.SourceHash == asset.Hash && cached.Duration == asset.Duration && len(cached.Raw) > 0 {
			return cached.Raw, nil
		}
	}
	work, err := os.MkdirTemp(dir, "transcript-alignment-")
	if err != nil {
		return nil, invalid
	}
	defer os.RemoveAll(work)
	limited, cancel := context.WithTimeout(ctx, 3*time.Minute)
	defer cancel()
	wav := audio.file
	if !audio.matches(asset.ProxyKey, dir) {
		proxy, err := p.storyMaterialize(limited, work, asset.ProxyKey)
		if err != nil {
			return nil, invalid
		}
		wav = filepath.Join(work, "audio.wav")
		if p.ffmpeg(limited, work, "-i", proxy, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav) != nil {
			return nil, invalid
		}
	}
	output := filepath.Join(work, "aligned")
	args := []string{"-m", model, "-f", wav, "-l", language, "-of", output}
	args = append(args, storyTranscriptAlignmentArguments...)
	if _, err := run(limited, work, p.cfg.WhisperPath, args...); err != nil {
		return nil, invalid
	}
	info, err := os.Stat(output + ".json")
	if err != nil || info.Size() > 8<<20 {
		return nil, invalid
	}
	raw, err := os.ReadFile(output + ".json")
	if err != nil || !json.Valid(raw) {
		return nil, invalid
	}
	data, err := json.Marshal(storyTranscriptAlignmentEvidence{Version: version, SourceHash: asset.Hash, Duration: asset.Duration, Raw: raw})
	if err != nil || os.WriteFile(file, data, 0600) != nil {
		return nil, invalid
	}
	if err := p.storySave(ctx, file, key, "application/json"); err != nil {
		return nil, invalid
	}
	return raw, nil
}
