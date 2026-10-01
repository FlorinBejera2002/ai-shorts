package processing

import (
	"math"
	"reflect"
	"slices"
	"testing"

	"sneepcut/backend-go/internal/story"
)

func TestStoryVisualGapsRetainSceneryAroundBriefSpeech(t *testing.T) {
	asset := story.Asset{ID: "scenery", Duration: 70, HasAudio: true}
	speech := story.Candidate{ID: "scenery-s1", SourceID: asset.ID, In: 10, Out: 11.37, Text: "An actual phrase.", Words: []story.Word{{Text: "An", Start: 10.12, End: 10.3}, {Text: "actual", Start: 10.4, End: 10.7}, {Text: "phrase.", Start: 10.8, End: 11.19}}, Role: "a_roll", Confidence: .97}
	candidates := storyCandidatesWithVisualGaps(asset, []story.Candidate{speech}, 0, .8)
	if !reflect.DeepEqual(candidates[0], speech) {
		t.Fatal("visual catalog expansion changed original speech, padding or word clocks")
	}
	var visualSeconds float64
	for _, candidate := range candidates[1:] {
		if candidate.Text != "" || len(candidate.Words) != 0 || candidate.SourceID != asset.ID || candidate.Role != "b_roll" || candidate.AudioScore != 0 || candidate.VisualScore != .8 || candidate.Confidence != 0 {
			t.Fatalf("gap invented speech, changed provenance or overstated audio evidence: %+v", candidate)
		}
		if candidate.In < speech.Out && candidate.Out > speech.In {
			t.Fatal("visual interval overlaps protected speech padding")
		}
		if candidate.Out-candidate.In < storyVisualGapMinimum || candidate.Out-candidate.In > storyVisualGapMaximum+.001 {
			t.Fatalf("unusable visual window duration: %+v", candidate)
		}
		visualSeconds += candidate.Out - candidate.In
	}
	if math.Abs(visualSeconds-68.63) > .000001 {
		t.Fatalf("brief speech hid useful scenery: %.6f seconds recovered", visualSeconds)
	}
	if got := storyCandidatesWithVisualGaps(asset, candidates, 0, .8); !reflect.DeepEqual(got, candidates) {
		t.Fatal("retry added duplicate visual intervals or changed stable candidate IDs")
	}
	asset.Candidates = candidates
	selected := candidates[len(candidates)-1]
	plan := story.Plan{Blocks: []story.Block{{ID: "scenic-shot", CandidateID: selected.ID, Crop: "fit"}}}
	timeline, err := story.BuildTimeline(plan, []story.Asset{asset})
	if err != nil || len(timeline) != 1 {
		t.Fatalf("visual interval could not become a source-backed shot: %v", err)
	}
	entry := timeline[0]
	if len(entry.Words) != 0 || entry.Video.SourceID != asset.ID || entry.Video.In != selected.In || entry.Video.Out != selected.Out || entry.Audio == nil || entry.Audio.In != selected.In || entry.Audio.Out != selected.Out {
		t.Fatal("scenic shot added captions or lost original audio/video clocks")
	}
}

func TestStoryVisualGapsExcludeMergedExistingIntervalsAndTinyGaps(t *testing.T) {
	asset := story.Asset{ID: "source", Duration: 24}
	existing := []story.Candidate{
		{ID: "source-g1", SourceID: asset.ID, In: 11.5, Out: 14, Role: "b_roll"},
		{ID: "source-s2", SourceID: asset.ID, In: 6, Out: 10, Text: "Already selected speech."},
		{ID: "source-s1", SourceID: asset.ID, In: 4, Out: 8, Role: "b_roll"},
	}
	original := slices.Clone(existing)
	result := storyCandidatesWithVisualGaps(asset, existing, 0, .6)
	if !reflect.DeepEqual(existing, original) || !reflect.DeepEqual(result[:len(existing)], original) {
		t.Fatal("gap detection reordered or changed existing candidates")
	}
	if len(result) != len(existing)+4 {
		t.Fatalf("unexpected gap window count: %+v", result)
	}
	expected := []story.Interval{{SourceID: asset.ID, In: 0, Out: 4}, {SourceID: asset.ID, In: 14, Out: 17.333333333333332}, {SourceID: asset.ID, In: 17.333333333333332, Out: 20.666666666666668}, {SourceID: asset.ID, In: 20.666666666666668, Out: 24}}
	ids := make(map[string]bool)
	for _, candidate := range result {
		if ids[candidate.ID] {
			t.Fatal("new visual ID collided with an existing candidate")
		}
		ids[candidate.ID] = true
	}
	for i, candidate := range result[len(existing):] {
		if candidate.In != expected[i].In || candidate.Out != expected[i].Out {
			t.Fatalf("overlapping/reserved or subsecond footage leaked into visual candidates: %+v", candidate)
		}
	}
}

func TestStoryVisualGapsBalanceRemainderWithoutShortTail(t *testing.T) {
	asset := story.Asset{ID: "source", Duration: 10}
	existing := []story.Candidate{{ID: "source-s1", SourceID: asset.ID, In: 0, Out: 1}}
	result := storyCandidatesWithVisualGaps(asset, existing, 0, .6)
	if len(result) != 4 || result[1].In != 1 || result[1].Out != 4 || result[2].In != 4 || result[2].Out != 7 || result[3].In != 7 || result[3].Out != 10 {
		t.Fatalf("nine-second visual gap lost its tail or made a one-second shot: %+v", result)
	}
}

func TestStoryVisualGapsPreserveExistingAllVisualAndNarrationCatalogs(t *testing.T) {
	asset := story.Asset{ID: "source", Duration: 17}
	allVisual := storyCandidates(asset, Transcript{}, 0, .7)
	if got := storyCandidatesWithVisualGaps(asset, allVisual, 0, .7); !reflect.DeepEqual(got, allVisual) {
		t.Fatal("already covered visual source received duplicate candidate intervals")
	}
	asset.Kind = "narration"
	voice := []story.Candidate{{ID: "voice-s1", SourceID: asset.ID, In: 5, Out: 6, Text: "Immutable narration."}}
	if got := storyCandidatesWithVisualGaps(asset, voice, 0, .7); !reflect.DeepEqual(got, voice) {
		t.Fatal("narration audio became visual footage")
	}
}

func TestStoryVisualGapsDoNotMaskInvalidSourceCatalogs(t *testing.T) {
	asset := story.Asset{ID: "source", Duration: 10}
	for _, candidate := range []story.Candidate{
		{ID: "wrong-source", SourceID: "other", In: 2, Out: 4},
		{ID: "invalid-clock", SourceID: asset.ID, In: math.Inf(1), Out: 4},
		{ID: "outside-source", SourceID: asset.ID, In: 2, Out: 12},
	} {
		existing := []story.Candidate{candidate}
		if got := storyCandidatesWithVisualGaps(asset, existing, 0, .6); len(got) != 1 || got[0].ID != candidate.ID {
			t.Fatal("malformed original evidence was hidden by generated visual options")
		}
	}
	asset.Duration = 1e100
	if got := storyCandidatesWithVisualGaps(asset, nil, 0, .6); len(got) != 0 {
		t.Fatal("unbounded duration allocated visual candidates")
	}
}
