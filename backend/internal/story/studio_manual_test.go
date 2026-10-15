package story

import (
	"context"
	"reflect"
	"testing"
)

type manualStudioMedia struct{ fakeMedia }

func (m *manualStudioMedia) RenderStory(ctx context.Context, req Request, v Version) (Output, error) {
	out, err := m.fakeMedia.RenderStory(ctx, req, v)
	out.StudioManualEdits = true
	out.Duration = 2
	out.StudioTimeline = []Entry{{BlockID: v.Timeline[0].BlockID, OutputOut: 2, Video: Interval{SourceID: req.Assets[0].ID, In: 1, Out: 3}}}
	return out, err
}

func TestRestyleKeepsManualResultAndGeneratedRecipeForNextEdit(t *testing.T) {
	req := fixtureRequest()
	base := fixtureBase(t, req)
	base.Output.StudioManualEdits = true
	base.Output.StudioArtifactID = "base"
	req.Base = &base
	req.Action = "restyle"
	req.VersionStart = 2
	m := &manualStudioMedia{}
	b := New(m, &fakeGenerator{}, DefaultLimits())
	result, err := b.Run(context.Background(), req, &memoryCheckpoints{})
	if err != nil {
		t.Fatal(err)
	}
	if !result.Best.Accepted || result.Best.Number != 2 || result.Best.Report.Status != "needs_review" || result.Best.Output.Duration != 2 || len(result.Best.Output.StudioTimeline) != 1 {
		t.Fatal("manual result was rejected", result.Best)
	}
	if !reflect.DeepEqual(result.Best.Timeline, base.Timeline) {
		t.Fatal("manual metadata replaced the original generated merge baseline")
	}
	if len(m.renders) != 1 {
		t.Fatal("manual intent triggered an automatic repair", len(m.renders))
	}
}

func TestManualStudioReviewDoesNotRepairIntentionalAudioOrCaptionEdits(t *testing.T) {
	req := fixtureRequest()
	v := fixtureBase(t, req)
	v.Output.StudioManualEdits = true
	v.Output.Duration = 2 // Manual cuts differ from the original generated source timeline.
	m := &fakeMedia{reports: []Report{{Coverage: Coverage{File: true}, Issues: []Issue{{ID: "old-audio", Type: "audio_cut", Severity: "major", Operation: "use_alternative"}}}}}
	b := New(m, &fakeGenerator{}, DefaultLimits())
	v.Report = b.postReview(context.Background(), req, v, readyReport(v.Number), nil)
	if v.Report.Status != "needs_review" || !v.Report.Coverage.File || v.Report.Coverage.Audio || v.Report.Coverage.Captions || v.Report.Coverage.Semantics || len(v.Report.Coverage.Incomplete) == 0 {
		t.Fatalf("manual intent was claimed verified: %+v", v.Report)
	}
	if invalidRenderedFile(v) {
		t.Fatal("manual duration change rejected despite actual file verification")
	}
	s := &runState{}
	if _, _, _, ok := s.nextRepair(v); ok {
		t.Fatal("automatic repair would overwrite manual editorial choices")
	}
	v.Report.Coverage.File = false
	if !invalidRenderedFile(v) {
		t.Fatal("manual mode bypassed actual file verification")
	}
}
