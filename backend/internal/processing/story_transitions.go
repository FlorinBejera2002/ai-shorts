package processing

import (
	"context"
	"fmt"
	"math"
	"os"
	"reflect"
	"sneepcut/backend-go/internal/story"
)

// Retained for saved legacy fade treatments. New smoothing is a native Studio
// visual blend that leaves the source, speech and caption clocks unchanged.
const storyFadeSeconds = .08

func (p *Processor) PrepareStoryTransitions(ctx context.Context, request story.Request, version story.Version) (story.Version, error) {
	unchanged := func() (story.Version, error) {
		return version, &story.NoChangeError{Message: "No suitable cuts need smoothing; your previous video is retained."}
	}
	if request.Base == nil || request.Base.Output.Key == "" || len(version.Timeline) < 2 {
		return unchanged()
	}
	if len(request.Base.Timeline) != len(version.Timeline) {
		return version, fmt.Errorf("transition editing must preserve the saved timeline")
	}
	for i, entry := range version.Timeline {
		old := request.Base.Timeline[i]
		entry.Transition = old.Transition
		if !reflect.DeepEqual(entry, old) {
			return version, fmt.Errorf("transition editing must preserve source, voice and caption timing")
		}
	}
	locked := map[string]bool{}
	for _, b := range version.Plan.Blocks {
		locked[b.ID] = b.Locked
	}
	candidates := map[int]bool{}
	for i := 1; i < len(version.Timeline); i++ {
		left, right := version.Timeline[i-1], version.Timeline[i]
		continuous := left.Video.SourceID == right.Video.SourceID && math.Abs(left.Video.Out-right.Video.In) <= .002
		alreadyNatural := request.Base.Output.NativeTransitionVersion >= studioNativeTransitionVersion && (right.Transition == "" || right.Transition == "natural")
		if !locked[left.BlockID] && !locked[right.BlockID] && !continuous && !alreadyNatural && right.Transition != "crossfade" && left.OutputOut-left.OutputIn >= .4 && right.OutputOut-right.OutputIn >= .4 {
			candidates[i-1] = true
		}
	}
	if len(candidates) == 0 {
		return unchanged()
	}
	dir, err := os.MkdirTemp(p.cfg.TempDir, "story-transitions-")
	if err != nil {
		return version, err
	}
	defer os.RemoveAll(dir)
	previous, err := p.storyMaterialize(ctx, dir, request.Base.Output.Key)
	if err != nil {
		return version, err
	}
	decisions, err := p.storyBoundaries(ctx, previous, *request.Base)
	if err != nil {
		return version, err
	}
	version.Timeline = append([]story.Entry(nil), version.Timeline...)
	changed := 0
	for _, decision := range decisions {
		// This explicit improvement request may soften an unlocked hard cut.
		// Identical/smooth joins and speech crossing a cut are left untouched.
		if candidates[decision.Index] && decision.SpeechSafe && decision.VisualSimilarity < .985 {
			version.Timeline[decision.Index+1].Transition = "crossfade"
			changed++
		}
	}
	if changed == 0 {
		return unchanged()
	}
	return version, nil
}
