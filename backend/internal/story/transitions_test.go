package story

import (
	"reflect"
	"testing"
)

func TestVerifiedTransitionsPersistOnlyForUnchangedAdjacentSources(t *testing.T) {
	previous := Version{Timeline: []Entry{{BlockID: "a", CandidateID: "a", Video: Interval{SourceID: "one", Out: 1}}, {BlockID: "b", CandidateID: "b", Video: Interval{SourceID: "two", Out: 1}, Transition: "fade"}}}
	current := append([]Entry(nil), previous.Timeline...)
	current[1].Transition = "natural"
	inheritTransitions(current, &previous)
	if !reflect.DeepEqual(current, previous.Timeline) {
		t.Fatal("saved smoothing lost on unchanged edit")
	}
	current[0].Video.SourceID = "replacement"
	current[1].Transition = "natural"
	inheritTransitions(current, &previous)
	if current[1].Transition != "natural" {
		t.Fatal("new cut inherited stale evidence")
	}
	previous.Timeline[1].Transition = "cut"
	inheritTransitions(current, &previous)
	if current[1].Transition != "cut" {
		t.Fatal("explicit removal lost")
	}
}
