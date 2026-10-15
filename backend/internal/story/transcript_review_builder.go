package story

import (
	"context"
	"fmt"
	"reflect"
)

func (s *runState) runTranscriptReview(ctx context.Context) (Result, error) {
	if err := ValidateEdit(s.req); err != nil {
		return s.result, err
	}
	s.result.Best = *s.req.Base
	version, err := RebuildTranscriptCaptions(*s.req.Base, s.req.Assets)
	if err != nil {
		return s.result, err
	}
	if reflect.DeepEqual(version.Timeline, s.req.Base.Timeline) {
		return s.result, &NoChangeError{Message: "The reviewed words are outside the selected cuts, or these captions are already applied. Your previous video is retained."}
	}
	version.Number = s.next
	if err = s.checkpoints.Progress(ctx, "editing", "Rebuilding captions from the reviewed transcript"); err != nil {
		return s.result, err
	}
	pre := s.builder.preReview(ctx, s.req, version, s.budget)
	if hasCritical(pre.Issues) {
		return s.result, fmt.Errorf("reviewed captions cannot change source or lock constraints")
	}
	version, err = s.renderAndReview(ctx, version, pre)
	if err != nil {
		return s.result, err
	}
	// Explicit owner transcription does not certify semantics or audio quality.
	// Keep a usable captioned draft while unresolved independent checks remain.
	version.Accepted = !invalidRenderedFile(version) && !hasCritical(version.Report.Issues)
	if err = s.checkpoints.SaveVersion(ctx, version); err != nil {
		return s.result, err
	}
	s.result.AICalls = s.budget.calls
	if version.Accepted {
		s.result.Best = version
	}
	return s.result, nil
}
