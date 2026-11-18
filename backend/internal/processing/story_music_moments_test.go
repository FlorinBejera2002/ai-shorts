package processing

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/aiprovider"
	"sneepcut/backend-go/internal/story"
)

func TestMusicMomentRefinementUsesActualFramesAndRetainsCheckpoint(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	ctx := context.Background()
	asset := storySource(t, p, dir, "refined-action", "green", 0)
	options := story.DefaultOptions()
	options.Music = &story.MusicSelection{Sync: true, Volume: .3}
	var err error
	asset, err = p.Analyze(ctx, "refined-action", asset, options)
	if err != nil {
		t.Fatal(err)
	}
	asset.SemanticAnalysisVersion = "fresh-semantics"
	candidate := &asset.Candidates[0]
	candidate.Idea = "An observed complete action"
	frames := musicMomentDenseFrames(asset)
	peak := float64(frames[2]) / 30
	finding := storySemanticFinding{CandidateID: candidate.ID, Role: "supporting", Idea: candidate.Idea, Evidence: "Synthetic source frames establish timestamp provenance for the refinement.", Confidence: .95, Moment: &story.VisualMoment{In: float64(frames[1]) / 30, Out: float64(frames[3]) / 30, Peak: &peak, Confidence: .95, Evidence: "Fixture evidence covers preparation, completion and surrounding handles."}}
	raw, _ := json.Marshal(map[string]any{"candidates": []storySemanticFinding{finding}})
	reviewer := &storySemanticMock{storyReviewMock: storyReviewMock{result: string(raw)}, model: "refinement-fixture"}
	p.ai = &taskProvider{providers: map[aiprovider.Task]aiprovider.Generator{aiprovider.TaskSourceAnalysis: reviewer}}
	result, err := p.refineStoryMusicMoments(ctx, nil, []story.Asset{asset}, options)
	if err != nil || reviewer.calls != 1 || len(reviewer.parts) != len(frames) || result[0].Candidates[0].Moment == nil {
		t.Fatalf("refinement did not validate actual source frames: calls=%d parts=%d err=%v", reviewer.calls, len(reviewer.parts), err)
	}
	if result[0].Candidates[0].Idea != candidate.Idea {
		t.Fatal("refinement replaced original source meaning")
	}
	_, err = p.refineStoryMusicMoments(ctx, result, result, options)
	if err != nil || reviewer.calls != 1 {
		t.Fatal("checkpoint repeated a paid refinement", err)
	}
}

func TestMusicMomentRefinementIsDenseBoundedAndCacheAware(t *testing.T) {
	options := story.DefaultOptions()
	options.Music = &story.MusicSelection{Sync: true, Volume: .3, SourceAudio: "mute"}
	var assets []story.Asset
	for i := 0; i < 12; i++ {
		id := fmt.Sprint(i)
		assets = append(assets, story.Asset{ID: id, Duration: 20, HasAudio: true, SemanticAnalysisVersion: "fresh", Candidates: []story.Candidate{{ID: id, SourceID: id, In: 0, Out: 20, Idea: "A complete visible action", VisualScore: float64(i)}}})
	}
	selected := musicMomentRefinementCandidates(nil, assets, options)
	if len(selected) != 2 || selected[0].ID != "11" || selected[1].ID != "10" {
		t.Fatalf("refinement budget/ranking broken: %#v", selected)
	}
	totalFrames := 0
	for _, asset := range selected {
		frames := musicMomentDenseFrames(asset)
		totalFrames += len(frames)
		if len(frames) > 41 || frames[0] != 0 || frames[len(frames)-1] != 599 {
			t.Fatal("whole candidate coverage was lost", frames)
		}
		for i := 1; i < len(frames); i++ {
			if frames[i]-frames[i-1] > 15 {
				t.Fatal("dense refinement retained sparse gap")
			}
		}
	}
	if totalFrames > musicMomentFrameLimit {
		t.Fatalf("dense action payload exceeded the bounded provider request: %d frames", totalFrames)
	}
	if len(musicMomentRefinementCandidates(assets, assets, options)) != 0 {
		t.Fatal("cached analysis incurred another refinement")
	}
	assets[0].Warnings = []string{musicMomentRefinementWarning}
	if retry := musicMomentRefinementCandidates(assets, assets, options); len(retry) != 1 || retry[0].ID != "0" {
		t.Fatal("failed refinement could not recover using cached broad analysis")
	}
	for i := 1; i < len(assets); i++ {
		assets[i].Include = "excluded"
	}
	if selected := musicMomentRefinementCandidates(nil, assets, options); len(selected) != 1 || selected[0].ID != "0" {
		t.Fatal("excluded high-score footage consumed refinement capacity")
	}
	options.Music.SourceAudio = "preserve"
	if len(musicMomentRefinementCandidates(nil, assets, options)) != 0 {
		t.Fatal("spent refinement on protected source audio")
	}
}

func TestMusicMomentRefinementNeverUsesPartialLongActions(t *testing.T) {
	options := story.DefaultOptions()
	options.Music = &story.MusicSelection{Sync: true, Volume: .3}
	asset := story.Asset{ID: "long", Duration: 90, SemanticAnalysisVersion: "fresh", Candidates: []story.Candidate{{ID: "action", In: 0, Out: 90, Idea: "A continuous action"}}}
	if len(musicMomentRefinementCandidates(nil, []story.Asset{asset}, options)) != 0 {
		t.Fatal("long candidate authorized partial observation")
	}
	if len(musicMomentDenseFrames(asset)) != 0 {
		t.Fatal("long candidate sampled without bounded contract")
	}
}

func TestMusicMomentRefinementCoversSourcesBeforeExtraWindows(t *testing.T) {
	options := story.DefaultOptions()
	options.Music = &story.MusicSelection{Sync: true, Volume: .3}
	assets := []story.Asset{{ID: "many", Duration: 24, SemanticAnalysisVersion: "fresh"}}
	for i := 0; i < 6; i++ {
		assets[0].Candidates = append(assets[0].Candidates, story.Candidate{ID: fmt.Sprint(i), In: float64(i * 4), Out: float64(i*4 + 4), Idea: "An observed useful view", VisualScore: 100 - float64(i)})
	}
	for _, id := range []string{"second", "third"} {
		assets = append(assets, story.Asset{ID: id, Duration: 4, SemanticAnalysisVersion: "fresh", Candidates: []story.Candidate{{ID: id, In: 0, Out: 4, Idea: "Another useful view", VisualScore: 1}}})
	}
	selected := musicMomentRefinementCandidates(nil, assets, options)
	if len(selected) != 3 || selected[0].ID != "many" || selected[1].ID != "second" || selected[2].ID != "third" || len(selected[0].Candidates) != 4 {
		t.Fatalf("one source monopolized refinement or remaining capacity was wasted: %#v", selected)
	}
	count, frames := 0, 0
	for _, source := range selected {
		count += len(source.Candidates)
		frames += len(musicMomentDenseFrames(source))
	}
	if count != musicMomentCandidateLimit || frames > musicMomentFrameLimit {
		t.Fatalf("source diversification exceeded bounds: candidates=%d frames=%d", count, frames)
	}
}

func TestMusicMomentRefinementPreservesConfidentQualityEvidenceWithoutMoment(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	ctx := context.Background()
	asset := storySource(t, p, dir, "quality-evidence", "green", 0)
	options := story.DefaultOptions()
	options.Music = &story.MusicSelection{Sync: true, Volume: .3}
	var err error
	asset, err = p.Analyze(ctx, "quality-evidence", asset, options)
	if err != nil {
		t.Fatal(err)
	}
	asset.SemanticAnalysisVersion = "fresh"
	asset.Candidates[0].Idea = "Original broad scene meaning"
	asset.Candidates[0].Role = "b_roll"
	asset.Candidates[0].Reason = "Original observations."
	asset.Candidates[0].Dependencies = []string{"prerequisite"}
	// Existing context can be outside the six-window refinement budget.
	contextAsset := story.Asset{ID: "context", Include: "excluded", Duration: 4, Candidates: []story.Candidate{{ID: "prerequisite", In: 0, Out: 4, Idea: "Required prior context"}}}
	for _, confidence := range []float64{.95, .75} {
		t.Run(fmt.Sprint(confidence), func(t *testing.T) {
			finding := storySemanticFinding{CandidateID: asset.Candidates[0].ID, Role: "low_quality", Idea: "No useful view", Evidence: "Every sampled fixture frame is uniformly green with no visible subject; the synthetic response tests quality propagation.", Confidence: confidence}
			raw, _ := json.Marshal(map[string]any{"candidates": []storySemanticFinding{finding}})
			reviewer := &storySemanticMock{storyReviewMock: storyReviewMock{result: string(raw)}, model: "quality-fixture"}
			p.ai = &taskProvider{providers: map[aiprovider.Task]aiprovider.Generator{aiprovider.TaskSourceAnalysis: reviewer}}
			result, err := p.refineStoryMusicMoments(ctx, nil, cloneStorySemanticAssets([]story.Asset{asset, contextAsset}), options)
			if err != nil || reviewer.calls != 1 {
				t.Fatal("dense quality review did not complete", err, reviewer.calls)
			}
			candidate := result[0].Candidates[0]
			if candidate.Idea != asset.Candidates[0].Idea || candidate.Moment != nil {
				t.Fatal("quality review invented timing or replaced original meaning")
			}
			if len(candidate.Dependencies) != 1 || candidate.Dependencies[0] != "prerequisite" {
				t.Fatal("quality refinement discarded unsampled prerequisite context")
			}
			if confidence >= .85 {
				if candidate.Role != "low_quality" || !strings.Contains(candidate.Reason, finding.Evidence) {
					t.Fatal("confident quality evidence was discarded because no action moment exists", candidate)
				}
			} else if candidate.Role != "b_roll" || candidate.Reason != asset.Candidates[0].Reason {
				t.Fatal("uncertain quality finding overrode broad evidence", candidate)
			}
		})
	}
}
