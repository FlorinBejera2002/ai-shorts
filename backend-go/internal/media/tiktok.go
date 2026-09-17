package media

import (
	"context"
	"encoding/json"
	"errors"
	"image"
	"io"
	"math"
	"net/http"
	"os"
	"os/exec"
	"path"
	"strconv"
	"strings"
	"time"
)

// TikTokPublishingKey keeps JPEG and WebP originals and uses the existing JPEG
// copy for PNG. Instagram's separate 8 MB limit must never apply here.
func (s *Service) TikTokPublishingKey(ctx context.Context, reference string) (string, error) {
	key, err := s.KeyFromReference(reference)
	if err != nil {
		return "", err
	}
	suffix := strings.ToLower(path.Ext(key))
	isImage := publishingImageExtensions[suffix]
	if isImage {
		parts := strings.Split(key, "/")
		if len(parts) != 3 || parts[0] != "publishing" || !uuidPattern.MatchString(parts[1]) {
			return "", ErrInvalidKey
		}
		if suffix == ".png" {
			key = instagramImageKey(key)
		}
	} else if suffix != ".mp4" && suffix != ".mov" && suffix != ".webm" {
		return "", failure(400, "TikTok videos must use MP4, MOV or WebM")
	}
	exists, err := s.Storage.Exists(ctx, key)
	if err != nil {
		return "", err
	}
	if !exists {
		return "", failure(400, "Upload this media again to prepare it for TikTok")
	}
	size, err := s.Storage.Size(ctx, key)
	if err != nil {
		return "", err
	}
	if size <= 0 {
		return "", failure(400, "TikTok media must not be empty")
	}
	if isImage {
		if size > 20*1024*1024 {
			return "", failure(400, "TikTok photos must be at most 20 MB each")
		}
		metadata, err := s.probePublishingMedia(ctx, key)
		if err != nil {
			return "", err
		}
		if len(metadata.Streams) != 1 {
			return "", failure(400, "TikTok photo could not be inspected")
		}
		photo := metadata.Streams[0]
		if photo.CodecName != "mjpeg" && photo.CodecName != "webp" {
			return "", failure(400, "TikTok photos must use JPEG or WebP")
		}
		// Interpret 1080p in either orientation: 1920x1080 or 1080x1920.
		if photo.Width < 1 || photo.Height < 1 || min(photo.Width, photo.Height) > 1080 || max(photo.Width, photo.Height) > 1920 {
			return "", failure(400, "TikTok photos must fit within 1920 × 1080 or 1080 × 1920 pixels")
		}
	} else if size > MaxPublishingUploadBytes {
		return "", failure(400, "TikTok videos must be at most 4 GB")
	}
	return key, nil
}

type publishingStream struct {
	CodecName string `json:"codec_name"`
	Width     int    `json:"width"`
	Height    int    `json:"height"`
	FrameRate string `json:"avg_frame_rate"`
	Duration  string `json:"duration"`
}

type publishingProbe struct {
	Streams []publishingStream `json:"streams"`
	Format  struct {
		Duration string `json:"duration"`
	} `json:"format"`
}

// PublishingVideoDuration reads stored media, never browser metadata. The
// caller compares this duration with TikTok's current creator-specific limit.
func (s *Service) PublishingVideoDuration(ctx context.Context, reference string) (float64, error) {
	metadata, err := s.probePublishingMedia(ctx, reference)
	if err != nil {
		return 0, err
	}
	if len(metadata.Streams) != 1 {
		return 0, failure(400, "TikTok requires a readable video stream")
	}
	video := metadata.Streams[0]
	switch video.CodecName {
	case "h264", "hevc", "vp8", "vp9":
	default:
		return 0, failure(400, "TikTok videos must use H.264, H.265, VP8 or VP9")
	}
	if video.Width < 360 || video.Height < 360 || video.Width > 4096 || video.Height > 4096 {
		return 0, failure(400, "TikTok video width and height must each be between 360 and 4096 pixels")
	}
	rateParts := strings.Split(video.FrameRate, "/")
	rate, _ := strconv.ParseFloat(rateParts[0], 64)
	if len(rateParts) == 2 {
		denominator, _ := strconv.ParseFloat(rateParts[1], 64)
		rate /= denominator
	}
	if math.IsNaN(rate) || math.IsInf(rate, 0) || rate < 23 || rate > 60 {
		return 0, failure(400, "TikTok video frame rate must be between 23 and 60 FPS")
	}
	duration, err := strconv.ParseFloat(metadata.Format.Duration, 64)
	if err != nil {
		duration, err = strconv.ParseFloat(video.Duration, 64)
	}
	if err != nil || math.IsNaN(duration) || math.IsInf(duration, 0) || duration <= 0 {
		return 0, failure(400, "Video duration could not be determined from the uploaded file")
	}
	return duration, nil
}

func (s *Service) probePublishingMedia(ctx context.Context, reference string) (publishingProbe, error) {
	source, err := s.WorkerSource(ctx, reference)
	if err != nil {
		return publishingProbe{}, err
	}
	probe := s.probe
	if probe == nil {
		probe = runPublishingProbe
		if publishingImageExtensions[strings.ToLower(path.Ext(reference))] {
			probe = inspectPublishingPhoto
		}
	}
	return probe(ctx, source)
}

// Read only the photo header instead of starting a subprocess for every photo
// in a carousel. The upload path already fully decodes and scans images.
func inspectPublishingPhoto(ctx context.Context, source string) (publishingProbe, error) {
	var input io.ReadCloser
	if strings.HasPrefix(source, "http://") || strings.HasPrefix(source, "https://") {
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, source, nil)
		if err != nil {
			return publishingProbe{}, err
		}
		client := &http.Client{Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
		response, err := client.Do(request)
		if err != nil {
			return publishingProbe{}, failure(503, "Media inspection is temporarily unavailable")
		}
		if response.StatusCode != http.StatusOK {
			response.Body.Close()
			return publishingProbe{}, failure(503, "Media inspection is temporarily unavailable")
		}
		input = response.Body
	} else {
		file, err := os.Open(source)
		if err != nil {
			return publishingProbe{}, failure(400, "Uploaded photo could not be inspected")
		}
		input = file
	}
	defer input.Close()
	config, format, err := image.DecodeConfig(io.LimitReader(input, 20*1024*1024+1))
	if err != nil {
		return publishingProbe{}, failure(400, "Uploaded photo could not be inspected")
	}
	codec := format
	if format == "jpeg" {
		codec = "mjpeg"
	}
	var result publishingProbe
	// A shared representation keeps the resolver independent of storage type.
	result.Streams = append(result.Streams, publishingStream{CodecName: codec, Width: config.Width, Height: config.Height})
	return result, nil
}

func runPublishingProbe(ctx context.Context, source string) (publishingProbe, error) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "ffprobe", "-v", "error", "-protocol_whitelist", "file,http,https,tcp,tls", "-format_whitelist", "mov,mp4,m4a,3gp,3g2,mj2,matroska,webm,jpeg_pipe,webp_pipe", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height,avg_frame_rate,duration:format=duration", "-of", "json", source)
	output, err := cmd.Output()
	if err != nil {
		if errors.Is(err, exec.ErrNotFound) || ctx.Err() != nil {
			return publishingProbe{}, failure(503, "Media inspection is temporarily unavailable")
		}
		return publishingProbe{}, failure(400, "Uploaded media could not be inspected")
	}
	var result publishingProbe
	if err := json.Unmarshal(output, &result); err != nil {
		return publishingProbe{}, failure(400, "Uploaded media could not be inspected")
	}
	return result, nil
}
