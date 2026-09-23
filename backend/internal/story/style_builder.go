package story

import (
	"context"
	"encoding/json"
	"fmt"
)

// Restyling cannot invoke planning or repair, including for fully locked stories.
// Copy the exact saved timeline so retimed words, cuts and protected endings stay
// byte-for-byte equivalent. A failed review preserves the previous accepted file.
func (s *runState) runRestyle(ctx context.Context) (Result, error) {
	if err := ValidateEdit(s.req); err != nil {
		return s.result, err
	}
	s.result.Best = *s.req.Base
	raw, err := json.Marshal(s.req.Base)
	if err != nil {
		return s.result, err
	}
	var version Version
	if err = json.Unmarshal(raw, &version); err != nil {
		return s.result, err
	}
	version.Parent, version.Number, version.Accepted = s.req.Base.Number, s.next, false
	version.Output = Output{}
	version.Report = Report{}
	var pre Report
	if s.req.Options.Narration {
		pre = s.reviewNarrationPlan(ctx, version)
	} else {
		pre = s.builder.preReview(ctx, s.req, version, s.budget)
	}
	if hasBlocking(pre.Issues) {
		return s.result, fmt.Errorf("restyle cannot change source or narrative problems")
	}
	version, err = s.renderAndReview(ctx, version, pre)
	if err != nil {
		return s.result, err
	}
	version.Accepted = !invalidRenderedFile(version) && version.Report.Status == "ready"
	if err = s.checkpoints.SaveVersion(ctx, version); err != nil {
		return s.result, err
	}
	s.result.AICalls = s.budget.calls
	if version.Accepted {
		s.result.Best = version
	}
	return s.result, nil
}
