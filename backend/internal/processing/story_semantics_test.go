package processing

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"image/jpeg"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/aiprovider"
	"sneepcut/backend-go/internal/story"
)

type storySemanticMock struct {
	storyReviewMock
	model string
}

func (m *storySemanticMock) MediaModelIdentity() string { return "mock:" + m.model }

func TestStorySourceMeaningUsesActualFramesAndReusesCheckpoint(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	ctx := context.Background()
	asset := storySource(t, p, dir, "visual", "red", 0)
	options := story.DefaultOptions()
	asset, err := p.Analyze(ctx, "source-meaning", asset, options)
	if err != nil {
		t.Fatal(err)
	}
	candidate := asset.Candidates[0]
	finding := storySemanticFinding{CandidateID: candidate.ID, Role: "b_roll", Idea: "A plain red field.", Evidence: "Source frames at 0.300, 0.800 and 1.267 seconds show the same plain red field.", Confidence: .95}
	raw, _ := json.Marshal(map[string]any{"candidates": []storySemanticFinding{finding}})
	reviewer := &storySemanticMock{storyReviewMock: storyReviewMock{result: string(raw)}, model: "first"}
	p.ai = &taskProvider{providers: map[aiprovider.Task]aiprovider.Generator{aiprovider.TaskSourceAnalysis: reviewer}}
	reserved := 0
	ctx = story.WithAIBudget(ctx, func(context.Context) error { reserved++; return nil })
	result, err := p.AnalyzeStorySources(ctx, []story.Asset{asset}, options)
	if err != nil || result[0].SemanticAnalysisVersion == "" || result[0].Candidates[0].Idea != finding.Idea || reserved != 1 || reviewer.calls != 1 {
		t.Fatalf("semantic analysis failed: %#v %v calls=%d reserved=%d", result, err, reviewer.calls, reserved)
	}
	got := result[0].Candidates[0]
	got.Role, got.Idea, got.Reason, got.Dependencies = candidate.Role, candidate.Idea, candidate.Reason, candidate.Dependencies
	if !reflect.DeepEqual(got, candidate) || !reflect.DeepEqual(asset.Candidates[0], candidate) {
		t.Fatal("source analysis changed original speech/timing/confidence or caller data")
	}
	if len(reviewer.parts) != 3 || strings.Contains(reviewer.prompt, asset.Key) || strings.Contains(reviewer.prompt, asset.ProxyKey) {
		t.Fatal("missing sampled evidence or leaked storage path")
	}
	for _, part := range reviewer.parts {
		image, err := jpeg.Decode(bytes.NewReader(part.Data))
		if err != nil || part.MIME != "image/jpeg" || !strings.Contains(part.Label, candidate.ID) {
			t.Fatalf("not an actual labeled source image: %v", err)
		}
		r, g, b, _ := image.At(image.Bounds().Dx()/2, image.Bounds().Dy()/2).RGBA()
		if r <= g+20000 || r <= b+20000 {
			t.Fatal("wrong source visual evidence")
		}
	}
	// Domain calls local Analyze again on resume; its immutable ASR cache must
	// retain valid semantic checkpoint annotations without another native run.
	ffmpeg := p.cfg.FFmpegPath
	p.cfg.FFmpegPath = filepath.Join(dir, "must-not-run-on-cache-hit")
	cached, err := p.Analyze(ctx, "source-meaning", result[0], options)
	if err != nil || cached.SemanticAnalysisVersion != result[0].SemanticAnalysisVersion || cached.Candidates[0].Idea != finding.Idea {
		t.Fatalf("local cache lost semantic annotation: %#v %v", cached, err)
	}
	_, err = p.AnalyzeStorySources(ctx, []story.Asset{cached}, options)
	if err != nil || reviewer.calls != 1 || reserved != 1 {
		t.Fatal("semantic checkpoint spent another call")
	}
	p.cfg.FFmpegPath = ffmpeg
	reviewer.model = "second"
	updated, err := p.AnalyzeStorySources(ctx, []story.Asset{cached}, options)
	if err != nil || reviewer.calls != 2 || reserved != 2 || updated[0].SemanticAnalysisVersion == cached.SemanticAnalysisVersion {
		t.Fatal("configured AI model change reused stale meaning")
	}
	denied := story.WithAIBudget(context.Background(), func(context.Context) error { return errors.New("budget") })
	reviewer.model = "third"
	blocked, err := p.AnalyzeStorySources(denied, []story.Asset{updated[0]}, options)
	if err != nil || reviewer.calls != 2 || !strings.Contains(strings.Join(blocked[0].Warnings, " "), "budget") {
		t.Fatal("source analysis exceeded durable AI budget")
	}
}

func TestStorySourceMeaningRejectsFabricationAndAbstainsOnUnseenVisuals(t *testing.T) {
	assets := []story.Asset{{ID: "source", Candidates: []story.Candidate{{ID: "a", SourceID: "source"}, {ID: "b", SourceID: "source", Text: "Provisional ASR text."}}}}
	valid := `{"candidates":[{"candidate_id":"a","role":"b_roll","idea":"Red field.","evidence":"Actual frame at 0.5 seconds is a plain red field.","confidence":0.9,"dependencies":[]}]}`
	for _, invalid := range []string{
		strings.Replace(valid, `"candidate_id":"a"`, `"candidate_id":"invented"`, 1),
		strings.Replace(valid, `"idea":"Red field."`, `"idea":"Red field.","text":"Invented narration"`, 1),
		strings.Replace(valid, `"dependencies":[]`, `"dependencies":["a"]`, 1),
		strings.Replace(valid, `"dependencies":[]`, `"dependencies":["missing"]`, 1),
		strings.Replace(valid, `"confidence":0.9`, `"confidence":2`, 1),
		valid + `{"ignored":"extra response"}`,
		`{"candidates":[{"candidate_id":"a","role":"b_roll","idea":"Red field.","evidence":"Observed red source frame.","confidence":0.9,"dependencies":["b"]},{"candidate_id":"b","role":"a_roll","idea":"Spoken description.","evidence":"Provisional ASR description.","confidence":0.9,"dependencies":["a"]}]}`,
	} {
		if _, err := parseStorySemanticFindings(invalid, assets, map[string]bool{"a": true}); err == nil {
			t.Fatal("fabricated or cyclic source metadata accepted", invalid)
		}
	}
	for _, data := range []struct {
		raw     string
		visible map[string]bool
	}{
		{valid, nil},
		{strings.Replace(valid, `"confidence":0.9`, `"confidence":0.5`, 1), map[string]bool{"a": true}},
	} {
		findings, err := parseStorySemanticFindings(data.raw, assets, data.visible)
		if err != nil || len(findings) != 0 {
			t.Fatal("unseen or ambiguous visual inferred")
		}
	}
	findings, err := parseStorySemanticFindings(valid, assets, map[string]bool{"a": true})
	if err != nil || findings["a"].Idea != "Red field." {
		t.Fatal("observed source evidence rejected")
	}
	processor := &Processor{}
	result, err := processor.AnalyzeStorySources(context.Background(), assets, story.DefaultOptions())
	if err != nil || len(result[0].Warnings) == 0 || !reflect.DeepEqual(result[0].Candidates, assets[0].Candidates) {
		t.Fatal("offline source analysis did not preserve local source candidates")
	}
}

func TestStorySourceMeaningSamplesAreBoundedAcrossIntervals(t *testing.T) {
	asset := story.Asset{Duration: 800}
	for i := 0; i < 100; i++ {
		asset.Candidates = append(asset.Candidates, story.Candidate{In: float64(i * 8), Out: float64(i*8 + 8)})
	}
	frames := storySemanticSampleFrames(asset, storySemanticFramesPerClip)
	if len(frames) != 24 || frames[0] > 100 || frames[len(frames)-1] < 23000 {
		t.Fatal("sampling lost whole-source distribution", frames)
	}
	for i, frame := range frames {
		if i > 0 && frame <= frames[i-1] || frame < 0 || frame >= 24000 {
			t.Fatal("invalid source sample frame", frames)
		}
	}
}

func TestNarrationSourceMeaningAcceptsVisualSubsetAndNormalizesMutedInterviewRole(t *testing.T) {
	visual := story.Asset{ID: "video", Candidates: []story.Candidate{{ID: "interview", SourceID: "video", Role: "b_roll"}, {ID: "unseen", SourceID: "video", Role: "b_roll"}}}
	voice := story.Asset{ID: "voice", Kind: "narration", Candidates: []story.Candidate{{ID: "voice-phrase", SourceID: "voice", Role: "a_roll", Text: "This describes the scene."}}}
	raw := `{"candidates":[{"candidate_id":"interview","role":"a_roll","idea":"A person seated for an interview.","evidence":"Actual supplied frames show one seated person facing the camera.","confidence":0.95,"dependencies":[]}]}`
	findings, err := parseStorySemanticFindings(raw, []story.Asset{visual, voice}, map[string]bool{"interview": true})
	if err != nil || len(findings) != 1 || findings["interview"].Role != "supporting" || findings["interview"].Idea != "A person seated for an interview." {
		t.Fatalf("muted interview or partial visual-only coverage rejected: %#v %v", findings, err)
	}
	if visual.Candidates[0].Text != "" || voice.Candidates[0].Text != "This describes the scene." {
		t.Fatal("normalizing a visual label altered speech")
	}
	visual.Candidates[1].Text = "Spoken words."
	mixed := `{"candidates":[{"candidate_id":"interview","role":"a_roll","idea":"A person seated for an interview.","evidence":"Actual supplied frames show one seated person facing the camera.","confidence":0.95,"dependencies":[]},{"candidate_id":"unseen","role":"a_roll","idea":"A person speaking.","evidence":"ASR text provisionally indicates spoken commentary.","confidence":0.9,"dependencies":[]}]}`
	findings, err = parseStorySemanticFindings(mixed, []story.Asset{visual}, map[string]bool{"interview": true})
	if _, invented := findings["interview"]; err != nil || invented || findings["unseen"].Role != "a_roll" {
		t.Fatal("source-only mode accepted invented spoken A-roll or discarded valid findings", findings, err)
	}
}

func TestSourceMeaningDiagnosticsIdentifyBoundedInvalidEvidence(t *testing.T) {
	assets := []story.Asset{{ID: "source", Candidates: []story.Candidate{{ID: "known", SourceID: "source"}}}}
	for _, test := range []struct{ raw, diagnostic string }{
		{`{"candidates":[{"candidate_id":"invented-id","role":"b_roll"}]}`, `candidate_id is unknown or duplicated: "invented-id"`},
		{`{"candidates":[{"candidate_id":"known","role":"unsupported-role"}]}`, `candidates[0].role is unsupported: "unsupported-role"`},
		{`{"candidates":[{"candidate_id":"known","source_id":"source"}]}`, `unknown field`},
		{`{"candidates":[{"candidate_id":"known","role":"b_roll","dependencies":["missing"]}]}`, `candidates[0].dependencies[0]`},
	} {
		_, err := parseStorySemanticFindings(test.raw, assets, nil)
		if err == nil || !strings.Contains(err.Error(), test.diagnostic) || strings.ContainsAny(err.Error(), "\r\n") || len(err.Error()) > 600 {
			t.Fatalf("diagnostic did not identify bounded schema error %q: %v", test.diagnostic, err)
		}
	}
}

// A 25-clip upload once sent 600 frames in one request and lost all meaning.
func TestStorySourceMeaningSharesFrameBudgetAcrossSources(t *testing.T) {
	var assets []story.Asset
	for i := 0; i < 25; i++ {
		asset := story.Asset{Duration: 60}
		for c := 0; c < 10; c++ {
			asset.Candidates = append(asset.Candidates, story.Candidate{In: float64(c * 6), Out: float64(c*6 + 6)})
		}
		assets = append(assets, asset)
	}
	assets = append(assets, story.Asset{Kind: "narration", Candidates: assets[0].Candidates})
	total := 0
	for i, limit := range storySemanticFrameLimits(assets) {
		frames := storySemanticSampleFrames(assets[i], limit)
		if assets[i].Kind == "narration" && len(frames) != 0 || assets[i].Kind != "narration" && len(frames) < 2 {
			t.Fatalf("source %d got %d frames", i, len(frames))
		}
		total += len(frames)
	}
	if total > storySemanticFrameBudget {
		t.Fatalf("request carries %d frames, budget %d", total, storySemanticFrameBudget)
	}
	if limits := storySemanticFrameLimits(assets[:1]); limits[0] != storySemanticFramesPerClip {
		t.Fatalf("single source lost its per-clip sampling: %v", limits)
	}
	if frames := storySemanticSampleFrames(assets[0], 1); len(frames) != 1 {
		t.Fatalf("single-frame sample: %v", frames)
	}
}

func TestStorySourceMeaningBatchesBoundCandidatesPerRequest(t *testing.T) {
	sized := func(n int) story.Asset { return story.Asset{Candidates: make([]story.Candidate, n)} }
	assets := []story.Asset{sized(10), sized(10), sized(10), {Kind: "narration"}, sized(30), sized(2)}
	got := storySemanticBatches(assets, []int{0, 1, 2, 4, 5})
	if want := [][]int{{0, 1}, {2}, {4}, {5}}; !reflect.DeepEqual(got, want) {
		t.Fatalf("batches %v, want %v", got, want)
	}
	var many []story.Asset
	var indexes []int
	for i := 0; i < 45; i++ {
		many, indexes = append(many, story.Asset{}), append(indexes, i)
	}
	if got := storySemanticBatches(many, indexes); len(got) != 3 || len(got[0]) != storySemanticBatchSources {
		t.Fatalf("source-count limit not applied: %v", got)
	}
}
