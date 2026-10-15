package processing

import (
	"bytes"
	"context"
	"errors"
	"math"
	"reflect"
	"sneepcut/backend-go/internal/story"
	"testing"
)

func TestStoryTransitionActionChangesActualFramesAndPreservesAudio(t *testing.T) {
	verifyStoryTransition(t, false)
}
func TestNarrationTransitionSoftensDefaultCutAndPreservesContinuousVoice(t *testing.T) {
	verifyStoryTransition(t, true)
}
func verifyStoryTransition(t *testing.T, narrated bool) {
	p, _, dir := storyTestProcessor(t)
	ctx := context.Background()
	left := storySource(t, p, dir, "red", "red", 440)
	right := storySource(t, p, dir, "blue", "blue", 550)
	request := story.Request{ID: "smoother-cuts", Options: story.Options{AspectRatio: "16:9", CaptionMode: "off"}, Assets: []story.Asset{left, right}}
	version := story.Version{Number: 1, Plan: story.Plan{Blocks: []story.Block{{ID: "left"}, {ID: "right"}}}, Timeline: []story.Entry{{BlockID: "left", OutputOut: 1, Video: story.Interval{SourceID: left.ID, Out: 1}, Audio: &story.Interval{SourceID: left.ID, Out: 1}, Crop: "fit", Transition: "natural"}, {BlockID: "right", OutputIn: 1, OutputOut: 2, Video: story.Interval{SourceID: right.ID, Out: 1}, Audio: &story.Interval{SourceID: right.ID, Out: 1}, Crop: "fit", Transition: "natural"}}}
	if narrated {
		voice := narrationAudioFixture(t, p, dir, "transition-voice.wav", false, "-c:a", "pcm_s16le")
		request.Options.Narration = true
		request.Assets = append(request.Assets, voice)
		for i := range version.Timeline {
			entry := &version.Timeline[i]
			entry.Audio = &story.Interval{SourceID: voice.ID, In: entry.OutputIn, Out: entry.OutputOut}
			entry.Transition = "cut"
		}
	}
	original, err := renderStoryForTest(t, p, ctx, request, version)
	if err != nil {
		t.Fatal(err)
	}
	version.Output = original
	request.Base = &version
	request.Action = "improve_transitions"
	next, err := p.PrepareStoryTransitions(ctx, request, version)
	if err != nil || next.Timeline[1].Transition != "fade" {
		t.Fatal("measured cut was not softened", err)
	}
	originalTimeline := append([]story.Entry(nil), next.Timeline...)
	originalTimeline[1].Transition = version.Timeline[1].Transition
	if !reflect.DeepEqual(version.Timeline, originalTimeline) {
		t.Fatal("transition changed speech or source clocks")
	}
	next.Number = 2
	output, err := renderStoryForTest(t, p, ctx, request, next)
	if err != nil {
		t.Fatal(err)
	}
	before, err := p.storyMaterialize(ctx, dir, original.Key)
	if err != nil {
		t.Fatal(err)
	}
	after, err := p.storyMaterialize(ctx, dir, output.Key)
	if err != nil {
		t.Fatal(err)
	}
	pixel := func(file string) []byte {
		raw, err := run(ctx, dir, p.cfg.FFmpegPath, "-v", "error", "-ss", "0.967", "-i", file, "-frames:v", "1", "-vf", "scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-")
		if err != nil || len(raw) != 3 {
			t.Fatal(err)
		}
		return raw
	}
	originalPixel, softPixel := pixel(before), pixel(after)
	brightness := func(pixel []byte) int { return int(pixel[0]) + int(pixel[1]) + int(pixel[2]) }
	if brightness(softPixel) >= brightness(originalPixel)-40 {
		t.Fatal("advertised transition did not change rendered pixels", originalPixel, softPixel)
	}
	audio := func(file string) []byte {
		raw, err := run(ctx, dir, p.cfg.FFmpegPath, "-v", "error", "-i", file, "-vn", "-ac", "1", "-ar", "48000", "-f", "s16le", "-")
		if err != nil {
			t.Fatal(err)
		}
		return raw
	}
	if !bytes.Equal(audio(before), audio(after)) {
		t.Fatal("video transition changed decoded audio")
	}
	if math.Abs(original.Duration-output.Duration) > .001 {
		t.Fatal("transition changed duration")
	}
	locked := version
	locked.Plan.Blocks = append([]story.Block(nil), version.Plan.Blocks...)
	locked.Plan.Blocks[0].Locked = true
	_, err = p.PrepareStoryTransitions(ctx, request, locked)
	var noChange *story.NoChangeError
	if !errors.As(err, &noChange) {
		t.Fatal("locked join reported success", err)
	}
	_, err = p.PrepareStoryTransitions(ctx, request, next)
	if !errors.As(err, &noChange) {
		t.Fatal("already smoothed join reported another improvement", err)
	}
	unsafe := version
	unsafe.Timeline = append([]story.Entry(nil), version.Timeline...)
	unsafe.Timeline[0].Words = []story.Word{{Text: "continuous", Start: .9, End: 1.1}}
	unsafeRequest := request
	unsafeRequest.Base = &unsafe
	_, err = p.PrepareStoryTransitions(ctx, unsafeRequest, unsafe)
	if !errors.As(err, &noChange) {
		t.Fatal("word crossing join was altered", err)
	}
	t.Logf("Actual cut pixel %v -> %v; decoded audio byte-identical; duration %.3fs unchanged", originalPixel, softPixel, output.Duration)
}
