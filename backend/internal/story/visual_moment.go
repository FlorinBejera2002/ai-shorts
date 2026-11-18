package story

import "strings"

// VisualMoment is a source-clock action window supported by observed frames.
// Analysis includes sampling uncertainty in its protected start and end.
type VisualMoment struct {
	In         float64  `json:"in"`
	Out        float64  `json:"out"`
	Peak       *float64 `json:"peak,omitempty"`
	Confidence float64  `json:"confidence"`
	Evidence   string   `json:"evidence"`
}

func validVisualMoment(c Candidate) bool {
	m := c.Moment
	return m != nil && finite(m.In) && finite(m.Out) && finite(m.Confidence) && m.Confidence >= .85 && m.Confidence <= 1 && m.In >= c.In && m.Out <= c.Out && m.Out > m.In && len(strings.TrimSpace(m.Evidence)) >= 24 && len(m.Evidence) <= 1200 && (m.Peak == nil || finite(*m.Peak) && *m.Peak >= m.In && *m.Peak <= m.Out)
}
