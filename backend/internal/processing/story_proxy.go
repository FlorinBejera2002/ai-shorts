package processing

import (
	"context"
	"errors"
	"path/filepath"

	"sneepcut/backend-go/internal/story"
)

// Video normalization does not depend on the speech model or language. Keep its
// immutable cache separate so changing either only repeats speech analysis.
func (p *Processor) prepareStoryProxy(ctx context.Context, dir, project string, asset *story.Asset, options story.Options) (string, error) {
	digest := storyDigest([]any{asset.Hash, asset.ColorTransfer, options.Narration, "source-proxy-1"})
	asset.ProxyKey = "work/" + project + "/source-media/" + asset.ID + "/" + digest + "/proxy.mp4"
	proxy := filepath.Join(dir, "proxy.mp4")
	if p.materialize(ctx, asset.ProxyKey, proxy) == nil {
		return proxy, nil
	}
	source, err := p.storyMaterialize(ctx, dir, asset.Key)
	if err != nil {
		return "", errors.New("source is no longer available")
	}
	// Preserve the shared presentation clock and fill genuine audio gaps.
	// Neither frame sampling nor audio resampling changes playback speed.
	filter := storyColorFilter(asset.ColorTransfer) + storySquarePixelsFilter + ",scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30:start_time=0,setsar=1"
	args := []string{"-i", source, "-map", "0:v:0", "-vf", filter}
	if options.Narration {
		args = append(args, "-an")
	} else {
		args = append(args, "-map", "0:a:0?", "-af", "aresample=48000:async=1:first_pts=0")
	}
	args = append(args, delivery...)
	args = append(args, "-t", seconds(asset.Duration), "-map_metadata", "-1", proxy)
	if p.ffmpeg(ctx, dir, args...) != nil {
		return "", storyWorkError("source normalization")
	}
	if err = p.storySave(ctx, proxy, asset.ProxyKey, "video/mp4"); err != nil {
		return "", err
	}
	return proxy, nil
}
