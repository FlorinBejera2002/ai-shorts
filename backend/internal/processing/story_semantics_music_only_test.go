package processing

import (
	"testing"

	"sneepcut/backend-go/internal/story"
)

func TestMusicOnlyMeaningRetainsObservedMainSubjectWithoutInventingSpeech(t *testing.T) {
	assets := []story.Asset{{ID: "hike", HasAudio: true, Candidates: []story.Candidate{
		{ID: "walking", SourceID: "hike", In: 0, Out: 4, Role: "b_roll"},
		{ID: "lake", SourceID: "hike", In: 4, Out: 8, Role: "b_roll"},
	}}}
	raw := `{"candidates":[{"candidate_id":"walking","role":"a_roll","idea":"People walking up a rocky path.","evidence":"Supplied frames show the walkers continuing up the rocky slope.","confidence":0.95,"dependencies":[]},{"candidate_id":"lake","role":"b_roll","idea":"A mountain lake.","evidence":"Supplied frames show water surrounded by rocky mountains.","confidence":0.95,"dependencies":[]}]}`
	options := story.Options{Music: &story.MusicSelection{SourceAudio: "mute"}}
	visible := map[string]bool{"walking": true, "lake": true}
	got, err := parseStorySemanticFindingsForOptions(raw, assets, visible, options)
	if err != nil || len(got) != 2 || got["walking"].Role != "supporting" || got["walking"].Idea == "" || got["lake"].Role != "b_roll" {
		t.Fatalf("visual main-subject label erased valid observations: %#v %v", got, err)
	}
	if assets[0].Candidates[0].Role != "b_roll" || assets[0].Candidates[0].Text != "" || len(assets[0].Candidates[0].Words) != 0 {
		t.Fatal("visual normalization changed source provenance")
	}
	got, err = parseStorySemanticFindingsForOptions(raw, assets, map[string]bool{"lake": true}, options)
	if err != nil || len(got) != 1 || got["walking"].Idea != "" {
		t.Fatalf("unseen muted source gained visual evidence: %#v %v", got, err)
	}
	got, err = parseStorySemanticFindings(raw, assets, visible)
	if err != nil || len(got) != 1 || got["lake"].Role != "b_roll" {
		t.Fatalf("ordinary speech validation should omit only the unsupported A-roll: %#v %v", got, err)
	}
	assets[0].Candidates[0].Text = "Saved camera dialogue from an earlier analysis."
	got, err = parseStorySemanticFindingsForOptions(raw, assets, map[string]bool{"lake": true}, options)
	if err != nil || len(got) != 1 || got["walking"].Idea != "" {
		t.Fatalf("muted saved dialogue substituted for unseen visual evidence: %#v %v", got, err)
	}
}
