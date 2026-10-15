package processing

import (
	"context"
	"errors"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"time"
)

const storyPreviewMaxBytes int64 = 512 << 20

// Browser playback is intentionally independent of the HEVC HDR download.
// Bound runtime, dimensions, bitrate, duration and bytes, and reject truncated
// output instead of publishing a preview that stops before the accepted story.
func (p *Processor) prepareStoryHDRPreview(ctx context.Context, dir, output string, duration float64) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, min(10*time.Minute, max(2*time.Minute, time.Duration(duration*4)*time.Second)))
	defer cancel()
	preview := filepath.Join(dir, "preview.mp4")
	args := []string{"-i", output, "-vf", storyColorFilter("smpte2084") + "scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2"}
	args = append(args, delivery...)
	args = append(args, "-maxrate", "6M", "-bufsize", "12M", "-t", seconds(duration), "-fs", strconv.FormatInt(storyPreviewMaxBytes, 10), preview)
	if err := p.ffmpeg(ctx, dir, args...); err != nil {
		return "", storyWorkError("browser preview")
	}
	info, err := p.probe(ctx, preview)
	if err != nil || math.Abs(info.Duration-duration) > .12 {
		return "", errors.New("browser preview duration does not match the accepted story")
	}
	stat, err := os.Stat(preview)
	if err != nil || stat.Size() <= 0 || stat.Size() > storyPreviewMaxBytes {
		return "", errors.New("browser preview exceeds the supported size")
	}
	return preview, nil
}
