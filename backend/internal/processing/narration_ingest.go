package processing

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"sneepcut/backend-go/internal/story"
)

// InspectNarration checks actual streams and decoded samples. MediaRecorder
// WebM need not have a duration header; decoded PCM is the authoritative clock.
func (p *Processor) InspectNarration(ctx context.Context, key string) (story.Asset, error) {
	ctx, cancel := context.WithTimeout(ctx, 3*time.Minute)
	defer cancel()
	if size, err := p.storage.Size(ctx, key); err != nil || size <= 0 || size > story.MaxNarrationBytes {
		return story.Asset{}, errors.New("narration exceeds the supported audio size limit")
	}
	dir, err := os.MkdirTemp(p.cfg.TempDir, "narration-inspect-")
	if err != nil {
		return story.Asset{}, errors.New("could not prepare narration validation")
	}
	defer os.RemoveAll(dir)
	file, err := p.storyMaterialize(ctx, dir, key)
	if err != nil {
		return story.Asset{}, errors.New("uploaded narration is unavailable")
	}
	info, err := os.Stat(file)
	if err != nil || info.Size() <= 0 || info.Size() > story.MaxNarrationBytes {
		return story.Asset{}, errors.New("narration exceeds the supported audio size limit")
	}
	raw, err := run(ctx, dir, p.cfg.FFprobePath, "-v", "error", "-show_streams", "-show_format", "-of", "json", file)
	if err != nil {
		return story.Asset{}, errors.New("narration is not readable audio")
	}
	start, err := parseNarrationProbe(raw)
	if err != nil {
		return story.Asset{}, err
	}
	_, duration, _, err := p.normalizeNarration(ctx, dir, file)
	if err != nil {
		return story.Asset{}, err
	}
	f, err := os.Open(file)
	if err != nil {
		return story.Asset{}, errors.New("narration checksum is unavailable")
	}
	hash := sha256.New()
	_, err = io.Copy(hash, f)
	_ = f.Close()
	if err != nil {
		return story.Asset{}, errors.New("narration checksum is unavailable")
	}
	return story.Asset{Kind: "narration", Key: key, Hash: hex.EncodeToString(hash.Sum(nil)), Size: info.Size(), Duration: duration, HasAudio: true,
		Mapping: story.TimeMap{OriginalStart: start, NormalizedStart: 0, Duration: duration, Rate: 1, Method: "decoded audio sample clock rebased to zero; original voice retained continuously"}}, nil
}

func parseNarrationProbe(raw []byte) (float64, error) {
	var doc struct {
		Format struct {
			Name     string `json:"format_name"`
			Duration string
			Start    string `json:"start_time"`
		}
		Streams []struct {
			Kind     string `json:"codec_type"`
			Codec    string `json:"codec_name"`
			Channels int
			Rate     string `json:"sample_rate"`
		}
	}
	if json.Unmarshal(raw, &doc) != nil || len(doc.Streams) != 1 || doc.Streams[0].Kind != "audio" {
		return 0, errors.New("narration must contain one audio track and no video")
	}
	stream := doc.Streams[0]
	rate, err := strconv.Atoi(stream.Rate)
	if err != nil || rate < 8000 || rate > 192000 || stream.Channels < 1 || stream.Channels > 2 {
		return 0, errors.New("narration has unsupported audio channels or sample rate")
	}
	allowed := false
	for _, format := range strings.Split(doc.Format.Name, ",") {
		switch format {
		case "webm", "matroska", "ogg":
			allowed = allowed || stream.Codec == "opus" || stream.Codec == "vorbis"
		case "mov", "mp4", "m4a":
			allowed = allowed || stream.Codec == "aac"
		case "mp3":
			allowed = allowed || stream.Codec == "mp3"
		case "wav":
			allowed = allowed || stream.Codec == "pcm_s16le" || stream.Codec == "pcm_s24le" || stream.Codec == "pcm_s32le" || stream.Codec == "pcm_f32le" || stream.Codec == "pcm_f64le"
		}
	}
	if !allowed {
		return 0, errors.New("use WebM/Ogg Opus, M4A AAC, MP3 or WAV narration")
	}
	if doc.Format.Duration != "" && doc.Format.Duration != "N/A" {
		duration, err := strconv.ParseFloat(doc.Format.Duration, 64)
		if err != nil || !finite(duration) || duration <= 0 || duration > story.MaxNarrationSeconds+.05 {
			return 0, errors.New("narration exceeds the supported duration")
		}
	}
	start := 0.0
	if doc.Format.Start != "" && doc.Format.Start != "N/A" {
		start, err = strconv.ParseFloat(doc.Format.Start, 64)
		if err != nil || !finite(start) || math.Abs(start) > 86400 {
			return 0, errors.New("narration has an invalid timestamp origin")
		}
	}
	return start, nil
}

func (p *Processor) normalizeNarration(ctx context.Context, dir, source string) (string, float64, float64, error) {
	pcm := filepath.Join(dir, "narration.pcm")
	if err := p.ffmpeg(ctx, dir, "-xerror", "-err_detect", "explode", "-i", source, "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "48000", "-af", "aresample=48000:async=1:first_pts=0", "-t", seconds(story.MaxNarrationSeconds+.1), "-f", "s16le", "-c:a", "pcm_s16le", pcm); err != nil {
		return "", 0, 0, errors.New("narration contains damaged or undecodable audio")
	}
	stat, err := os.Stat(pcm)
	if err != nil || stat.Size() < 960 || stat.Size()%2 != 0 {
		return "", 0, 0, errors.New("narration contains no usable audio")
	}
	duration := float64(stat.Size()) / 96000
	if duration > story.MaxNarrationSeconds {
		return "", 0, 0, errors.New("narration exceeds the supported duration")
	}
	f, err := os.Open(pcm)
	if err != nil {
		return "", 0, 0, storyWorkError("narration normalization")
	}
	defer f.Close()
	buffer := make([]byte, 96000)
	energy, samples := 0.0, 0
	for {
		n, readErr := f.Read(buffer)
		for i := 0; i+1 < n; i += 2 {
			v := float64(int16(binary.LittleEndian.Uint16(buffer[i:i+2]))) / 32768
			energy += v * v
			samples++
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil || ctx.Err() != nil {
			return "", 0, 0, storyWorkError("narration normalization")
		}
	}
	if _, err = f.Seek(0, io.SeekStart); err != nil {
		return "", 0, 0, storyWorkError("narration normalization")
	}
	wav := filepath.Join(dir, "narration.wav")
	out, err := os.Create(wav)
	if err != nil {
		return "", 0, 0, storyWorkError("narration normalization")
	}
	header := make([]byte, 44)
	copy(header, "RIFF")
	binary.LittleEndian.PutUint32(header[4:], uint32(36+stat.Size()))
	copy(header[8:], "WAVEfmt ")
	binary.LittleEndian.PutUint32(header[16:], 16)
	binary.LittleEndian.PutUint16(header[20:], 1)
	binary.LittleEndian.PutUint16(header[22:], 1)
	binary.LittleEndian.PutUint32(header[24:], 48000)
	binary.LittleEndian.PutUint32(header[28:], 96000)
	binary.LittleEndian.PutUint16(header[32:], 2)
	binary.LittleEndian.PutUint16(header[34:], 16)
	copy(header[36:], "data")
	binary.LittleEndian.PutUint32(header[40:], uint32(stat.Size()))
	_, err = out.Write(header)
	if err == nil {
		_, err = io.Copy(out, f)
	}
	closeErr := out.Close()
	if err != nil || closeErr != nil {
		return "", 0, 0, storyWorkError("narration normalization")
	}
	return wav, duration, math.Sqrt(energy / float64(samples)), nil
}
