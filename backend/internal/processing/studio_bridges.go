package processing

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Motion interpolation prepares only the replacement frames. The Studio scene
// graph owns their placement and keeps source audio, captions and branding live.
func (p *Processor) studioNaturalBridges(ctx context.Context, dir, source string, in RenderInput, plan *studioPlan, decisions []BoundaryDecision) error {
	for i := range decisions {
		d := &decisions[i]
		if d.Score >= .84 || in.Segments[i].End-in.Segments[i].Start < .5 || in.Segments[i+1].End-in.Segments[i+1].Start < .5 || !p.approveBridge(ctx, *d, in.Transcript.Words) {
			continue
		}
		left, right := plan.Scenes[i], plan.Scenes[i+1]
		bridge, err := p.studioBridgeFrames(ctx, dir, source, plan, left, right)
		if err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			d.Reason += "; interpolation rejected, retained cut"
			continue
		}
		key := "work/" + strings.Split(in.Namespace, "/")[0] + "/studio-bridges/" + storyDigest([]any{in.SourceKey, left, right, plan.Width, plan.Height, "motion-bridge-1"}) + ".mp4"
		if err = p.storySave(ctx, bridge, key, "video/mp4"); err != nil {
			return err
		}
		id, err := p.studioAsset(ctx, plan, key, "video")
		if err != nil {
			return err
		}
		asset := &plan.Assets[len(plan.Assets)-1]
		asset.Duration, asset.Width, asset.Height = .2, plan.Width, plan.Height
		studioAttachBridge(plan, i, id)
		d.Strategy = "interpolated_bridge"
		d.Reason = "AI-selected local motion interpolation passed continuity checks; source audio retained"
		// Retain the existing conservative limit of one bridge per montage.
		break
	}
	return ctx.Err()
}

func (p *Processor) studioBridgeFrames(ctx context.Context, dir, source string, plan *studioPlan, left, right studioScene) (string, error) {
	work, err := os.MkdirTemp(dir, "studio-bridge-")
	if err != nil {
		return "", err
	}
	color := ""
	if info, err := p.probeStory(ctx, source); err == nil {
		color = storyColorFilter(info.ColorTransfer)
	}
	for i, endpoint := range []struct {
		scene studioScene
		local float64
	}{{left, left.Duration - .1}, {right, .1}} {
		file := filepath.Join(work, fmt.Sprintf("frame-%d.png", i*2))
		filter := studioBridgeFrameFilter(endpoint.scene, endpoint.local, plan.Width, plan.Height)
		if color != "" {
			filter = color + filter
		}
		if err = p.ffmpeg(ctx, work, "-ss", seconds(endpoint.scene.SourceIn+endpoint.local), "-i", source, "-vf", filter, "-frames:v", "1", file); err != nil {
			return "", err
		}
		if err = copyFile(file, filepath.Join(work, fmt.Sprintf("frame-%d.png", i*2+1))); err != nil {
			return "", err
		}
	}
	output := filepath.Join(work, "bridge.mp4")
	filter := "minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1:scd=none,trim=start=0.2:end=0.4,setpts=PTS-STARTPTS,format=yuv420p"
	if err = p.ffmpeg(ctx, work, "-framerate", "5", "-i", filepath.Join(work, "frame-%d.png"), "-vf", filter, "-an", "-c:v", "libx264", "-crf", "18", output); err != nil {
		return "", err
	}
	raw, err := run(ctx, work, p.cfg.FFmpegPath, "-v", "error", "-i", output, "-vf", "scale=64:36", "-an", "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1")
	if err != nil || !bridgeQuality(raw) {
		return "", fmt.Errorf("interpolation did not pass continuity checks")
	}
	return output, nil
}

func studioBridgeFrameFilter(scene studioScene, at float64, width, height int) string {
	crop := scene.Crop
	for _, frame := range scene.CropKeyframes {
		if frame.Time > at {
			break
		}
		value := frame.studioCrop
		crop = &value
	}
	filter := ""
	if crop != nil {
		filter = fmt.Sprintf("crop=%s:%s:%s:%s,", seconds(crop.Width), seconds(crop.Height), seconds(crop.X), seconds(crop.Y))
	}
	if scene.Fit == "contain" {
		return filter + fmt.Sprintf("scale=%d:%d:force_original_aspect_ratio=decrease,pad=%d:%d:(ow-iw)/2:(oh-ih)/2,setsar=1", width, height, width, height)
	}
	return filter + fmt.Sprintf("scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d,setsar=1", width, height, width, height)
}

func studioAttachBridge(plan *studioPlan, index int, assetID string) {
	left, right := plan.Scenes[index], plan.Scenes[index+1]
	plan.Scenes = append(plan.Scenes,
		studioScene{ID: "bridge-" + left.ID + "-out", AssetID: assetID, Role: "bridge", ParentSceneID: left.ID, Start: studioRound(left.Start + left.Duration - .1), Duration: .1, Fit: "contain"},
		studioScene{ID: "bridge-" + right.ID + "-in", AssetID: assetID, Role: "bridge", ParentSceneID: right.ID, Start: right.Start, Duration: .1, SourceIn: .1, Fit: "contain"},
	)
}
