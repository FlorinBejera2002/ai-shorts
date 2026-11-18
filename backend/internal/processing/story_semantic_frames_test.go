package processing

import (
	"context"
	"fmt"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/aiprovider"
	"sneepcut/backend-go/internal/story"
)

func TestStorySemanticFramesUseVideoCountDespiteLongerAudio(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	ctx := context.Background()
	file := filepath.Join(dir, "audio-tail.mp4")
	if err := p.ffmpeg(ctx, dir,
		"-f", "lavfi", "-i", "color=c=red:s=160x90:r=30:d=3.333333",
		"-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=3.335",
		"-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", file); err != nil {
		t.Fatal(err)
	}
	count, err := p.storyProxyFrameCount(ctx, file)
	if err != nil || count != 100 {
		t.Fatal("fixture does not reproduce the 100-frame proxy", count, err)
	}
	key := "sources/test/audio-tail.mp4"
	if err := p.storage.Save(ctx, file, key, "video/mp4"); err != nil {
		t.Fatal(err)
	}
	asset := story.Asset{ID: "visual", ProxyKey: key, Duration: 3.335,
		Mapping:    story.TimeMap{Rate: 1, Duration: 3.335},
		Candidates: []story.Candidate{{ID: "visual-candidate", SourceID: "visual", In: 0, Out: 3.335}}}
	requested := storyVisualMomentSampleFrames(asset)
	if requested[len(requested)-1] != count {
		t.Fatal("fixture no longer requests the nonexistent container-tail frame", requested)
	}
	parts, visible, samples, err := p.storySemanticFrames(ctx, dir, []story.Asset{asset}, true)
	expected := len(requested) - 1
	if err != nil || len(parts) != expected || !visible["visual-candidate"] || len(samples["visual-candidate"]) != expected {
		t.Fatalf("missing tail discarded valid evidence: parts=%d visible=%v samples=%v err=%v", len(parts), visible, samples, err)
	}
	for i, at := range samples["visual-candidate"] {
		if at != float64(requested[i])/30 || at >= float64(count)/30 {
			t.Fatal("extracted sample was relabelled with an unobserved timestamp", i, at)
		}
	}

	// Ordinary short phone clips share a cheap broad meaning request instead of
	// oversampling every source before a candidate is selected for dense review.
	var assets []story.Asset
	for i := 0; i < 5; i++ {
		a := asset
		a.ID = fmt.Sprintf("source-%d", i)
		a.Candidates = []story.Candidate{{ID: a.ID + "-candidate", SourceID: a.ID, In: 0, Out: a.Duration}}
		assets = append(assets, a)
	}
	reviewer := &storySemanticMock{storyReviewMock: storyReviewMock{result: `{"candidates":[]}`}, model: "audio-tail-test"}
	p.ai = &taskProvider{providers: map[aiprovider.Task]aiprovider.Generator{aiprovider.TaskSourceAnalysis: reviewer}}
	options := story.DefaultOptions()
	options.Music = &story.MusicSelection{TrackID: "fixture", Sync: true, Volume: .2}
	annotated, err := p.AnalyzeStorySources(ctx, assets, options)
	if err != nil || reviewer.calls != 1 || len(annotated) != len(assets) {
		t.Fatalf("source batches did not recover efficiently: calls=%d assets=%d err=%v", reviewer.calls, len(annotated), err)
	}
	for _, a := range annotated {
		if a.SemanticAnalysisVersion == "" || strings.Contains(strings.Join(a.Warnings, " "), "frames could not") {
			t.Fatal("valid source was lost to another source's tail", a.ID, a.Warnings)
		}
	}
}

func TestAvailableStorySampleFramesPreservesObservationIdentity(t *testing.T) {
	requested := []int{100, 30, -1, 0, 30, 99}
	before := append([]int(nil), requested...)
	if got := availableStorySampleFrames(requested, 100); !reflect.DeepEqual(got, []int{0, 30, 99}) || !reflect.DeepEqual(requested, before) {
		t.Fatal("sample filtering changed identity or caller-owned indexes", got, requested)
	}
}
