package processing

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
)

// Keep full originals for retrimming, but never copy a 10 GB source into each
// Studio project. Small sources retain their existing full-source workflow.
const studioWindowThreshold int64 = 256 << 20

func studioWindowBounds(segment Segment, duration float64) (float64, float64, float64) {
	start, end := max(0, segment.Start-.25), min(duration, segment.End+.25)
	return start, end - start, segment.Start - start
}

func (p *Processor) studioSourceWindow(ctx context.Context, dir, source, audioKey string, in RenderInput, plan *studioPlan, info probeInfo, segment Segment, index int) (videoID, audioID string, sourceIn float64, err error) {
	start, duration, sourceIn := studioWindowBounds(segment, info.Duration)
	file := filepath.Join(dir, fmt.Sprintf("studio-window-%d.mp4", index))
	color := ""
	if details, e := p.probeStory(ctx, source); e == nil {
		color = storyColorFilter(details.ColorTransfer)
	}
	// Accurate seek, original dimensions, browser-compatible codecs. No resize or
	// frame-rate cap: 4K sources retain their resolution in the editable project.
	filter := color + "scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1"
	err = p.ffmpeg(ctx, dir, "-ss", seconds(start), "-i", source, "-t", seconds(duration), "-map", "0:v:0", "-map", "0:a:0?", "-vf", filter, "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-maxrate", "40M", "-bufsize", "80M", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-af", "aresample=48000:async=1:first_pts=0", "-movflags", "+faststart", "-map_metadata", "-1", file)
	if err != nil {
		return
	}
	if err = checkStudioWindowBudget(dir); err != nil {
		return
	}
	key := fmt.Sprintf("work/%s/studio-windows/%d.mp4", in.Namespace, index)
	if err = p.storage.Save(ctx, file, key, "video/mp4"); err != nil {
		return
	}
	if videoID, err = p.studioAsset(ctx, plan, key, "video"); err != nil {
		return
	}
	asset := &plan.Assets[len(plan.Assets)-1]
	asset.Duration, asset.Width, asset.Height, asset.HasAudio = duration, info.Width/2*2, info.Height/2*2, info.Audio
	if !info.Audio {
		return
	}
	audioID = videoID
	if audioKey == in.SourceKey {
		return
	}
	var audioSource string
	if audioSource, err = p.storyMaterialize(ctx, dir, audioKey); err != nil {
		return
	}
	audioFile := filepath.Join(dir, fmt.Sprintf("studio-window-%d.wav", index))
	if err = p.ffmpeg(ctx, dir, "-ss", seconds(start), "-i", audioSource, "-t", seconds(duration), "-vn", "-c:a", "pcm_s16le", audioFile); err != nil {
		return
	}
	if err = checkStudioWindowBudget(dir); err != nil {
		return
	}
	audioKey = fmt.Sprintf("work/%s/studio-windows/%d.wav", in.Namespace, index)
	if err = p.storage.Save(ctx, audioFile, audioKey, "audio/wav"); err != nil {
		return
	}
	if audioID, err = p.studioAsset(ctx, plan, audioKey, "audio"); err != nil {
		return
	}
	studioAudioMetadata(plan, audioID, duration)
	return
}

// Verify before a composition is handed to Studio. This protects its project
// budget even for unusually long manual selections of a large source.
func checkStudioWindowBudget(dir string) error {
	files, err := filepath.Glob(filepath.Join(dir, "studio-window-*"))
	if err != nil {
		return err
	}
	var total int64
	for _, file := range files {
		stat, e := os.Stat(file)
		if e != nil {
			return e
		}
		total += stat.Size()
	}
	if total > 1536<<20 {
		return fmt.Errorf("selected footage exceeds the Studio project budget; choose shorter clips")
	}
	return nil
}
