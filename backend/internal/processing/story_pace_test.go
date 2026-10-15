package processing

import (
	"context"
	"math"
	"path/filepath"
	"sneepcut/backend-go/internal/story"
	"testing"
)

func TestFasterPaceMeasuresSilenceAndPreservesSpeechClock(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	ctx := context.Background()
	sourceFile := filepath.Join(dir, "pace.mp4")
	if err := p.ffmpeg(ctx, dir, "-f", "lavfi", "-i", "color=c=green:s=320x180:r=30:d=4", "-f", "lavfi", "-i", "aevalsrc=if(between(t\\,1\\,3)\\,0.2*sin(2*PI*440*t)\\,0):s=48000:d=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", sourceFile); err != nil {
		t.Fatal(err)
	}
	key := "sources/pace.mp4"
	if err := p.storage.Save(ctx, sourceFile, key, "video/mp4"); err != nil {
		t.Fatal(err)
	}
	asset, err := p.Inspect(ctx, key)
	if err != nil {
		t.Fatal(err)
	}
	asset.ID = "source"
	asset.Include = "auto"
	asset.Candidates = []story.Candidate{{ID: "phrase", SourceID: "source", In: 0, Out: 4, Text: "Nu schimba vocea.", Confidence: .95, Words: []story.Word{{Text: "Nu", Start: 1, End: 1.3}, {Text: "schimba", Start: 1.5, End: 2.2}, {Text: "vocea.", Start: 2.4, End: 3}}}}
	req := story.Request{ID: "pace-fixture", Assets: []story.Asset{asset}, Options: story.DefaultOptions(), Action: "faster"}
	req.Options.AspectRatio = "16:9"
	original := story.Plan{Blocks: []story.Block{{ID: "block", CandidateID: "phrase"}}}
	plan, err := p.TightenStoryPace(ctx, req, original)
	if err != nil {
		t.Fatal(err)
	}
	trim := plan.Blocks[0].Pace
	if trim == nil || trim.In < .7 || trim.In > .81 || trim.Out < 3.19 || trim.Out > 3.3 {
		t.Fatalf("unmeasured edge trim: %#v", trim)
	}
	if original.Blocks[0].Pace != nil {
		t.Fatal("mutated previous plan")
	}
	timeline, err := story.BuildTimeline(plan, req.Assets)
	if err != nil {
		t.Fatal(err)
	}
	if math.Abs(timeline[0].Words[1].Start-(1.5-trim.In)) > .001 || math.Abs((timeline[0].Words[1].End-timeline[0].Words[1].Start)-.7) > .001 {
		t.Fatal("word timing accelerated")
	}
	if timeline[0].Video != *timeline[0].Audio {
		t.Fatal("audio/video source clocks differ")
	}
	out, err := renderStoryForTest(t, p, ctx, req, story.Version{Number: 2, Plan: plan, Timeline: timeline})
	if err != nil {
		t.Fatal(err)
	}
	if math.Abs(out.Duration-(trim.Out-trim.In)) > .05 {
		t.Fatalf("actual export duration %v != %v", out.Duration, trim.Out-trim.In)
	}
	if got, err := p.Inspect(ctx, key); err != nil || math.Abs(got.Duration-4) > .05 {
		t.Fatal("original changed", err)
	}
	original.Blocks[0].Locked = true
	unchanged, err := p.TightenStoryPace(ctx, req, original)
	if err != nil || unchanged.Blocks[0].Pace != nil {
		t.Fatal("locked clip changed", err)
	}
	t.Logf("rendered pace export %.3fs; original %.3fs; source cut %.3f–%.3f; word durations retained", out.Duration, asset.Duration, trim.In, trim.Out)
}

func TestPaceIgnoresInternalPausesAndUnverifiedSpeech(t *testing.T) {
	c := story.Candidate{SourceID: "a", In: 0, Out: 5, Confidence: .9, Words: []story.Word{{Text: "A", Start: .1, End: 1}, {Text: "B", Start: 4, End: 4.9}}}
	trim := paceSilenceBounds("silence_start: 1.2 silence_end: 3.8", 0, 5, c)
	if trim.In != 0 || trim.Out != 5 {
		t.Fatal("internal pause removed")
	}
	if story.PaceEligible(story.Block{}, c) {
		t.Fatal("no edge gap eligible")
	}
	c.Words = nil
	if story.PaceEligible(story.Block{}, c) {
		t.Fatal("unknown speech eligible")
	}
}
