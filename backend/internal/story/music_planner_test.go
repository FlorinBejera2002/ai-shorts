package story

import (
	"math"
	"reflect"
	"testing"

	"sneepcut/backend-go/internal/music"
)

func evidenceMusicFixture() (Request, Plan) {
	options := DefaultOptions()
	options.Music = &MusicSelection{TrackID: "incompetech:test", Sync: true, Volume: .2}
	req := Request{Options: options, Music: &PreparedMusic{Track: music.Track{ID: "incompetech:test", DurationSeconds: 20}, Key: "music/test.flac", Analysis: &MusicAnalysis{Version: "fixture", Duration: 20}}, Assets: []Asset{{ID: "visual", Duration: 8, Candidates: []Candidate{{ID: "action", SourceID: "visual", In: 0, Out: 8, Role: "b_roll", Moment: &VisualMoment{In: 2, Out: 6, Confidence: .95, Evidence: "Preparation and completion were observed with surrounding sampling uncertainty."}}}}}}
	return req, Plan{Blocks: []Block{{ID: "block-action", CandidateID: "action", Crop: "fit"}}}
}

func TestMusicPlannerAlignsActionPeakAndReportsSourceWindowChange(t *testing.T) {
	req, plan := evidenceMusicFixture()
	peak := 4.0
	req.Assets[0].Candidates[0].Moment.Peak = &peak
	req.Music.Analysis.Events = []MusicEvent{{Time: 3, Kind: "beat", Strength: 1, Confidence: 1}}
	before := clonePlan(plan)
	adjusted, timeline, sync, err := synchronizeMusic(req, plan)
	if err != nil || adjusted.Blocks[0].MusicWindow == nil {
		t.Fatalf("action peak did not receive a source-backed alignment: %+v %v", adjusted, err)
	}
	window := adjusted.Blocks[0].MusicWindow
	if math.Abs(timeline[0].OutputIn+peak-window.In-3) > .000001 || window.In > 2 || window.Out < 6 || window.In < 0 || window.Out > 8 {
		t.Fatalf("peak alignment removed protected action or missed the event: %+v", window)
	}
	if sync.Status == "unchanged" || sync.Status == "off" || sync.AdjustedCuts != 0 {
		t.Fatalf("single-shot action alignment was misreported as no edit or a nonexistent cut: %+v", sync)
	}
	if !reflect.DeepEqual(plan, before) {
		t.Fatal("action alignment mutated the caller's plan")
	}
	rebuilt, err := BuildTimeline(adjusted, req.Assets)
	if err != nil || !reflect.DeepEqual(rebuilt, timeline) || hasBlocking(ValidatePlan(adjusted, req.Assets, req.Options, nil)) {
		t.Fatal("saved action alignment did not rebuild into the same valid timeline", err)
	}
	again, second, _, err := synchronizeMusic(req, adjusted)
	if err != nil || !reflect.DeepEqual(again, adjusted) || !reflect.DeepEqual(second, timeline) {
		t.Fatal("action alignment accumulated trims on a repeated run", err)
	}
}

func TestMusicPlannerDoesNotLetEarlyWeakAttacksHideStrongActionAccent(t *testing.T) {
	req, plan := evidenceMusicFixture()
	peak := 4.0
	req.Assets[0].Candidates[0].Moment.Peak = &peak
	for i := 0; i < 9; i++ {
		req.Music.Analysis.Events = append(req.Music.Analysis.Events, MusicEvent{Time: 2 + float64(i)*.1, Kind: "onset", Strength: .05, Confidence: .9})
	}
	req.Music.Analysis.Events = append(req.Music.Analysis.Events, MusicEvent{Time: 3, Kind: "beat", Strength: 1, Confidence: 1})
	adjusted, timeline, _, err := synchronizeMusic(req, plan)
	if err != nil || adjusted.Blocks[0].MusicWindow == nil || math.Abs(timeline[0].OutputIn+peak-timeline[0].Video.In-3) > .000001 {
		t.Fatalf("chronologically earlier weak events hid the clear safe action accent: %+v %v", timeline, err)
	}
}

func TestMusicPlannerChoiceBudgetDeduplicatesCoincidentEvents(t *testing.T) {
	events := []MusicEvent{
		{Time: 1, Kind: "onset", Strength: .9, Confidence: .9},
		{Time: 1.001, Kind: "beat", Strength: .9, Confidence: .9},
		{Time: 1.002, Kind: "section", Strength: .9, Confidence: .9},
		{Time: 2, Kind: "beat", Strength: .9, Confidence: .9},
	}
	choices := strongestMusicChoices(events, 0, 3)
	if len(choices) != 2 || choices[0].Time != 1.002 || choices[1].Time != 2 {
		t.Fatalf("coincident beat/onset evidence used multiple timing slots: %+v", choices)
	}
	events = nil
	for i := 0; i < 20000; i++ {
		events = append(events, MusicEvent{Time: float64(i) / 30, Kind: "beat", Strength: .9, Confidence: .9})
	}
	choices = strongestMusicChoices(events, 0, 1000)
	if len(choices) != 7 || choices[0].Time != events[len(events)-1].Time {
		t.Fatalf("dense evidence exceeded timing budget or unnecessarily removed handles: %+v", choices)
	}
}

func TestMusicPlannerMovesCutWithoutRemovingCompleteActions(t *testing.T) {
	req, plan := evidenceMusicFixture()
	req.Assets[0].Candidates = []Candidate{
		{ID: "first", SourceID: "visual", In: 0, Out: 4, Role: "b_roll", Moment: &VisualMoment{In: 1, Out: 3, Confidence: .95, Evidence: "The complete first action includes preparation and completion."}},
		{ID: "second", SourceID: "visual", In: 4, Out: 8, Role: "b_roll", Moment: &VisualMoment{In: 5, Out: 7, Confidence: .95, Evidence: "The complete second action includes preparation and completion."}},
	}
	plan.Blocks = []Block{{ID: "first", CandidateID: "first"}, {ID: "second", CandidateID: "second"}}
	req.Music.Analysis.Events = []MusicEvent{{Time: 3.5, Kind: "section", Strength: 1, Confidence: .95}}
	adjusted, timeline, sync, err := synchronizeMusic(req, plan)
	if err != nil || math.Abs(timeline[0].OutputOut-3.5) > .000001 || sync.AdjustedCuts != 1 || sync.Strategy != "accents" {
		t.Fatalf("supported section event did not guide the cut: %+v %+v %v", timeline, sync, err)
	}
	for i, entry := range timeline {
		candidate := req.Assets[0].Candidates[i]
		if entry.Video.In < candidate.In || entry.Video.Out > candidate.Out || entry.Video.In > candidate.Moment.In || entry.Video.Out < candidate.Moment.Out {
			t.Fatalf("action or source bounds lost: %+v", entry)
		}
	}
	if adjusted.Blocks[0].ID != plan.Blocks[0].ID || adjusted.Blocks[1].CandidateID != plan.Blocks[1].CandidateID || hasBlocking(ValidatePlan(adjusted, req.Assets, req.Options, nil)) {
		t.Fatal("timing changed candidate identity/order or invalidated the source plan")
	}
	rebuilt, err := BuildTimeline(adjusted, req.Assets)
	if err != nil || !reflect.DeepEqual(timeline, rebuilt) {
		t.Fatal("planner and renderer clocks disagree", err)
	}
}

func TestMusicPlannerKeepsSpeechUnknownAudioLocksAndApprovedTiming(t *testing.T) {
	for _, tc := range []struct {
		name   string
		change func(*Request, *Plan)
	}{
		{"original audio", func(r *Request, _ *Plan) { r.Assets[0].HasAudio = true }},
		{"speech", func(r *Request, _ *Plan) {
			r.Assets[0].HasAudio = true
			r.Assets[0].Candidates[0].Text = "Keep this sentence."
			r.Assets[0].Candidates[0].Words = []Word{{Text: "Keep this sentence.", Start: 2, End: 5}}
		}},
		{"no action evidence", func(r *Request, _ *Plan) { r.Assets[0].Candidates[0].Moment = nil }},
		{"locked", func(_ *Request, p *Plan) { p.Blocks[0].Locked = true }},
		{"existing version", func(r *Request, p *Plan) { r.Base = &Version{Number: 1, Accepted: true, Plan: clonePlan(*p)} }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req, plan := evidenceMusicFixture()
			peak := 4.0
			req.Assets[0].Candidates[0].Moment.Peak = &peak
			req.Music.Analysis.Events = []MusicEvent{{Time: 3, Kind: "beat", Strength: 1, Confidence: 1}}
			tc.change(&req, &plan)
			before, err := BuildTimeline(plan, req.Assets)
			if err != nil {
				t.Fatal(err)
			}
			after, timeline, sync, err := synchronizeMusic(req, plan)
			if err != nil || !reflect.DeepEqual(plan, after) || !reflect.DeepEqual(before, timeline) || sync.AdjustedCuts != 0 {
				t.Fatalf("protected source or approved timing changed: %+v %+v %v", timeline, sync, err)
			}
		})
	}
}

func TestMusicEvidenceUsesMeasuredChangingTempoAndExcerptRepeatClock(t *testing.T) {
	req, _ := evidenceMusicFixture()
	req.Music.Track.DurationSeconds = 4.2
	req.Music.SourceStart, req.Music.SourceEnd = 60, 64.2
	for _, at := range []float64{.4, 1, 1.9, 3.1, 3.5} {
		req.Music.Analysis.Events = append(req.Music.Analysis.Events, MusicEvent{Time: at, Kind: "beat", Strength: 1, Confidence: .9})
	}
	expected := []float64{.4, 1, 1.9, 3.1, 3.5, 4.6, 5.2, 6.1, 7.3, 7.7, 8.8}
	events := musicEvidenceOnOutput(req, 9)
	if len(events) != len(expected) {
		t.Fatalf("events lost or invented across excerpt repeats: %+v", events)
	}
	for i, event := range events {
		if math.Abs(event.Time-expected[i]) > .000001 {
			t.Fatalf("BPM replaced measured tempo or excerpt offset was applied twice: %+v", events)
		}
	}
	noRepeat := false
	req.Options.Music.Loop = &noRepeat
	events = musicEvidenceOnOutput(req, 9)
	if len(events) != 5 || events[len(events)-1].Time != 3.5 {
		t.Fatalf("nonrepeating music supplied nonexistent later timing opportunities: %+v", events)
	}
}

func TestMusicPlannerNoEvidenceAndInvalidEvidenceKeepCompleteMoments(t *testing.T) {
	req, plan := evidenceMusicFixture()
	before, err := BuildTimeline(plan, req.Assets)
	if err != nil {
		t.Fatal(err)
	}
	for _, events := range [][]MusicEvent{
		nil,
		{{Time: math.NaN(), Kind: "beat", Strength: 1, Confidence: 1}, {Time: 3, Kind: "invented", Strength: 1, Confidence: 1}, {Time: 3, Kind: "beat", Strength: 1, Confidence: .2}, {Time: 3, Kind: "beat", Strength: 2, Confidence: 1}, {Time: 21, Kind: "beat", Strength: 1, Confidence: 1}},
	} {
		req.Music.Analysis.Events = events
		after, timeline, sync, err := synchronizeMusic(req, plan)
		if err != nil || !reflect.DeepEqual(after, plan) || !reflect.DeepEqual(before, timeline) || sync.Strategy != "content" || sync.Status != "unchanged" {
			t.Fatalf("missing evidence manufactured musical edits: %+v %v", sync, err)
		}
	}
}

func TestMusicPlannerShortActionCannotProduceInvertedEventSearch(t *testing.T) {
	req, plan := evidenceMusicFixture()
	req.Assets[0].Duration = .3
	candidate := &req.Assets[0].Candidates[0]
	candidate.Out = .3
	candidate.Moment.In, candidate.Moment.Out = .05, .25
	req.Music.Analysis.Events = []MusicEvent{{Time: .4, Kind: "beat", Strength: 1, Confidence: 1}}
	choices := musicWindowChoices(plan.Blocks[0], *candidate, req.Assets[0], 0, req.Music.Analysis.Events)
	if len(choices) != 1 || choices[0].In != 0 || choices[0].Out != .3 {
		t.Fatalf("short complete action was changed: %+v", choices)
	}
}

func TestMusicWindowValidationRejectsRemovedActionsAndInventedSourceFrames(t *testing.T) {
	req, plan := evidenceMusicFixture()
	for _, window := range []Interval{{"visual", -1, 7}, {"visual", 1, 9}, {"visual", 3, 7}, {"visual", 1, 5}, {"other", 1, 7}, {"visual", math.NaN(), 7}} {
		plan.Blocks[0].MusicWindow = &window
		if _, err := BuildTimeline(plan, req.Assets); err == nil {
			t.Fatal("unsafe action window became executable", window)
		}
	}
}

func TestNarrationMusicEvidencePreservesCompleteVoiceAndProtectedVisualActions(t *testing.T) {
	req := narrationFixture()
	req.Music, req.Options.Music = musicFixture()
	req.Music.Analysis = &MusicAnalysis{Version: "fixture", Duration: 10, Events: []MusicEvent{{Time: 4.2, Kind: "beat", Strength: 1, Confidence: .95}}}
	for i := 1; i < 3; i++ {
		req.Assets[i].Candidates[0].Moment = &VisualMoment{In: 1, Out: 3, Confidence: .95, Evidence: "The observed complete action includes preparation and completion."}
	}
	plan := Plan{Blocks: []Block{
		{ID: "first", CandidateID: "forest-scene", Crop: "fit", Visual: &Interval{"forest", 0, 4}, Narration: &Interval{"voice", 0, 4}},
		{ID: "second", CandidateID: "river-scene", Crop: "fit", Visual: &Interval{"river", 0, 6}, Narration: &Interval{"voice", 4, 10}},
	}}
	after, timeline, sync, err := synchronizeMusic(req, plan)
	if err != nil || sync.AdjustedCuts != 1 || math.Abs(timeline[0].OutputOut-4.2) > .000001 || timelineDuration(timeline) != 10 {
		t.Fatalf("narration did not align within protected visual handles: %+v %+v %v", timeline, sync, err)
	}
	var words []Word
	for _, entry := range timeline {
		words = append(words, entry.Words...)
		if entry.Audio.In != entry.OutputIn || entry.Audio.Out != entry.OutputOut {
			t.Fatal("narration source clock changed", entry)
		}
	}
	if !reflect.DeepEqual(words, req.Assets[0].Candidates[0].Words) {
		t.Fatal("music timing changed voice words")
	}
	req.Base = &Version{Plan: after, Timeline: timeline}
	again, stable, _, err := synchronizeMusic(req, after)
	if err != nil || !reflect.DeepEqual(again, after) || !reflect.DeepEqual(stable, timeline) {
		t.Fatal("approved narration timing moved")
	}
}
