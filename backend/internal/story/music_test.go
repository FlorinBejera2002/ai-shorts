package story

import (
	"context"
	"errors"
	"math"
	"reflect"
	"testing"

	"sneepcut/backend-go/internal/music"
)

func musicFixture() (*PreparedMusic, *MusicSelection) {
	return &PreparedMusic{Track: music.Track{ID: "incompetech:USUAN0000001", DurationSeconds: 10}, Key: "music/test.mp3", Beats: []float64{.2, .7, 1.2, 1.7, 2.2, 2.7, 3.2, 3.7, 4.2, 4.7, 5.2, 5.7, 6.2, 6.7, 7.2, 7.7, 8.2, 8.7, 9.2, 9.7}, BPM: 120, Confidence: .9}, &MusicSelection{TrackID: "incompetech:USUAN0000001", Volume: .18, Sync: true}
}

func TestMusicCutsPersistAndDoNotInventSourceFrames(t *testing.T) {
	prepared, selection := musicFixture()
	req := Request{Options: DefaultOptions(), Music: prepared, Assets: []Asset{{ID: "visual", Duration: 9, Candidates: []Candidate{{ID: "a", SourceID: "visual", In: 0, Out: 3}, {ID: "b", SourceID: "visual", In: 3, Out: 6}, {ID: "c", SourceID: "visual", In: 6, Out: 9}}}}}
	req.Options.Music = selection
	plan := Plan{Blocks: []Block{{ID: "a", CandidateID: "a"}, {ID: "b", CandidateID: "b"}, {ID: "c", CandidateID: "c"}}}
	adjusted, timeline, sync, err := synchronizeMusic(req, plan)
	if err != nil || sync.Status != "aligned" || sync.AdjustedCuts != 1 || math.Abs(timeline[0].OutputOut-2.7) > .000001 {
		t.Fatalf("cuts did not follow measured beat phase: %v %+v %+v", err, sync, timeline)
	}
	if plan.Blocks[0].Visual != nil || adjusted.Blocks[0].Visual == nil {
		t.Fatal("mutated input plan or failed to persist source trim")
	}
	rebuilt, err := BuildTimeline(adjusted, req.Assets)
	if err != nil || !reflect.DeepEqual(timeline, rebuilt) {
		t.Fatal("saved plan, review and render use different clocks")
	}
	if issues := ValidatePlan(adjusted, req.Assets, req.Options, nil); len(issues) != 0 {
		t.Fatalf("synced plan failed source safety: %+v", issues)
	}
	// Re-running a saved plan must not shave another fraction off every scene.
	again, second, _, err := synchronizeMusic(req, adjusted)
	if err != nil || !reflect.DeepEqual(again, adjusted) || !reflect.DeepEqual(second, timeline) {
		t.Fatal("music synchronization accumulates source trims")
	}
}

func TestMusicCannotCutOriginalAudioOrUnverifiedSpeech(t *testing.T) {
	req := fixtureRequest()
	req.Music, req.Options.Music = musicFixture()
	plan := fixturePlan()
	before, _ := BuildTimeline(plan, req.Assets)
	after, timeline, _, err := synchronizeMusic(req, plan)
	if err != nil || !reflect.DeepEqual(plan, after) || !reflect.DeepEqual(before, timeline) {
		t.Fatal("music changed spoken phrases or captions")
	}
	// No transcript is not evidence of silence (e.g. failed ASR).
	req.Assets[0].Candidates[0].Words = nil
	req.Assets[0].Candidates[0].Text = ""
	plan.Blocks[0].Visual = &Interval{SourceID: req.Assets[0].ID, In: 0, Out: 3.8}
	if _, err = BuildTimeline(plan, req.Assets); err == nil {
		t.Fatal("unverified source audio was allowed to be trimmed")
	}
}

func TestNarrationMusicSyncPreservesVoiceWordsAndPreventsVisualReuse(t *testing.T) {
	req := narrationFixture()
	req.Music, req.Options.Music = musicFixture()
	plan := Plan{Blocks: []Block{
		{ID: "first", CandidateID: "forest-scene", Crop: "fit", Visual: &Interval{SourceID: "forest", In: 0, Out: 4}, Narration: &Interval{SourceID: "voice", In: 0, Out: 4}},
		{ID: "second", CandidateID: "river-scene", Crop: "fit", Visual: &Interval{SourceID: "river", In: 0, Out: 6}, Narration: &Interval{SourceID: "voice", In: 4, Out: 10}},
	}}
	adjusted, timeline, sync, err := synchronizeMusic(req, plan)
	if err != nil || sync.AdjustedCuts != 1 || math.Abs(timeline[0].OutputOut-4.2) > .000001 {
		t.Fatalf("narration cut not aligned: %v %+v %+v", err, sync, timeline)
	}
	if timelineDuration(timeline) != 10 || adjusted.Blocks[1].Visual.In < 0 || plan.Blocks[0].Narration.Out != 4 {
		t.Fatal("narration/source coverage changed or input was mutated")
	}
	var words []Word
	for _, entry := range timeline {
		words = append(words, entry.Words...)
		if entry.Audio.In != entry.OutputIn || entry.Audio.Out != entry.OutputOut {
			t.Fatal("voice clock moved with a visual cut")
		}
	}
	if !reflect.DeepEqual(words, req.Assets[0].Candidates[0].Words) {
		t.Fatal("music synchronization changed spoken words")
	}
	req.Base = &Version{Plan: adjusted, Timeline: timeline}
	locked, stable, _, err := synchronizeMusic(req, adjusted)
	if err != nil || !reflect.DeepEqual(locked, adjusted) || !reflect.DeepEqual(stable, timeline) {
		t.Fatal("existing approved narration timing was rewritten")
	}
	if err = validateNarrationLocks(locked, req.Base); err != nil {
		t.Fatal(err)
	}
}

func TestMusicBeatConfidenceAndLoopPhase(t *testing.T) {
	prepared, _ := musicFixture()
	beats := musicBeats(prepared, 12)
	if nearestBeatDistance(beats, 10.2) > .000001 || nearestBeatDistance(beats, 10) < .1 {
		t.Fatal("loop phase was inferred from BPM instead of actual file duration")
	}
	prepared.Confidence = .1
	if len(musicBeats(prepared, 12)) != 0 {
		t.Fatal("low-confidence rhythm was presented as measured beats")
	}
	prepared.Confidence = .9
	prepared.Beats = []float64{1, math.NaN(), 2}
	if len(musicBeats(prepared, 12)) != 0 {
		t.Fatal("invalid beat timestamps reached the timeline")
	}
}

func TestMusicDoesNotRetimeAutomaticRepairVersions(t *testing.T) {
	req := narrationFixture()
	req.Music, req.Options.Music = musicFixture()
	plan := Plan{Blocks: []Block{
		{ID: "first", CandidateID: "forest-scene", Crop: "fit", Visual: &Interval{SourceID: "forest", In: 0, Out: 4}, Narration: &Interval{SourceID: "voice", In: 0, Out: 4}},
		{ID: "second", CandidateID: "river-scene", Crop: "fit", Visual: &Interval{SourceID: "river", In: 0, Out: 6}, Narration: &Interval{SourceID: "voice", In: 4, Out: 10}},
	}}
	before, err := BuildNarrationTimeline(plan, req.Assets)
	if err != nil {
		t.Fatal(err)
	}
	parent := &Version{Number: 1, Plan: plan, Timeline: before}
	state := runState{req: req, next: 2}
	version, err := state.narrationVersion(plan, parent)
	if err != nil || !reflect.DeepEqual(version.Timeline, before) || version.MusicSync.AdjustedCuts != 0 {
		t.Fatalf("a local repair unexpectedly retimed other visual blocks: %v %+v", err, version)
	}
}

type failingMusicMedia struct{ fakeMedia }

func (m *failingMusicMedia) PrepareStoryMusic(context.Context, MusicSelection) (*PreparedMusic, error) {
	return nil, errors.New("catalog unavailable")
}

func TestSelectedMusicFailureStopsBeforePaidAnalysis(t *testing.T) {
	req := fixtureRequest()
	_, req.Options.Music = musicFixture()
	media := &failingMusicMedia{}
	ai := &fakeGenerator{}
	if _, err := New(media, ai, DefaultLimits()).Run(context.Background(), req, &memoryCheckpoints{}); err == nil {
		t.Fatal("silently rendered without selected music")
	}
	if media.analyses != 0 || len(media.renders) != 0 || ai.calls != 0 {
		t.Fatal("unavailable music incurred analysis/render costs")
	}
}

func TestMusicOptionsRejectUntrustedURLsAndInvalidVolume(t *testing.T) {
	for _, selection := range []*MusicSelection{{TrackID: "https://example.test/audio.mp3", Volume: .2}, {TrackID: "incompetech:../../private", Volume: .2}, {TrackID: "incompetech:test", Volume: -1}, {TrackID: "incompetech:test", Volume: math.NaN()}, {TrackID: "incompetech:test", Volume: 1.01}} {
		options := DefaultOptions()
		options.Music = selection
		if _, err := NormalizeOptions(options); err == nil {
			t.Fatalf("accepted unsafe music options: %+v", selection)
		}
	}
	options := DefaultOptions()
	options.Music = &MusicSelection{TrackID: "incompetech:USUAN0000001", Volume: 0, Sync: true}
	if _, err := NormalizeOptions(options); err != nil {
		t.Fatal("explicit zero volume must remain a valid choice", err)
	}
}
