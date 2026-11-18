package story

import (
	"math"
	"reflect"
	"strings"
	"testing"
)

func TestMusicOnlyPlaybackRetainsEvidenceButMutesSourceAndCaptions(t *testing.T) {
	req, plan := evidenceMusicFixture()
	req.Options.Music.SourceAudio = "mute"
	req.Assets[0].HasAudio = true
	candidate := &req.Assets[0].Candidates[0]
	candidate.Text = "Original camera dialogue"
	candidate.Words = []Word{{Text: "Original", Start: 0, End: 1}}
	peak := 4.0
	candidate.Moment.Peak = &peak
	req.Music.Analysis.Events = []MusicEvent{{Time: 3, Kind: "accent", Strength: 1, Confidence: .95, UncertaintySeconds: .1}}
	req.Music.Analysis.Model = "fixture:hosted-audio"
	req.Music.Analysis.Sections = []MusicSection{{Start: 0, End: 20, Pace: "slow", Energy: .3, Confidence: .9}}
	before := cloneAssets(req.Assets)
	updated, timeline, sync, err := synchronizeMusic(req, plan)
	if err != nil || !updated.Blocks[0].MuteSourceAudio || updated.Blocks[0].MusicWindow == nil {
		t.Fatalf("explicit music-only action could not be timed: %+v %v", updated, err)
	}
	if timeline[0].Audio != nil || len(timeline[0].Words) != 0 || !reflect.DeepEqual(before, req.Assets) || plan.Blocks[0].MuteSourceAudio {
		t.Fatal("music-only playback leaked dialogue/captions or changed immutable source evidence")
	}
	if sync.Status == "aligned" || sync.Strategy != "structure" || !strings.Contains(sync.Explanation, "precise beat synchronization is not used") {
		t.Fatalf("model estimates were certified as exact beats: %+v", sync)
	}
	if hasBlocking(ValidatePlan(updated, req.Assets, req.Options, nil)) {
		t.Fatal("explicit muted timeline failed its safety validation")
	}
	legacy := req.Options
	copy := *legacy.Music
	copy.SourceAudio = "preserve"
	legacy.Music = &copy
	if !hasBlocking(ValidatePlan(updated, req.Assets, legacy, nil)) {
		t.Fatal("a saved mute flag bypassed the user's original-audio choice")
	}
}

func TestHostedEventTimesCannotMoveCutsOrActionPeaks(t *testing.T) {
	req, plan := evidenceMusicFixture()
	peak := 4.0
	req.Assets[0].Candidates[0].Moment.Peak = &peak
	req.Music.Analysis.Model = "fixture:inaccurate-hosted"
	req.Music.Analysis.Events = []MusicEvent{{Time: 3, Kind: "downbeat", Strength: 1, Confidence: 1, UncertaintySeconds: .001}}
	req.Music.Analysis.Regions = []MusicRegion{{Start: 0, End: 20, BPM: 120, Confidence: 1}}
	before, err := BuildTimeline(plan, req.Assets)
	if err != nil {
		t.Fatal(err)
	}
	updated, timeline, result, err := synchronizeMusic(req, plan)
	if err != nil || !reflect.DeepEqual(plan, updated) || !reflect.DeepEqual(before, timeline) || result.Strategy != "structure" || result.Status != "unchanged" {
		t.Fatalf("a confident but unverified event changed the edit: %+v %+v %v", timeline, result, err)
	}
	context := musicPlanningContext(req)
	if len(musicEvidenceOnOutput(req, 8)) != 0 || len(context.Events) != 0 || len(context.Regions) != 0 {
		t.Fatal("hosted timestamps or a BPM grid leaked into the planner")
	}
}

func TestHostedPacingUsesSafeHandlesIndependentOfReportedEvents(t *testing.T) {
	req, plan := evidenceMusicFixture()
	req.Options.TargetSeconds = 15
	req.Assets[0].Duration = 16
	first := req.Assets[0].Candidates[0]
	second := first
	second.ID, second.In, second.Out = "second", 8, 16
	second.Moment = &VisualMoment{In: 10, Out: 14, Confidence: .95, Evidence: "Complete second action with observed preparation and completion."}
	req.Assets[0].Candidates = []Candidate{first, second}
	plan.Blocks = append(plan.Blocks, Block{ID: "second", CandidateID: "second"})
	req.Music.Analysis.Model = "fixture:hosted"
	req.Music.Analysis.Sections = []MusicSection{{Start: 0, End: 20, Pace: "moderate", Energy: .6, Confidence: .9}}
	updated, timeline, result, err := synchronizeMusic(req, plan)
	if err != nil || result.Status != "partial" || result.Strategy != "structure" || math.Abs(timelineDuration(timeline)-15) > 1.2 {
		t.Fatalf("soft pacing did not retain a near-target edit: %+v %+v %v", timeline, result, err)
	}
	changed := false
	for i, entry := range timeline {
		candidate := req.Assets[0].Candidates[i]
		changed = changed || entry.Video.In != candidate.In || entry.Video.Out != candidate.Out
		if entry.Video.In > candidate.Moment.In || entry.Video.Out < candidate.Moment.Out {
			t.Fatal("pacing removed part of a complete action", entry)
		}
	}
	if !changed {
		t.Fatal("verified idle handles were never considered")
	}
	req.Music.Analysis.Events = []MusicEvent{{Time: .2, Kind: "beat", Strength: 1, Confidence: 1}, {Time: 7.123, Kind: "accent", Strength: 1, Confidence: 1}}
	again, other, _, err := synchronizeMusic(req, plan)
	if err != nil || !reflect.DeepEqual(updated, again) || !reflect.DeepEqual(timeline, other) {
		t.Fatal("changing unverified event timestamps changed broad pacing", err)
	}
}

func TestUnmutingSavedMusicWindowRequiresExplicitNewEdit(t *testing.T) {
	req, plan := evidenceMusicFixture()
	req.Assets[0].HasAudio = true
	plan.Blocks[0].MuteSourceAudio = true
	plan.Blocks[0].MusicWindow = &Interval{SourceID: "visual", In: 1, Out: 7}
	before := clonePlan(plan)
	_, _, _, err := synchronizeMusic(req, plan)
	if err == nil || !strings.Contains(err.Error(), "create a new edit with original audio") || !reflect.DeepEqual(before, plan) {
		t.Fatal("unmuting silently clipped speech or rewrote the saved edit", err)
	}
}

func TestMusicOnlyPlaybackHonorsSpeechConflictAndLocks(t *testing.T) {
	req, plan := evidenceMusicFixture()
	req.Options.Music.SourceAudio = "mute"
	req.Options.PreserveOriginalSpeech = true
	if err := ValidateOptions(req.Options); err == nil || !strings.Contains(err.Error(), "conflicts") {
		t.Fatal("muting and preserving original speech were silently reconciled", err)
	}
	req.Options.PreserveOriginalSpeech = false
	plan.Blocks[0].Locked = true
	base := Version{Plan: clonePlan(plan)}
	updated := preparePlanSourceAudio(plan, req.Options)
	if !hasBlocking(ValidatePlan(updated, req.Assets, req.Options, &base)) {
		t.Fatal("changing original audio bypassed a block lock")
	}
	// Explicit zero volume remains allowed; the interface warns about silence.
	req.Options.Music.Volume = 0
	if err := ValidateOptions(req.Options); err != nil {
		t.Fatal("an explicit silent montage was rejected", err)
	}
}

func TestMusicOnlyOptionNeverMutesRecordedNarration(t *testing.T) {
	req := narrationFixture()
	req.Music, req.Options.Music = musicFixture()
	req.Options.Music.SourceAudio = "mute"
	req.Options.Music.Sync = false
	plan := Plan{Blocks: []Block{
		{ID: "first", CandidateID: "forest-scene", Crop: "fit", Visual: &Interval{"forest", 0, 4}, Narration: &Interval{"voice", 0, 4}},
		{ID: "second", CandidateID: "river-scene", Crop: "fit", Visual: &Interval{"river", 0, 6}, Narration: &Interval{"voice", 4, 10}},
	}}
	before, err := BuildNarrationTimeline(plan, req.Assets)
	if err != nil {
		t.Fatal(err)
	}
	updated, after, _, err := synchronizeMusic(req, plan)
	if err != nil || !reflect.DeepEqual(before, after) || updated.Blocks[0].MuteSourceAudio {
		t.Fatalf("music-only source setting changed the recorded narration: %+v %v", after, err)
	}
	req.Options.Music.Sync = true
	req.Music.Analysis = &MusicAnalysis{Version: "hosted", Model: "fixture:audio"}
	if context := musicPlanningContext(req); context.Duration != 10 {
		t.Fatalf("narration music context used the ignored target duration: %+v", context)
	}
}

func TestHostedSectionsFollowExcerptLoopWithoutInventingBeats(t *testing.T) {
	req, _ := evidenceMusicFixture()
	req.Music.Track.DurationSeconds = 4
	req.Music.SourceStart = 60
	req.Options.TargetSeconds = 9
	req.Music.Analysis.Model = "fixture:hosted"
	req.Music.Analysis.Summary = "A quiet passage followed by a stronger entrance."
	req.Music.Analysis.Sections = []MusicSection{
		{Start: 0, End: 2, Label: "quiet", Energy: .2, Pace: "hold", Confidence: .9},
		{Start: 2, End: 4, Label: "entrance", Energy: .8, Pace: "fast", Confidence: .9},
	}
	context := musicPlanningContext(req)
	if len(context.Sections) != 5 || context.Sections[2].Start != 4 || context.Sections[4].End != 9 || context.Model == "" || context.Summary == "" || len(context.Events) != 0 {
		t.Fatalf("section clocks or musical context were lost: %+v", context)
	}
	noRepeat := false
	req.Options.Music.Loop = &noRepeat
	if got := musicSectionsOnOutput(req, 9); len(got) != 2 {
		t.Fatal("non-looping soundtrack invented later sections", got)
	}
	if musicPacingPenalty(context.Sections, 0, .5) <= musicPacingPenalty(context.Sections, 2, 2.5) {
		t.Fatal("held musical passage did not favor a longer coherent shot")
	}
}

func TestHostedEventUncertaintyReducesItsEditingInfluence(t *testing.T) {
	exact := []MusicEvent{{Time: 3, Kind: "accent", Strength: 1, Confidence: 1, UncertaintySeconds: .05}}
	uncertain := []MusicEvent{{Time: 3, Kind: "accent", Strength: 1, Confidence: 1, UncertaintySeconds: 1}}
	if musicEventScore(uncertain, 3) >= musicEventScore(exact, 3) {
		t.Fatal("uncertain timestamp had the same weight as the more precise estimate")
	}
	req, _ := evidenceMusicFixture()
	req.Music.Analysis.Events = []MusicEvent{{Time: 3, Kind: "beat", Strength: 1, Confidence: 1, UncertaintySeconds: math.NaN()}}
	if len(musicEvidenceOnOutput(req, 8)) != 0 {
		t.Fatal("invalid uncertainty was accepted")
	}
}

func TestMusicTimingDoesNotTradeTargetDurationForDenseAccents(t *testing.T) {
	req, plan := evidenceMusicFixture()
	req.Options.TargetSeconds = 24
	req.Assets[0].Duration = 24
	req.Assets[0].Candidates = nil
	plan.Blocks = nil
	for i, id := range []string{"first", "second", "third"} {
		start := float64(i * 8)
		req.Assets[0].Candidates = append(req.Assets[0].Candidates, Candidate{ID: id, SourceID: "visual", In: start, Out: start + 8, Moment: &VisualMoment{In: start + 1, Out: start + 3, Confidence: .95, Evidence: "Complete preparation and action completion observed in the video."}})
		plan.Blocks = append(plan.Blocks, Block{ID: id, CandidateID: id})
	}
	req.Music.Track.DurationSeconds = 30
	for at := 3.0; at < 24; at += .5 {
		req.Music.Analysis.Events = append(req.Music.Analysis.Events, MusicEvent{Time: at, Kind: "accent", Strength: 1, Confidence: 1})
	}
	_, timeline, _, err := synchronizeMusic(req, plan)
	if err != nil || timelineDuration(timeline) < 24-24*.08 {
		t.Fatalf("beat matches unnecessarily collapsed the requested duration: %.2f %v", timelineDuration(timeline), err)
	}
}
