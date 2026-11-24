package youtubeimport

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os/exec"
	"time"
)

// Preview frames only help a person recognise an imported clip, so they stay small.
const (
	previewWidth       = 480
	previewJPEGQuality = "5" // mjpeg -q:v: lower is better quality
	previewTimeout     = 20 * time.Second
	maxPreviewBytes    = 512 << 10
	maxPreviewAttempts = 3
	previewWaitDelay   = 5 * time.Second
)

// previewSeeks are tried in order. One second in skips most black leaders; a
// video shorter than that yields no frame there, so the first frame is the fallback.
var previewSeeks = []string{"1", "0"}

var errPreviewUnavailable = errors.New("YouTube preview extraction is unavailable")
var errPreviewDecode = errors.New("no preview frame could be decoded")
var errPreviewTooLarge = errors.New("preview frame exceeds the size limit")

// Previews stores and signs preview frames next to imported sources. The
// handler uses it when the media adapter also provides it.
type Previews interface {
	StorePreview(ctx context.Context, userID string, jpeg []byte) (string, error)
	PreviewURL(ctx context.Context, key string) (string, error)
	ImportSourceLocation(ctx context.Context, key string) (string, error)
}

// frameRunner executes ffmpeg with the given arguments and returns the stdout bytes.
type frameRunner func(ctx context.Context, args []string) ([]byte, error)

// ExtractPreview returns one JPEG frame of the video at input, using ffmpegPath.
// Input may be a local file or an HTTP(S) URL readable by ffmpeg.
func ExtractPreview(ctx context.Context, ffmpegPath, input string) ([]byte, error) {
	if ffmpegPath == "" {
		return nil, errPreviewUnavailable
	}
	return extractPreview(ctx, input, ffmpegFrameRunner(ffmpegPath))
}

func extractPreview(ctx context.Context, input string, run frameRunner) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, previewTimeout)
	defer cancel()
	lastErr := errPreviewDecode
	for _, seek := range previewSeeks {
		frame, err := run(ctx, previewArgs(input, seek))
		if ctxErr := ctx.Err(); ctxErr != nil {
			return nil, ctxErr
		}
		if err != nil {
			lastErr = err
			continue
		}
		if isJPEG(frame) {
			return frame, nil
		}
	}
	return nil, lastErr
}

// previewArgs builds the ffmpeg command for one frame at seek seconds. Only
// file and HTTP(S) inputs are allowed, and the output is one scaled JPEG on stdout.
func previewArgs(input, seek string) []string {
	return []string{
		"-nostdin", "-hide_banner", "-loglevel", "error", "-nostats",
		"-protocol_whitelist", "file,http,https,tls,tcp",
		"-ss", seek, "-i", input,
		"-map", "0:v:0", "-frames:v", "1", "-an", "-sn", "-dn", "-map_metadata", "-1",
		"-vf", fmt.Sprintf("scale='min(%d,iw)':-2", previewWidth),
		"-q:v", previewJPEGQuality,
		"-f", "mjpeg", "pipe:1",
	}
}

func ffmpegFrameRunner(ffmpegPath string) frameRunner {
	return func(ctx context.Context, args []string) ([]byte, error) {
		output := &limitedBuffer{limit: maxPreviewBytes}
		command := exec.CommandContext(ctx, ffmpegPath, args...)
		command.Stdout = output
		command.Stderr = io.Discard
		command.WaitDelay = previewWaitDelay
		// ffmpeg diagnostics can name local paths or signed URLs, so errors stay generic.
		if err := command.Run(); err != nil {
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}
			if output.overflow {
				return nil, errPreviewTooLarge
			}
			return nil, errPreviewDecode
		}
		return output.Bytes(), nil
	}
}

type limitedBuffer struct {
	bytes.Buffer
	limit    int
	overflow bool
}

func (b *limitedBuffer) Write(p []byte) (int, error) {
	if b.Len()+len(p) > b.limit {
		b.overflow = true
		return 0, errPreviewTooLarge
	}
	return b.Buffer.Write(p)
}

func isJPEG(frame []byte) bool {
	return len(frame) > 3 && frame[0] == 0xff && frame[1] == 0xd8 && frame[2] == 0xff
}

// storePreview extracts a preview from the local file that was just imported.
// Failure never fails the import: the row keeps no key and the backfill retries it.
// The returned attempt count is 1 when extraction failed, 0 otherwise.
func (h *Handler) storePreview(ctx context.Context, work importWork, video ImportedVideo) (string, int) {
	if h.previews == nil {
		return "", 0
	}
	jpeg, err := ExtractPreview(ctx, h.cfg.FFmpegPath, video.Path)
	if err == nil {
		var key string
		if key, err = h.previews.StorePreview(ctx, work.UserID, jpeg); err == nil {
			return key, 0
		}
	}
	slog.Warn("YouTube import preview skipped", "import_id", work.ID)
	return "", 1
}
