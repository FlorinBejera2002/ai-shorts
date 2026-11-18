package processing

import (
	"context"
	"encoding/json"
	"math"
	"reflect"
	"testing"

	"sneepcut/backend-go/internal/aiprovider"
	"sneepcut/backend-go/internal/story"
)

func TestStoryVisualMomentActualSamplesAndCheckpoint(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	ctx := context.Background()
	asset := storySource(t, p, dir, "moment-evidence", "red", 0)
	options := story.DefaultOptions()
	options.Music = &story.MusicSelection{TrackID: "incompetech:test", Sync: true, Volume: .2}
	var err error
	asset, err = p.Analyze(ctx, "moment-test", asset, options)
	if err != nil {
		t.Fatal(err)
	}
	frames := musicMomentDenseFrames(asset)
	peak := float64(frames[2]) / 30
	finding := storySemanticFinding{CandidateID: asset.Candidates[0].ID, Role: "b_roll", Idea: "A red field in the synthetic fixture.", Evidence: "The supplied source frames are red; this fixture tests timestamp provenance, not model quality.", Confidence: .95, Moment: &story.VisualMoment{In: float64(frames[1]) / 30, Out: float64(frames[3]) / 30, Peak: &peak, Confidence: .95, Evidence: "Synthetic action response anchored only to actual extracted fixture frames."}}
	raw, _ := json.Marshal(map[string]any{"candidates": []storySemanticFinding{finding}})
	reviewer := &storySemanticMock{storyReviewMock: storyReviewMock{result: string(raw)}, model: "moment-fixture"}
	p.ai = &taskProvider{providers: map[aiprovider.Task]aiprovider.Generator{aiprovider.TaskSourceAnalysis: reviewer}}
	annotated, err := p.AnalyzeStorySources(ctx, []story.Asset{asset}, options)
	if err != nil || reviewer.calls != 2 || len(reviewer.parts) != len(frames) || annotated[0].Candidates[0].Moment == nil {
		t.Fatalf("dense samples did not reach validated action analysis: calls=%d parts=%d result=%#v err=%v", reviewer.calls, len(reviewer.parts), annotated, err)
	}
	cached, err := p.Analyze(ctx, "moment-test", annotated[0], options)
	if err != nil || !reflect.DeepEqual(cached.Candidates[0].Moment, annotated[0].Candidates[0].Moment) {
		t.Fatal("local analysis cache lost protected action checkpoint", err)
	}
	_, err = p.AnalyzeStorySources(ctx, []story.Asset{cached}, options)
	if err != nil || reviewer.calls != 2 {
		t.Fatal("unchanged action sampling spent another provider call", reviewer.calls, err)
	}
	options.Music.Sync = false
	withoutMusic, err := p.AnalyzeStorySources(ctx, []story.Asset{cached}, options)
	if err != nil || reviewer.calls != 3 || withoutMusic[0].Candidates[0].Moment != nil || len(reviewer.parts) != 3 {
		t.Fatal("music option did not invalidate sampling or stale action evidence", reviewer.calls, err)
	}
}

func TestStoryVisualMomentProtectsSampleUncertainty(t *testing.T) {
	candidate := story.Candidate{ID: "action", In: 10, Out: 13}
	peak := 11.5
	proposed := &story.VisualMoment{In: 11, Out: 12, Peak: &peak, Confidence: .95, Evidence: "Frames show preparation, a hand placing a cup and its completed release, with idle handles."}
	samples := []float64{10, 10.5, 11, 11.5, 12, 12.5, 12.966666667}
	moment := validatedStoryVisualMoment(candidate, proposed, samples, .9)
	if moment == nil || moment.In != 10.5 || moment.Out != 12.5 || *moment.Peak != 11.5 || moment.Confidence != .9 {
		t.Fatalf("action was not padded by observation uncertainty: %#v", moment)
	}
	*moment.Peak = 12
	if proposed.In != 11 || proposed.Out != 12 || *proposed.Peak != 11.5 {
		t.Fatal("validating action mutated caller evidence")
	}
	whole := *proposed
	whole.In, whole.Out = samples[0], samples[len(samples)-1]
	moment = validatedStoryVisualMoment(candidate, &whole, samples, .95)
	if moment == nil || moment.In != candidate.In || moment.Out != candidate.Out {
		t.Fatal("action at observed edge discarded unseen source handles", moment)
	}
}

func TestStoryVisualMomentAbstainsOnUnsupportedTiming(t *testing.T) {
	candidate := story.Candidate{ID: "action", In: 0, Out: 5}
	peak := 2.0
	valid := &story.VisualMoment{In: 1.5, Out: 2.5, Peak: &peak, Confidence: .95, Evidence: "Observed preparation and completion are surrounded by idle frames."}
	samples := []float64{0, .5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 4.966666667}
	if validatedStoryVisualMoment(candidate, valid, samples, .95) == nil {
		t.Fatal("fully observed control should validate before unsupported variants")
	}
	for _, tc := range []struct {
		name       string
		change     func(*story.VisualMoment)
		samples    []float64
		confidence float64
	}{
		{"unseen", func(*story.VisualMoment) {}, nil, .95},
		{"unseen beginning", func(*story.VisualMoment) {}, samples[2:], .95},
		{"unseen ending", func(*story.VisualMoment) {}, samples[:len(samples)-2], .95},
		{"gap outside protected action", func(*story.VisualMoment) {}, []float64{0, .5, 1, 1.5, 2, 2.5, 3, 4, 4.5, 4.966666667}, .95},
		{"sparse", func(*story.VisualMoment) {}, []float64{0, 1.5, 2, 2.5, 4}, .95},
		{"reversed samples", func(*story.VisualMoment) {}, []float64{3, 2.5, 2, 1.5, 1}, .95},
		{"low finding confidence", func(*story.VisualMoment) {}, samples, .7},
		{"low moment confidence", func(m *story.VisualMoment) { m.Confidence = .7 }, samples, .95},
		{"nonfinite confidence", func(m *story.VisualMoment) { m.Confidence = math.NaN() }, samples, .95},
		{"invented beginning", func(m *story.VisualMoment) { m.In = 1.6 }, samples, .95},
		{"outside candidate", func(m *story.VisualMoment) { m.In = -1 }, samples, .95},
		{"two frames only", func(m *story.VisualMoment) { m.Out = 2 }, samples, .95},
		{"unsupported peak", func(m *story.VisualMoment) { *m.Peak = 2.1 }, samples, .95},
		{"peak outside action", func(m *story.VisualMoment) { *m.Peak = 3 }, samples, .95},
		{"unsubstantiated evidence", func(m *story.VisualMoment) { m.Evidence = "looks good" }, samples, .95},
	} {
		t.Run(tc.name, func(t *testing.T) {
			moment := cloneStoryVisualMoment(valid)
			tc.change(moment)
			if got := validatedStoryVisualMoment(candidate, moment, tc.samples, tc.confidence); got != nil {
				t.Fatalf("unsupported action became trim permission: %#v", got)
			}
		})
	}
}

func TestStoryVisualMomentParsingKeepsDescriptionWhenTimingIsUnsupported(t *testing.T) {
	asset := story.Asset{ID: "source", Duration: 4, Candidates: []story.Candidate{{ID: "action", SourceID: "source", In: 0, Out: 4}}}
	finding := storySemanticFinding{CandidateID: "action", Role: "b_roll", Idea: "A hand places a cup.", Evidence: "Supplied images show a cup held and then placed on the table.", Confidence: .95, Moment: &story.VisualMoment{In: 1, Out: 2, Confidence: .95, Evidence: "Preparation and completion are visible between surrounding idle frames."}}
	raw, _ := json.Marshal(map[string]any{"candidates": []storySemanticFinding{finding}})
	observed := map[string][]float64{"action": {0, .5, 1, 1.5, 2, 2.5, 3, 3.5, 3.966666667}}
	accepted, err := parseStorySemanticFindings(string(raw), []story.Asset{asset}, map[string]bool{"action": true}, observed)
	if err != nil || accepted["action"].Moment == nil || accepted["action"].Moment.In != .5 || accepted["action"].Moment.Out != 2.5 {
		t.Fatalf("observed action rejected: %#v, %v", accepted, err)
	}
	withoutProvenance, err := parseStorySemanticFindings(string(raw), []story.Asset{asset}, map[string]bool{"action": true})
	if err != nil || withoutProvenance["action"].Moment != nil || withoutProvenance["action"].Idea != finding.Idea {
		t.Fatal("a visibility boolean was accepted as action timing evidence or discarded valid description")
	}
}

func TestStoryVisualMomentSamplingIsBoundedAndDenseWhenSupported(t *testing.T) {
	asset := story.Asset{Duration: 8, Candidates: []story.Candidate{{In: 0, Out: 8}}}
	frames := storyVisualMomentSampleFrames(asset)
	if len(frames) != 24 || frames[0] != 0 || frames[23] != 239 {
		t.Fatal("short source did not use bounded dense sampling", frames)
	}
	for i := 1; i < len(frames); i++ {
		if frames[i] <= frames[i-1] || frames[i]-frames[i-1] > 15 {
			t.Fatal("short source action observations too sparse", frames)
		}
	}
	asset = story.Asset{Duration: 800}
	for i := 0; i < 100; i++ {
		asset.Candidates = append(asset.Candidates, story.Candidate{In: float64(i * 8), Out: float64(i*8 + 8)})
	}
	frames = storyVisualMomentSampleFrames(asset)
	if len(frames) != 24 || frames[0] != 0 || frames[23] != 23999 {
		t.Fatal("large source lost bounded whole-source coverage", frames)
	}
}

func TestStoryVisualMomentCloneDoesNotShareMutablePeak(t *testing.T) {
	peak := 2.0
	assets := []story.Asset{{Candidates: []story.Candidate{{Moment: &story.VisualMoment{In: 1, Out: 3, Peak: &peak}}}}}
	copy := cloneStorySemanticAssets(assets)
	if !reflect.DeepEqual(copy, assets) {
		t.Fatal("clone altered action evidence")
	}
	*copy[0].Candidates[0].Moment.Peak = 9
	if *assets[0].Candidates[0].Moment.Peak != 2 {
		t.Fatal("cloned action evidence shares pointer")
	}
}
