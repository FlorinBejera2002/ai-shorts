package story

import (
	"context"
	"reflect"
)

// NoChangeError is an honest completed edit outcome, not a failed export.
type NoChangeError struct{ Message string }

func (e *NoChangeError) Error() string { return e.Message }

type TransitionPreparer interface {
	PrepareStoryTransitions(context.Context, Request, Version) (Version, error)
}

// Preserve a verified visual treatment only while both sides refer to exactly
// the same original media. A new take/cut requires fresh boundary evidence.
func inheritTransitions(entries []Entry, parent *Version) {
	if parent == nil {
		return
	}
	for i := range entries {
		for j, old := range parent.Timeline {
			if old.BlockID != entries[i].BlockID || old.CandidateID != entries[i].CandidateID {
				continue
			}
			if old.Transition == "cut" {
				entries[i].Transition = "cut"
			}
			if (old.Transition == "fade" || old.Transition == "crossfade") && i > 0 && j > 0 && entries[i].Video == old.Video && entries[i-1].Video == parent.Timeline[j-1].Video && reflect.DeepEqual(entries[i].Audio, old.Audio) && reflect.DeepEqual(entries[i-1].Audio, parent.Timeline[j-1].Audio) {
				entries[i].Transition = old.Transition
			}
		}
	}
}
