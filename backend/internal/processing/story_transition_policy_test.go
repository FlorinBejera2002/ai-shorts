package processing

import (
	"context"
	"errors"
	"path/filepath"
	"reflect"
	"testing"

	"sneepcut/backend-go/internal/story"
)

func TestStoryTransitionPolicyPreservesNaturalNoOpAndLegacyUpgrade(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	ctx := context.Background()
	// This is a preexisting hard-cut fixture, not a second production renderer.
	file := filepath.Join(dir, "old-cut.mp4")
	if err := p.ffmpeg(ctx, dir, "-f", "lavfi", "-i", "color=red:s=320x180:r=30:d=1", "-f", "lavfi", "-i", "color=blue:s=320x180:r=30:d=1", "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v]", "-map", "[v]", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", file); err != nil {
		t.Fatal(err)
	}
	key := "clips/old-natural/clip.mp4"
	if err := p.storage.Save(ctx, file, key, "video/mp4"); err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		name      string
		version   int
		treatment string
		noChange  bool
	}{
		{name: "old natural", treatment: "natural"},
		{name: "old implicit", treatment: ""},
		{name: "rendered natural", version: 1, treatment: "natural", noChange: true},
		{name: "rendered implicit", version: 1, treatment: "", noChange: true},
		{name: "explicit cut", version: 1, treatment: "cut"},
		{name: "legacy fade", version: 1, treatment: "fade"},
		{name: "already crossfade", version: 1, treatment: "crossfade", noChange: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			version := story.Version{Output: story.Output{Key: key, NativeTransitionVersion: test.version}, Timeline: []story.Entry{
				{BlockID: "left", OutputOut: 1, Video: story.Interval{SourceID: "left", Out: 1}},
				{BlockID: "right", OutputIn: 1, OutputOut: 2, Video: story.Interval{SourceID: "right", Out: 1}, Transition: test.treatment},
			}}
			request := story.Request{Base: &version, Action: "improve_transitions"}
			next, err := p.PrepareStoryTransitions(ctx, request, version)
			var noChange *story.NoChangeError
			if test.noChange {
				if !errors.As(err, &noChange) || !reflect.DeepEqual(next, version) {
					t.Fatalf("already applied smoothing reported a changed result: %+v %v", next, err)
				}
				return
			}
			if err != nil || next.Timeline[1].Transition != "crossfade" {
				t.Fatalf("eligible old output was not upgraded: %+v %v", next, err)
			}
			next.Timeline[1].Transition = test.treatment
			if !reflect.DeepEqual(next, version) {
				t.Fatal("upgrade changed source, audio or caption clocks")
			}
		})
	}
}
