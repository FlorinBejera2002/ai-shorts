package processing

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"math"
	"reflect"
	"strconv"
	"testing"

	"sneepcut/backend-go/internal/captions"
	"sneepcut/backend-go/internal/story"
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
	style := captions.Default()
	style.Preset, style.Size = "word-by-word", .1
	request := story.Request{ID: "smoother-cuts", Options: story.Options{AspectRatio: "16:9", CaptionMode: "all", CaptionStyle: &style}, Assets: []story.Asset{left, right}}
	version := story.Version{
		Number: 1,
		Plan:   story.Plan{Blocks: []story.Block{{ID: "left"}, {ID: "right"}}},
		Timeline: []story.Entry{
			{BlockID: "left", OutputOut: 1, Video: story.Interval{SourceID: left.ID, Out: 1}, Audio: &story.Interval{SourceID: left.ID, Out: 1}, Crop: "fit", Transition: "cut", Words: []story.Word{{Text: "LEFT", Start: .7, End: .95}}},
			{BlockID: "right", OutputIn: 1, OutputOut: 2, Video: story.Interval{SourceID: right.ID, Out: 1}, Audio: &story.Interval{SourceID: right.ID, Out: 1}, Crop: "fit", Transition: "cut", Words: []story.Word{{Text: "RIGHT", Start: 1.05, End: 1.3}}},
		},
	}
	if narrated {
		voice := narrationAudioFixture(t, p, dir, "transition-voice.wav", false, "-c:a", "pcm_s16le")
		voice.Candidates = []story.Candidate{{ID: "voice-words", SourceID: voice.ID, Out: voice.Duration, Words: append(append([]story.Word(nil), version.Timeline[0].Words...), version.Timeline[1].Words...)}}
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
	if err != nil || next.Timeline[1].Transition != "crossfade" {
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
	if output.NativeTransitionVersion != 1 {
		t.Fatalf("verified native render lost transition policy marker: %#v", output)
	}
	before, err := p.storyMaterialize(ctx, dir, original.Key)
	if err != nil {
		t.Fatal(err)
	}
	after, err := p.storyMaterialize(ctx, dir, output.Key)
	if err != nil {
		t.Fatal(err)
	}
	originalPixels := storyTransitionPixels(t, p, before)
	softPixels := storyTransitionPixels(t, p, after)
	assertStoryBoundaryBlend(t, originalPixels, softPixels)
	assertStoryTransitionCaptions(t, p, before, after)
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
	for _, file := range []string{before, after} {
		assertStoryTransitionDuration(t, p, file)
	}
	if math.Abs(original.Duration-output.Duration) > .001 || math.Abs(output.Duration-2) > .001 {
		t.Fatalf("transition changed nominal duration: %.6f -> %.6f", original.Duration, output.Duration)
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
	t.Logf("Actual boundary frames %v; decoded audio byte-identical; captions unchanged; duration %.3fs unchanged", softPixels[26:35], output.Duration)
}

// Decode every exported frame, sampling clear picture above the caption area.
// This proves the blend exists in the delivered MP4, not just in its recipe.
func storyTransitionPixels(t *testing.T, p *Processor, file string) [][3]int {
	t.Helper()
	raw, err := run(context.Background(), "", p.cfg.FFmpegPath, "-v", "error", "-i", file, "-an", "-vf", "crop=2:2:iw/2:ih/3,scale=1:1", "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgb24", "-")
	if err != nil || len(raw) != 60*3 {
		t.Fatalf("expected all 60 frames of the two-second output, got %d bytes: %v", len(raw), err)
	}
	pixels := make([][3]int, len(raw)/3)
	for i := range pixels {
		pixels[i] = [3]int{int(raw[i*3]), int(raw[i*3+1]), int(raw[i*3+2])}
	}
	return pixels
}

func assertStoryBoundaryBlend(t *testing.T, hard, smooth [][3]int) {
	t.Helper()
	mixed := 0
	for frame, pixel := range smooth {
		if frame < 30 && (hard[frame][0] < 230 || hard[frame][2] > 15) || frame >= 30 && (hard[frame][2] < 230 || hard[frame][0] > 15) {
			t.Fatalf("hard-cut reference has wrong source at frame %d: %v", frame, hard[frame])
		}
		if frame <= 25 || frame >= 35 {
			for channel := range pixel {
				if math.Abs(float64(pixel[channel]-hard[frame][channel])) > 8 {
					t.Fatalf("picture outside transition changed at frame %d: %v -> %v", frame, hard[frame], pixel)
				}
			}
			continue
		}
		if pixel[0]+pixel[2] < 220 || pixel[1] > 15 {
			t.Fatalf("transition darkened or introduced a different picture at frame %d: %v", frame, pixel)
		}
		if pixel[0] > 15 && pixel[2] > 15 {
			mixed++
		}
		previous := smooth[frame-1]
		if pixel[0] > previous[0]+8 || pixel[2] < previous[2]-8 || previous[0]-pixel[0] > 65 || pixel[2]-previous[2] > 65 {
			t.Fatalf("transition is not a gradual red-to-blue blend at frame %d: %v -> %v", frame, previous, pixel)
		}
	}
	if mixed < 5 {
		t.Fatalf("expected multiple frames containing both shots, got %d: %v", mixed, smooth[26:35])
	}
}

func assertStoryTransitionCaptions(t *testing.T, p *Processor, before, after string) {
	t.Helper()
	for _, sample := range []struct {
		time    float64
		visible bool
	}{{.6, false}, {.8, true}, {.9, true}, {1, false}, {1.1, true}, {1.4, false}} {
		for _, file := range []string{before, after} {
			raw, err := run(context.Background(), "", p.cfg.FFmpegPath, "-v", "error", "-ss", seconds(sample.time), "-i", file, "-frames:v", "1", "-vf", "scale=320:180", "-f", "rawvideo", "-pix_fmt", "rgb24", "-")
			if err != nil || len(raw) != 320*180*3 {
				t.Fatalf("missing caption frame at %.3fs: %v", sample.time, err)
			}
			white := 0
			for offset := 320 * 120 * 3; offset+2 < len(raw); offset += 3 {
				if raw[offset] > 180 && raw[offset+1] > 180 && raw[offset+2] > 180 {
					white++
				}
			}
			if (white > 5) != sample.visible {
				t.Fatalf("caption timing changed at %.3fs in %s: %d white pixels; want visible %v", sample.time, file, white, sample.visible)
			}
		}
	}
}

func assertStoryTransitionDuration(t *testing.T, p *Processor, file string) {
	t.Helper()
	raw, err := run(context.Background(), "", p.cfg.FFprobePath, "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=duration,avg_frame_rate", "-of", "json", file)
	if err != nil {
		t.Fatal(err)
	}
	var probe struct {
		Streams []struct {
			Duration  string `json:"duration"`
			FrameRate string `json:"avg_frame_rate"`
		}
	}
	if err = json.Unmarshal(raw, &probe); err != nil || len(probe.Streams) != 1 {
		t.Fatalf("invalid video probe: %s; %v", raw, err)
	}
	duration, err := strconv.ParseFloat(probe.Streams[0].Duration, 64)
	if err != nil || math.Abs(duration-2) > .000001 || probe.Streams[0].FrameRate != "30/1" {
		t.Fatalf("output must retain two seconds at 30fps: %s", raw)
	}
}
