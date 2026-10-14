package processing

import (
	"context"
	"os"
	"os/exec"
	"regexp"
	"sneepcut/backend-go/internal/story"
	"strconv"
	"time"
)

var silenceMarker = regexp.MustCompile("silence_(start|end): ([0-9.]+)")

// TightenStoryPace trims only digitally quiet lead-ins/tails confirmed by FFmpeg.
// Keep 200 ms of breathing room, every aligned word and all internal pauses. Work
// is sequential and bounded by the existing job deadline; originals are immutable.
func (p *Processor) TightenStoryPace(ctx context.Context, req story.Request, plan story.Plan) (story.Plan, error) {
	dir, err := os.MkdirTemp(p.cfg.TempDir, "story-pace-")
	if err != nil {
		return plan, err
	}
	defer os.RemoveAll(dir)
	plan.Blocks = append([]story.Block(nil), plan.Blocks...)
	for i, block := range plan.Blocks {
		if err := ctx.Err(); err != nil {
			return plan, err
		}
		var source story.Asset
		var candidate story.Candidate
		for _, asset := range req.Assets {
			for _, c := range asset.Candidates {
				if c.ID == block.CandidateID {
					source, candidate = asset, c
				}
			}
		}
		if !source.HasAudio || !story.PaceEligible(block, candidate) {
			continue
		}
		file, err := p.storyMaterialize(ctx, dir, source.Key)
		if err != nil {
			return plan, err
		}
		start, end := candidate.In, candidate.Out
		if block.Pace != nil {
			start, end = block.Pace.In, block.Pace.Out
		}
		raw, err := paceDetection(ctx, dir, p.cfg.FFmpegPath, "-nostdin", "-hide_banner", "-ss", seconds(start), "-i", file, "-t", seconds(end-start), "-vn", "-af", "silencedetect=noise=-45dB:d=0.35", "-f", "null", "-")
		if err != nil {
			return plan, err
		}
		trimmed := paceSilenceBounds(string(raw), start, end, candidate)
		if trimmed.Out-trimmed.In < end-start-.05 {
			plan.Blocks[i].Pace = &trimmed
		}
	}
	return plan, nil
}

func paceSilenceBounds(log string, start, end float64, candidate story.Candidate) story.Interval {
	result := story.Interval{SourceID: candidate.SourceID, In: start, Out: end}
	silenceStart := -1.0
	for _, match := range silenceMarker.FindAllStringSubmatch(log, -1) {
		value, err := strconv.ParseFloat(match[2], 64)
		if err != nil {
			continue
		}
		if match[1] == "start" {
			silenceStart = value
			continue
		}
		if silenceStart < 0 {
			continue
		}
		if silenceStart < .02 {
			result.In = min(start+2, start+value-.2, candidate.Words[0].Start-.2)
		}
		if value >= end-start-.03 {
			result.Out = max(end-2, start+silenceStart+.2, candidate.Words[len(candidate.Words)-1].End+.2)
		}
		silenceStart = -1
	}
	result.In = max(start, result.In)
	result.Out = min(end, result.Out)
	return result
}

// silencedetect writes evidence to stderr; bound it just like other native tools.
func paceDetection(ctx context.Context, dir, binary string, args ...string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, binary, args...)
	cmd.Dir, cmd.WaitDelay = dir, 5*time.Second
	var log limitedBuffer
	cmd.Stderr = &log
	if err := cmd.Run(); err != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, err
	}
	return log.Bytes(), nil
}
