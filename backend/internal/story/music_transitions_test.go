package story

import (
	"reflect"
	"testing"
)

func TestHostedMusicTransitionsAreIntentionalAndPreserveClocks(t *testing.T) {
	req, _ := evidenceMusicFixture()
	req.Music.Analysis.Model = "hosted-fixture"
	req.Music.Analysis.Sections = []MusicSection{{Start: 0, End: 6.5, Label: "quiet", Energy: .2, Pace: "slow", Transition: "dissolve", Confidence: .9}, {Start: 6.5, End: 20, Label: "energetic", Energy: .8, Pace: "fast", Transition: "cut", Confidence: .9}}
	req.Assets = nil
	for _, id := range []string{"one", "two", "three"} {
		req.Assets = append(req.Assets, Asset{ID: id, Duration: 4, Candidates: []Candidate{{ID: id, SourceID: id, In: 0, Out: 4, Moment: &VisualMoment{In: 1, Out: 3, Confidence: .95, Evidence: "The complete observed action has idle handles on both sides."}}}})
	}
	plan := Plan{Blocks: []Block{{ID: "a"}, {ID: "b"}, {ID: "c"}}}
	timeline := []Entry{
		{BlockID: "a", CandidateID: "one", OutputOut: 4, Video: Interval{SourceID: "one", Out: 4}},
		{BlockID: "b", CandidateID: "two", OutputIn: 4, OutputOut: 8, Video: Interval{SourceID: "two", Out: 4}, Transition: "natural"},
		{BlockID: "c", CandidateID: "three", OutputIn: 8, OutputOut: 12, Video: Interval{SourceID: "three", Out: 4}, Transition: "natural"},
	}
	// Unverified exact timestamps must not override broad pacing or treatment.
	req.Music.Analysis.Events = []MusicEvent{{Time: 4, Kind: "accent", Strength: 1, Confidence: .9, UncertaintySeconds: .08}}
	before := append([]Entry(nil), timeline...)
	applyMusicTransitions(req, plan, timeline)
	if timeline[1].Transition != "crossfade" || timeline[1].TransitionSeconds != .5 || timeline[2].Transition != "cut" || timeline[2].TransitionSeconds != 0 {
		t.Fatalf("musical treatment ignored section pacing or trusted an unverified accent: %#v", timeline)
	}
	for i := range timeline {
		timeline[i].Transition, timeline[i].TransitionSeconds = before[i].Transition, before[i].TransitionSeconds
	}
	if !reflect.DeepEqual(before, timeline) {
		t.Fatal("transition choice modified source or output clocks")
	}
}

func TestMusicDissolveRequiresEvidenceForVisibleSource(t *testing.T) {
	entry := Entry{Video: Interval{SourceID: "visible", In: 0, Out: 4}}
	if !musicTransitionTouchesAction(entry, Candidate{}) {
		t.Fatal("missing action evidence authorized a dissolve")
	}
	candidate := Candidate{SourceID: "spoken", In: 0, Out: 4, Moment: &VisualMoment{In: 1, Out: 3, Confidence: .95, Evidence: "A complete action with verified idle handles."}}
	if !musicTransitionTouchesAction(entry, candidate) {
		t.Fatal("spoken source evidence authorized blurring unrelated B-roll")
	}
}

func TestHostedMusicTransitionsPreserveSavedEditsAndLocks(t *testing.T) {
	for _, saved := range []bool{false, true} {
		req, _ := evidenceMusicFixture()
		req.Music.Analysis.Model = "hosted-fixture"
		plan := Plan{Blocks: []Block{{ID: "a", Locked: !saved}, {ID: "b"}}}
		if saved {
			req.Base = &Version{}
		}
		timeline := []Entry{{BlockID: "a", OutputOut: 3}, {BlockID: "b", OutputIn: 3, OutputOut: 6, Transition: "crossfade", TransitionSeconds: .2}}
		before := append([]Entry(nil), timeline...)
		applyMusicTransitions(req, plan, timeline)
		if !reflect.DeepEqual(before, timeline) {
			t.Fatal("saved or locked transition overwritten")
		}
	}
}

func TestMusicTransitionSectionsRespectExcerptLoopAndEnd(t *testing.T) {
	req, _ := evidenceMusicFixture()
	req.Music.Analysis.Sections = []MusicSection{{Start: 0, End: 5, Label: "intro", Energy: .2, Confidence: .9}}
	if section := musicTransitionSection(req, 22); section == nil || section.Label != "intro" {
		t.Fatal("repeat offset lost section")
	}
	loop := false
	req.Options.Music.Loop = &loop
	if musicTransitionSection(req, 22) != nil {
		t.Fatal("section extrapolated beyond non-looping music")
	}
}
