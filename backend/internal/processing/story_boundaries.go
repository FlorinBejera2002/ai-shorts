package processing

import (
	"context"
	"errors"
	"math"

	"sneepcut/backend-go/internal/story"
)

// Reuse the natural-transition engine's measured continuity and speech guards,
// while keeping the global EDL authoritative. A reviewer may propose a source
// edit; rendering must never secretly shift a boundary and desync later tracks.
func (p *Processor) storyBoundaries(ctx context.Context, file string, version story.Version) ([]BoundaryDecision, error) {
	var words []Word
	for _, entry := range version.Timeline {
		for _, word := range entry.Words {
			words = append(words, Word{Text: word.Text, Start: word.Start, End: word.End})
		}
	}
	var decisions []BoundaryDecision
	for i := 1; i < len(version.Timeline); i++ {
		at := version.Timeline[i].OutputIn
		start := max(0, at-.2)
		raw, err := run(ctx, "", p.cfg.FFmpegPath, "-nostdin", "-v", "error", "-ss", seconds(start), "-i", file, "-t", "0.4", "-vf", "fps=10,scale=64:36", "-frames:v", "4", "-an", "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1")
		if err != nil || len(raw) < 2*boundaryFrameSize {
			return nil, errors.New("boundary evidence unavailable")
		}
		frames := len(raw) / boundaryFrameSize
		middle := max(1, min(frames-1, int(math.Round((at-start)*10))))
		before := raw[(middle-1)*boundaryFrameSize : middle*boundaryFrameSize]
		after := raw[middle*boundaryFrameSize : (middle+1)*boundaryFrameSize]
		first, last := raw[:boundaryFrameSize], raw[(frames-1)*boundaryFrameSize:frames*boundaryFrameSize]
		decision := BoundaryDecision{Index: i - 1, Strategy: "cut", Outgoing: at, Incoming: at, SpeechSafe: speechSafe(at, words), VisualSimilarity: 1 - frameDifference(before, after), Motion: frameDifference(first, last), CameraMotion: cameraMotion(first, last), Reason: "Original natural-cut speech and visual guards applied to actual output; source intervals retained."}
		if sentenceEnd(at, words) {
			decision.Reason += " Adjacent phrase ends at sentence punctuation."
		}
		if decision.SpeechSafe {
			decision.Score = .6 + .4*decision.VisualSimilarity
		}
		if decision.SpeechSafe && decision.Motion > .025 && decision.VisualSimilarity > .75 {
			decision.Strategy = "motion_cut"
		}
		decisions = append(decisions, decision)
	}
	return decisions, nil
}
