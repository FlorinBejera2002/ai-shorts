package story

import (
	"math"
	"reflect"
	"strings"
	"testing"
)

func measuredPlanningFixture() (Request, Plan) {
	req, plan := evidenceMusicFixture()
	req.Options.TargetSeconds = 8
	req.Assets[0].Candidates = []Candidate{
		{ID: "first", SourceID: "visual", In: 0, Out: 4, Role: "b_roll", Moment: &VisualMoment{In: 1, Out: 3, Confidence: .95, Evidence: "The first complete observed action includes its preparation and completion."}},
		{ID: "second", SourceID: "visual", In: 4, Out: 8, Role: "b_roll", Moment: &VisualMoment{In: 5, Out: 7, Confidence: .95, Evidence: "The second complete observed action includes its preparation and completion."}},
	}
	plan.Blocks = []Block{{ID: "first", CandidateID: "first"}, {ID: "second", CandidateID: "second"}}
	req.Music.Analysis.Model = "fixture:hosted-structure"
	req.Music.Analysis.Sections = []MusicSection{{Start: 0, End: 20, Pace: "moderate", Energy: .6, Confidence: .9}}
	req.Music.Analysis.Timing = &MusicTiming{
		Version: MeasuredMusicTimingVersion, Method: MeasuredMusicTimingMethod, Duration: 20,
		Events: []MusicEvent{{Time: 3.512, Kind: "onset", Strength: 1, Confidence: .95, UncertaintySeconds: .012}},
	}
	return req, plan
}

func TestMeasuredAttacksCombineWithHostedPacingOnRenderedFrame(t *testing.T) {
	req, plan := measuredPlanningFixture()
	// A hallucinated hosted downbeat must never compete with the measurement.
	req.Music.Analysis.Events = []MusicEvent{{Time: 3.8, Kind: "downbeat", Strength: 1, Confidence: 1}}
	updated, timeline, sync, err := synchronizeMusic(req, plan)
	if err != nil || len(timeline) != 2 {
		t.Fatalf("measured planning failed: %+v %v", timeline, err)
	}
	cut := timeline[0].OutputOut
	if math.Abs(cut-3.5) > 1e-9 || math.Abs(cut*30-math.Round(cut*30)) > 1e-9 || sync.AlignedCuts != 1 || sync.AdjustedCuts != 1 || sync.Strategy != "accents" {
		t.Fatalf("attack was discarded, rounded incorrectly, or misreported: cut=%v %+v", cut, sync)
	}
	if !strings.Contains(sync.Explanation, "Measured rhythmic attacks") || strings.Contains(sync.Explanation, "downbeat") {
		t.Fatal("measurement was represented as a guaranteed metrical downbeat", sync)
	}
	for i, entry := range timeline {
		candidate := req.Assets[0].Candidates[i]
		if entry.Video.In > candidate.Moment.In || entry.Video.Out < candidate.Moment.Out || updated.Blocks[i].CandidateID != plan.Blocks[i].CandidateID {
			t.Fatal("music removed context or changed selected candidate order", entry)
		}
	}
	if hasBlocking(ValidatePlan(updated, req.Assets, req.Options, nil)) {
		t.Fatal("frame-aligned source intervals failed validation")
	}
}

func TestMalformedMeasuredEnvelopeFallsBackToStructure(t *testing.T) {
	for _, tc := range []struct {
		name   string
		change func(*MusicTiming)
	}{
		{"wrong provenance", func(m *MusicTiming) { m.Method = "hosted" }},
		{"wrong version", func(m *MusicTiming) { m.Version = "future-unverified" }},
		{"different excerpt", func(m *MusicTiming) { m.Duration = 19 }},
		{"uncertain", func(m *MusicTiming) { m.Events[0].UncertaintySeconds = .026 }},
		{"unreported uncertainty", func(m *MusicTiming) { m.Events[0].UncertaintySeconds = 0 }},
		{"weak confidence", func(m *MusicTiming) { m.Events[0].Confidence = .79 }},
		{"nonfinite", func(m *MusicTiming) { m.Events[0].Time = math.NaN() }},
		{"outside excerpt", func(m *MusicTiming) { m.Events[0].Time = 20 }},
		{"invented downbeat", func(m *MusicTiming) { m.Events[0].Kind = "downbeat" }},
		{"duplicate", func(m *MusicTiming) { m.Events = append(m.Events, m.Events[0]) }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req, plan := measuredPlanningFixture()
			timing := req.Music.Analysis.Timing
			req.Music.Analysis.Timing = nil
			baseline, before, _, err := synchronizeMusic(req, plan)
			if err != nil {
				t.Fatal(err)
			}
			tc.change(timing)
			req.Music.Analysis.Timing = timing
			after, timeline, sync, err := synchronizeMusic(req, plan)
			if err != nil || !reflect.DeepEqual(after, baseline) || !reflect.DeepEqual(timeline, before) || sync.AlignedCuts != 0 || sync.Strategy != "structure" {
				t.Fatalf("unqualified timing escaped the structure fallback: %+v %v", sync, err)
			}
		})
	}
}

func TestMeasuredAttacksRespectLoopAndExcerptClock(t *testing.T) {
	req, _ := measuredPlanningFixture()
	req.Music.Track.DurationSeconds = 4.2
	req.Music.SourceStart = 60
	req.Music.Analysis.Timing.Duration = 4.2
	events := musicEvidenceOnOutput(req, 9)
	if len(events) != 2 || math.Abs(events[1].Time-7.712) > 1e-9 {
		t.Fatal("measurement was extrapolated, quantized early, or offset twice", events)
	}
	noLoop := false
	req.Options.Music.Loop = &noLoop
	if events := musicEvidenceOnOutput(req, 9); len(events) != 1 {
		t.Fatal("non-looping music supplied nonexistent attacks", events)
	}
}

func TestMeasuredAttacksNeverTrimAudibleDialogueOrMissingVisualEvidence(t *testing.T) {
	for _, tc := range []string{"dialogue", "missing moment", "locked", "approved"} {
		t.Run(tc, func(t *testing.T) {
			req, plan := measuredPlanningFixture()
			switch tc {
			case "dialogue":
				req.Assets[0].HasAudio = true
			case "missing moment":
				for i := range req.Assets[0].Candidates {
					req.Assets[0].Candidates[i].Moment = nil
				}
			case "locked":
				plan.Blocks[0].Locked = true
			case "approved":
				req.Base = &Version{Plan: clonePlan(plan)}
			}
			before, err := BuildTimeline(plan, req.Assets)
			if err != nil {
				t.Fatal(err)
			}
			after, timeline, sync, err := synchronizeMusic(req, plan)
			if err != nil || !reflect.DeepEqual(after, plan) || !reflect.DeepEqual(timeline, before) || sync.AdjustedCuts != 0 || sync.AlignedCuts != 0 {
				t.Fatalf("protected source changed for an attack: %+v %v", sync, err)
			}
		})
	}
}

func TestMusicalPassageChangesShotPacingWithoutCollapsingDuration(t *testing.T) {
	var cuts [2]float64
	for i, firstPace := range []string{"fast", "slow"} {
		req, plan := evidenceMusicFixture()
		req.Options.TargetSeconds = 13
		req.Assets[0].Duration = 16
		second := req.Assets[0].Candidates[0]
		second.ID, second.In, second.Out = "second", 8, 16
		second.Moment = &VisualMoment{In: 10, Out: 14, Confidence: .95, Evidence: "A second complete action with visible preparation and completion."}
		req.Assets[0].Candidates = append(req.Assets[0].Candidates, second)
		plan.Blocks = append(plan.Blocks, Block{ID: "second", CandidateID: "second"})
		secondPace := "slow"
		if firstPace == "slow" {
			secondPace = "fast"
		}
		req.Music.Analysis.Model = "fixture:hosted"
		req.Music.Analysis.Sections = []MusicSection{
			{Start: 0, End: 6.5, Pace: firstPace, Confidence: .95},
			{Start: 6.5, End: 20, Pace: secondPace, Confidence: .95},
		}
		_, timeline, sync, err := synchronizeMusic(req, plan)
		if err != nil || len(timeline) != 2 || math.Abs(timelineDuration(timeline)-13) > 1.04 || sync.Strategy != "structure" || sync.AlignedCuts != 0 {
			t.Fatalf("section pacing lost story duration or claimed beat precision: %+v %+v %v", timeline, sync, err)
		}
		cuts[i] = timeline[0].OutputOut
		for j, entry := range timeline {
			moment := req.Assets[0].Candidates[j].Moment
			if entry.Video.In > moment.In || entry.Video.Out < moment.Out {
				t.Fatal("pacing removed observed action", entry)
			}
		}
	}
	if cuts[1]-cuts[0] < 1.5 {
		t.Fatalf("contrasting song passages still produced effectively identical shot lengths: %v", cuts)
	}
}

func TestMeasuredAttackCutStaysCrispThroughTransitionPlanning(t *testing.T) {
	req, plan := measuredPlanningFixture()
	req.Music.Analysis.Sections[0].Pace = "slow"
	req.Music.Analysis.Sections[0].Energy = .2
	req.Music.Analysis.Sections[0].Transition = "dissolve"
	updated, timeline, sync, err := synchronizeMusic(req, plan)
	if err != nil || sync.AlignedCuts != 1 {
		t.Fatalf("no measured cut: %+v %v", sync, err)
	}
	applyMusicTransitions(req, updated, timeline)
	if timeline[1].Transition != "cut" || timeline[1].TransitionSeconds != 0 {
		t.Fatal("section dissolve obscured the claimed measured cut", timeline[1])
	}
}
