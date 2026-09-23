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
	"strconv"
	"strings"

	"sneepcut/backend-go/internal/story"
)

var _ story.Media = (*Processor)(nil)

type storyProbe struct {
	Duration, Start float64
	Width, Height   int
	Audio           bool
	Warnings        []string
}

// Inspect validates actual container/streams and decodes every packet before an
// upload is accepted. File extensions and browser metadata are never trusted.
func (p *Processor) Inspect(ctx context.Context, key string) (story.Asset, error) {
	dir, err := os.MkdirTemp(p.cfg.TempDir, "story-inspect-")
	if err != nil {
		return story.Asset{}, errors.New("could not prepare media validation")
	}
	defer os.RemoveAll(dir)
	file, err := p.storyMaterialize(ctx, dir, key)
	if err != nil {
		return story.Asset{}, errors.New("uploaded source is unavailable")
	}
	stat, err := os.Stat(file)
	if err != nil || stat.Size() <= 0 || stat.Size() > story.DefaultLimits().MaxFileBytes {
		return story.Asset{}, errors.New("source file exceeds the supported size limit")
	}
	info, err := p.probeStory(ctx, file)
	if err != nil {
		return story.Asset{}, err
	}
	if err = p.decodeStory(ctx, file); err != nil {
		return story.Asset{}, errors.New("source contains damaged or undecodable media")
	}
	input, err := os.Open(file)
	if err != nil {
		return story.Asset{}, errors.New("source could not be read")
	}
	hash := sha256.New()
	_, err = io.Copy(hash, input)
	_ = input.Close()
	if err != nil {
		return story.Asset{}, errors.New("source checksum could not be verified")
	}
	return story.Asset{Key: key, Hash: hex.EncodeToString(hash.Sum(nil)), Size: stat.Size(), Duration: info.Duration, Width: info.Width, Height: info.Height, HasAudio: info.Audio,
		Mapping: story.TimeMap{OriginalStart: info.Start, NormalizedStart: 0, Duration: info.Duration, Rate: 1, Method: "presentation timestamps rebased to zero; CFR frames sampled without changing playback speed"}, Warnings: info.Warnings}, nil
}

func (p *Processor) probeStory(ctx context.Context, file string) (storyProbe, error) {
	data, err := run(ctx, "", p.cfg.FFprobePath, "-v", "error", "-show_streams", "-show_format", "-of", "json", file)
	if err != nil {
		return storyProbe{}, errors.New("source is not a readable video")
	}
	return parseStoryProbe(data)
}

func parseStoryProbe(data []byte) (storyProbe, error) {
	var raw struct {
		Format struct {
			Name     string `json:"format_name"`
			Duration string
			Start    string `json:"start_time"`
		}
		Streams []struct {
			Kind          string `json:"codec_type"`
			Codec         string `json:"codec_name"`
			Width, Height int
			Transfer      string `json:"color_transfer"`
			Rate          string `json:"r_frame_rate"`
			Average       string `json:"avg_frame_rate"`
			Disposition   struct {
				Attached int `json:"attached_pic"`
			}
			Side []struct {
				Rotation float64 `json:"rotation"`
				Kind     string  `json:"side_data_type"`
			} `json:"side_data_list"`
		}
	}
	if json.Unmarshal(data, &raw) != nil {
		return storyProbe{}, errors.New("invalid video metadata")
	}
	if !strings.Contains(","+raw.Format.Name+",", ",mov,") && !strings.Contains(","+raw.Format.Name+",", ",mp4,") {
		return storyProbe{}, errors.New("use an MP4 or MOV video")
	}
	duration, err := strconv.ParseFloat(raw.Format.Duration, 64)
	if err != nil || !finite(duration) || duration <= 0 || duration > story.DefaultLimits().MaxSourceSeconds {
		return storyProbe{}, errors.New("source duration is outside the supported limit")
	}
	start := 0.0
	if raw.Format.Start != "" && raw.Format.Start != "N/A" {
		start, err = strconv.ParseFloat(raw.Format.Start, 64)
		if err != nil || !finite(start) || math.Abs(start) > 86400 {
			return storyProbe{}, errors.New("unsupported source timestamp origin")
		}
	}
	info := storyProbe{Duration: duration, Start: start, Warnings: []string{}}
	videos, audios := 0, 0
	for _, stream := range raw.Streams {
		switch stream.Kind {
		case "video":
			if stream.Disposition.Attached != 0 {
				continue
			}
			videos++
			if stream.Codec != "h264" && stream.Codec != "hevc" {
				return info, errors.New("unsupported video codec; use H.264 or HEVC in MP4/MOV")
			}
			if stream.Transfer == "smpte2084" || stream.Transfer == "arib-std-b67" {
				return info, errors.New("HDR video is not supported yet; export an SDR copy while keeping your original")
			}
			if stream.Width < 16 || stream.Height < 16 || stream.Width > 8192 || stream.Height > 8192 || int64(stream.Width)*int64(stream.Height) > 36_000_000 {
				return info, errors.New("unsupported video dimensions")
			}
			info.Width, info.Height = stream.Width, stream.Height
			for _, side := range stream.Side {
				if strings.Contains(strings.ToLower(side.Kind), "dovi") {
					return info, errors.New("Dolby Vision sources require an SDR export")
				}
				if !finite(side.Rotation) || math.Abs(side.Rotation-math.Round(side.Rotation/90)*90) > .01 {
					return info, errors.New("unsupported display rotation")
				}
				if int(math.Abs(math.Round(side.Rotation)))%180 == 90 {
					info.Width, info.Height = stream.Height, stream.Width
				}
			}
			if stream.Rate != stream.Average {
				info.Warnings = append(info.Warnings, "Variable frame timing is normalized by presentation timestamp, not frame number.")
			}
		case "audio":
			audios++
			switch stream.Codec {
			case "aac", "mp3", "pcm_s16le", "pcm_s24le", "pcm_s32le", "alac":
			default:
				return info, errors.New("unsupported audio codec; export AAC or PCM audio")
			}
			info.Audio = true
		}
	}
	if videos != 1 || audios > 1 {
		return info, errors.New("source must contain one video and at most one audio track")
	}
	return info, nil
}

func (p *Processor) decodeStory(ctx context.Context, file string) error {
	return p.ffmpeg(ctx, "", "-xerror", "-err_detect", "explode", "-i", file, "-map", "0:v:0", "-map", "0:a:0?", "-f", "null", "-")
}

func storyNamespace(id string) bool {
	if len(id) == 0 || len(id) > 100 {
		return false
	}
	for _, r := range id {
		if !(r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '-' || r == '_') {
			return false
		}
	}
	return true
}

func storyDigest(value any) string {
	b, _ := json.Marshal(value)
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

func (p *Processor) storySave(ctx context.Context, file, key, mime string) error {
	if exists, err := p.storage.Exists(ctx, key); err == nil && exists {
		return nil
	}
	if err := p.storage.Save(ctx, file, key, mime); err != nil {
		if exists, e := p.storage.Exists(ctx, key); e == nil && exists {
			return nil
		}
		return errors.New("story artifact could not be saved")
	}
	return nil
}

func storyWorkError(stage string) error { return fmt.Errorf("story %s could not be completed", stage) }
