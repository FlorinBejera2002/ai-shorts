package processing

// TransitionState retains the rendering recipe and word timings needed for a
// clip-local improvement. It is internal and is not returned by clip reads.
type TransitionState struct {
	Recipe    RenderInput        `json:"recipe"`
	Decisions []BoundaryDecision `json:"decisions"`
}
