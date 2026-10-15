package processing

import (
	"context"
	"fmt"
	"math"
	"path/filepath"
	"testing"

	"sneepcut/backend-go/internal/media"
	"sneepcut/backend-go/internal/story"
)

func TestStudioLegacyCaptionSizesKeepExactShortEdgeGeometry(t *testing.T) {
	for _, size := range []int{12, 18, 57, 58, 60, 72, 120} {
		t.Run(fmt.Sprint(size), func(t *testing.T) {
			dir := t.TempDir()
			storage, err := media.NewLocalStorage(filepath.Join(dir, "media"))
			if err != nil {
				t.Fatal(err)
			}
			defer storage.Close()
			p := New(Config{TempDir: dir}, storage, nil)
			plan := captureStudioPlan(t, p)
			words := []story.Word{{Text: "Original", Start: .1, End: .9}}
			req := story.Request{ID: "legacy-size", UserID: studioTestOwner, Options: story.Options{AspectRatio: "16:9", CaptionMode: "all", SubtitleSize: size}, Assets: []story.Asset{{ID: "source", Key: "uploads/source.mp4", Duration: 1, Width: 1920, Height: 1080, HasAudio: true, Candidates: []story.Candidate{{ID: "phrase", SourceID: "source", Out: 1, Words: words}}}}}
			v := story.Version{Number: 1, Timeline: []story.Entry{{BlockID: "block", CandidateID: "phrase", OutputOut: 1, Video: story.Interval{SourceID: "source", Out: 1}, Audio: &story.Interval{SourceID: "source", Out: 1}, Words: words, Crop: "fit"}}}
			_, _ = p.RenderStory(context.Background(), req, v)
			if plan.Captions == nil {
				t.Fatal("valid legacy size did not reach Studio", size)
			}
			want := math.Round(float64(size) * float64(min(plan.Width, plan.Height)) / 360)
			if plan.Captions.FontSizePX != want || plan.Captions.Style.Validate() != nil {
				t.Fatal("legacy caption size changed or invalid modern style", plan.Captions, want)
			}
			if size == 60 {
				writeStudioContractFixture(t, "legacy-caption-size60", plan)
			}
		})
	}
}
