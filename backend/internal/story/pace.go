package story

import "context"

// PaceTightener measures source audio before trimming. It must never infer silence
// from missing transcription or change speech speed, pitch or the original file.
type PaceTightener interface {
	TightenStoryPace(context.Context, Request, Plan) (Plan, error)
}

func PaceEligible(block Block, candidate Candidate) bool {
	if block.Locked || block.BRollID != "" || block.Visual != nil || len(candidate.Words) == 0 || candidate.Confidence < .55 {
		return false
	}
	start, end := candidate.In, candidate.Out
	if block.Pace != nil {
		start, end = block.Pace.In, block.Pace.Out
	}
	first, last := candidate.Words[0].Start, candidate.Words[len(candidate.Words)-1].End
	return first-start > .45 || end-last > .45
}
