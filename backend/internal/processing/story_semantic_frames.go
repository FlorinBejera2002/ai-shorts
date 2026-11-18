package processing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"sneepcut/backend-go/internal/aiprovider"
	"sneepcut/backend-go/internal/story"
)

// A broad meaning pass needs three observations per candidate, capped per
// source. Reserve dense action observation for selected candidates afterwards.
// Budget images while retaining the source-count/context bound.
func storySemanticBatchEnd(assets []story.Asset, indexes []int, start int) int {
	end, images := start, 0
	for end < len(indexes) && end-start < 20 {
		frames := storySemanticSampleFrames(assets[indexes[end]])
		if end > start && images+len(frames) > 96 {
			break
		}
		images += len(frames)
		end++
	}
	return end
}

func (p *Processor) storySemanticFrames(ctx context.Context, dir string, assets []story.Asset, musicMoments bool, samplers ...func(story.Asset) []int) ([]aiprovider.MediaPart, map[string]bool, map[string][]float64, error) {
	var parts []aiprovider.MediaPart
	visible := map[string]bool{}
	samples := map[string][]float64{}
	total := 0
	for ai, asset := range assets {
		if asset.Kind == "narration" {
			continue
		}
		frames := storySemanticSampleFrames(asset)
		if musicMoments {
			frames = storyVisualMomentSampleFrames(asset)
		}
		if len(samplers) > 0 {
			frames = samplers[0](asset)
		}
		if len(frames) == 0 {
			continue
		}
		file, err := p.storyMaterialize(ctx, dir, asset.ProxyKey)
		if err != nil {
			return nil, nil, nil, err
		}
		count, err := p.storyProxyFrameCount(ctx, file)
		if err != nil {
			return nil, nil, nil, err
		}
		frames = availableStorySampleFrames(frames, count)
		if len(frames) == 0 {
			continue
		}
		selectFrames := make([]string, len(frames))
		for i, frame := range frames {
			selectFrames[i] = "eq(n," + strconv.Itoa(frame) + ")"
		}
		pattern := filepath.Join(dir, fmt.Sprintf("source-%02d-%%03d.jpg", ai))
		filter := "select='" + strings.Join(selectFrames, "+") + "',scale=w='min(480,iw)':h='min(480,ih)':force_original_aspect_ratio=decrease"
		if err := p.ffmpeg(ctx, dir, "-i", file, "-an", "-vf", filter, "-fps_mode", "vfr", "-frames:v", strconv.Itoa(len(frames)), "-q:v", "5", pattern); err != nil {
			return nil, nil, nil, err
		}
		for i, frame := range frames {
			file := filepath.Join(dir, fmt.Sprintf("source-%02d-%03d.jpg", ai, i+1))
			info, err := os.Stat(file)
			if err != nil || info.Size() > 256<<10 || info.Size() <= 0 || int64(total)+info.Size() > aiprovider.MaxReviewBytes {
				return nil, nil, nil, errors.New("source frames exceed media limit")
			}
			data, err := os.ReadFile(file)
			if err != nil {
				return nil, nil, nil, err
			}
			at := float64(frame) / 30
			var ids []string
			for _, c := range asset.Candidates {
				if at >= c.In-.034 && at <= c.Out {
					ids = append(ids, c.ID)
					visible[c.ID] = true
					if at >= c.In && at < c.Out {
						samples[c.ID] = append(samples[c.ID], at)
					}
				}
			}
			parts = append(parts, aiprovider.MediaPart{MIME: "image/jpeg", Data: data, Label: fmt.Sprintf("Actual source %s frame at %.3f source seconds; candidate intervals: %s. Sparse observation, not full-motion evidence.", asset.ID, at, strings.Join(ids, ", "))})
			total += len(data)
		}
	}
	return parts, visible, samples, aiprovider.ValidateMedia(parts)
}

// Source/container duration can include an audio tail beyond the last video
// frame. Probe the normalized video stream itself before promising image
// evidence. Otherwise one missing final JPEG invalidates every source in a batch.
func (p *Processor) storyProxyFrameCount(ctx context.Context, file string) (int, error) {
	// Match the domain's hard ceiling, not its configurable default duration.
	// Admission already enforces the operator's (possibly larger) source limit.
	const maximumProxySeconds = 86400
	data, err := run(ctx, "", p.cfg.FFprobePath, "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=nb_frames,duration,avg_frame_rate,start_time", "-of", "json", file)
	if err != nil {
		return 0, err
	}
	var raw struct {
		Streams []struct {
			Frames   string `json:"nb_frames"`
			Duration string `json:"duration"`
			Rate     string `json:"avg_frame_rate"`
			Start    string `json:"start_time"`
		}
	}
	if json.Unmarshal(data, &raw) != nil || len(raw.Streams) != 1 {
		return 0, errors.New("source proxy has no readable video stream")
	}
	s := raw.Streams[0]
	start, err := strconv.ParseFloat(s.Start, 64)
	if err != nil || !finite(start) || math.Abs(start) > .0001 || s.Rate != "30/1" {
		return 0, errors.New("source proxy does not have normalized frame timing")
	}
	count, err := strconv.Atoi(s.Frames)
	if err != nil {
		// MP4 normally supplies nb_frames. A video-only duration is a safe
		// fallback for other normalized proxies; never use container duration.
		duration, durationErr := strconv.ParseFloat(s.Duration, 64)
		if durationErr != nil || !finite(duration) || duration <= 0 || duration > maximumProxySeconds {
			return 0, errors.New("source proxy frame count is unavailable")
		}
		count = int(math.Floor(duration*30 + .0001))
	}
	if count <= 0 || count > maximumProxySeconds*30+1 {
		return 0, errors.New("source proxy frame count is outside analysis limits")
	}
	return count, nil
}

func availableStorySampleFrames(requested []int, count int) []int {
	frames := make([]int, 0, len(requested))
	for _, frame := range requested {
		// Skip nonexistent samples rather than substituting a different frame
		// under its label or moving an observation across candidate boundaries.
		if frame >= 0 && frame < count {
			frames = append(frames, frame)
		}
	}
	sort.Ints(frames)
	unique := frames[:0]
	for _, frame := range frames {
		if len(unique) == 0 || unique[len(unique)-1] != frame {
			unique = append(unique, frame)
		}
	}
	return unique
}
