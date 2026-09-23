package processing

import (
	"context"
	"fmt"
	"math"
)

const boundaryFrameSize = 64 * 36

// boundaryFrames samples only a short window at each join, rather than
// decoding the entire source a second time. Gray thumbnails bound memory.
func (p *Processor) boundaryFrames(ctx context.Context, source string, at float64) ([][]byte, error) {
	raw, err := run(ctx, "", p.cfg.FFmpegPath, "-nostdin", "-v", "error", "-ss", seconds(max(0, at-.2)), "-i", source, "-t", "0.4", "-vf", "fps=10,scale=64:36", "-frames:v", "4", "-an", "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1")
	if err != nil {
		return nil, err
	}
	var frames [][]byte
	for len(raw) >= boundaryFrameSize {
		frames = append(frames, raw[:boundaryFrameSize])
		raw = raw[boundaryFrameSize:]
	}
	if len(frames) < 2 {
		return nil, fmt.Errorf("insufficient boundary frames")
	}
	return frames, nil
}

func frameDifference(a, b []byte) float64 {
	if len(a) != len(b) || len(a) == 0 {
		return 1
	}
	diff := 0.0
	for i := range a {
		diff += math.Abs(float64(a[i]) - float64(b[i]))
	}
	return diff / float64(len(a)) / 255
}

func silentWindow(start, end float64, words []Word) bool {
	for _, word := range words {
		if word.Start < end && word.End > start {
			return false
		}
	}
	return true
}

// Estimate coherent camera translation separately from local subject motion.
// A translated thumbnail must explain most of the observed frame difference.
func cameraMotion(a, b []byte) float64 {
	if len(a) != boundaryFrameSize || len(b) != boundaryFrameSize {
		return 0
	}
	base := frameDifference(a, b)
	if base < .01 {
		return 0
	}
	best := base
	for dy := -2; dy <= 2; dy++ {
		for dx := -3; dx <= 3; dx++ {
			if dx == 0 && dy == 0 {
				continue
			}
			difference, count := 0.0, 0
			for y := 2; y < 34; y++ {
				for x := 3; x < 61; x++ {
					difference += math.Abs(float64(a[y*64+x]) - float64(b[(y+dy)*64+x+dx]))
					count++
				}
			}
			best = min(best, difference/float64(count)/255)
		}
	}
	if best < base*.65 {
		return base - best
	}
	return 0
}

func (p *Processor) analyzeNaturalCuts(ctx context.Context, source string, in RenderInput, info probeInfo) ([]Segment, []BoundaryDecision, error) {
	segments, decisions := PlanNaturalCuts(in.Segments, in.Transcript, info.Duration)
	for i := range decisions {
		if err := ctx.Err(); err != nil {
			return nil, nil, err
		}
		d := &decisions[i]
		if len(in.PreviousDecisions) == len(decisions) && in.PreviousDecisions[i].Score >= .9 {
			*d = in.PreviousDecisions[i]
			segments[i].End, segments[i+1].Start = d.Outgoing, d.Incoming
			continue
		}
		left, errL := p.boundaryFrames(ctx, source, d.Outgoing)
		right, errR := p.boundaryFrames(ctx, source, d.Incoming)
		if errL != nil || errR != nil {
			d.Reason = "Speech-aware cut; visual analysis unavailable"
			continue
		}
		d.VisualSimilarity = 1 - frameDifference(left[len(left)/2-1], right[len(right)/2])
		d.Motion = max(frameDifference(left[0], left[len(left)-1]), frameDifference(right[0], right[len(right)-1]))
		d.CameraMotion = max(cameraMotion(left[0], left[len(left)-1]), cameraMotion(right[0], right[len(right)-1]))
		// Search a bounded amount of adjacent silence. Never move a boundary
		// through speech merely to improve visual continuity.
		if d.SpeechSafe && d.VisualSimilarity < .9 && len(in.Transcript.Words) > 0 {
			for _, shift := range []float64{.1, .2} {
				candidate := d.Outgoing + shift
				if candidate >= info.Duration || candidate >= segments[i+1].Start || !silentWindow(d.Outgoing, candidate, in.Transcript.Words) {
					continue
				}
				frames, err := p.boundaryFrames(ctx, source, candidate)
				if err != nil {
					continue
				}
				similarity := 1 - frameDifference(frames[len(frames)/2-1], right[len(right)/2])
				motion := frameDifference(frames[0], frames[len(frames)-1])
				if similarity > d.VisualSimilarity+.03 && motion > .025 {
					segments[i].End = candidate
					d.Outgoing, d.VisualSimilarity, d.Motion = candidate, similarity, motion
					d.Strategy = "motion_cut"
					d.Reason = "Moved cut into nearby motion without crossing speech"
					break
				}
			}
		}
		d.Score = .6*d.Score + .4*d.VisualSimilarity
		if info.Audio && d.SpeechSafe && d.Strategy == "cut" && len(in.Transcript.Words) > 0 {
			for _, beat := range p.boundaryBeats(ctx, source, d.Outgoing, in.Transcript.Words) {
				if beat < d.Outgoing || beat-d.Outgoing > .2 || beat >= segments[i+1].Start || !silentWindow(d.Outgoing-.06, beat+.06, in.Transcript.Words) {
					continue
				}
				frames, err := p.boundaryFrames(ctx, source, beat)
				if err != nil {
					continue
				}
				similarity := 1 - frameDifference(frames[len(frames)/2-1], right[len(right)/2])
				if similarity < d.VisualSimilarity-.01 {
					continue
				}
				segments[i].End = beat
				d.Outgoing, d.VisualSimilarity = beat, similarity
				d.Strategy = "beat_cut"
				d.Reason = "Aligned a silent boundary to a regular audio onset without reducing visual continuity"
				break
			}
		}
		if d.Strategy == "cut" && d.SpeechSafe && d.Motion > .025 && d.VisualSimilarity > .75 {
			d.Strategy = "motion_cut"
			d.Reason = "Existing speech-safe boundary coincides with motion"
		}
	}
	return segments, decisions, ctx.Err()
}
