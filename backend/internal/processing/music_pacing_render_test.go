package processing

import (
	"context"
	"encoding/binary"
	"math"
	"os"
	"path/filepath"
	"testing"

	"sneepcut/backend-go/internal/music"
	"sneepcut/backend-go/internal/story"
)

// Exercise measured audio -> production planning -> exported pixels/audio.
// Known complete actions leave verified idle handles for a safe musical cut.
func TestMeasuredMusicCutSurvivesRealStudioRender(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	studioMediaFixture(t, p)
	ctx := context.Background()
	var assets []story.Asset
	for _, color := range []string{"blue", "green"} {
		file := filepath.Join(dir, color+".mp4")
		if err := p.ffmpeg(ctx, dir, "-f", "lavfi", "-i", "color=c="+color+":s=320x180:r=30:d=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", file); err != nil {
			t.Fatal(err)
		}
		key := "sources/measured-fixture/" + color + ".mp4"
		if err := p.storage.Save(ctx, file, key, "video/mp4"); err != nil {
			t.Fatal(err)
		}
		asset, err := p.Inspect(ctx, key)
		if err != nil {
			t.Fatal(err)
		}
		asset.ID, asset.Name = color, color
		asset.Candidates = []story.Candidate{{ID: color, SourceID: color, In: 0, Out: 4, Role: "b_roll", Moment: &story.VisualMoment{In: 1, Out: 3, Confidence: .95, Evidence: "Synthetic observed complete action occupies the middle two seconds with idle handles."}}}
		assets = append(assets, asset)
	}
	var attacks []float64
	for at := .512; at < 8; at += .5 {
		attacks = append(attacks, at)
	}
	pcm := measuredTimingFixture(8, attacks, 0)
	timing, err := measureMusicTiming(ctx, pcm, 8)
	if err != nil || len(timing.Events) < 5 {
		t.Fatalf("measured rhythm missing: %v %+v", err, timing)
	}
	pcmFile, musicFile := filepath.Join(dir, "rhythm.pcm"), filepath.Join(dir, "rhythm.flac")
	if err := os.WriteFile(pcmFile, pcm, 0600); err != nil {
		t.Fatal(err)
	}
	if err := p.ffmpeg(ctx, dir, "-f", "s16le", "-ar", "16000", "-ac", "1", "-i", pcmFile, "-c:a", "flac", musicFile); err != nil {
		t.Fatal(err)
	}
	key := "music/incompetech/measured-render-fixture.flac"
	if err := p.storage.Save(ctx, musicFile, key, "audio/flac"); err != nil {
		t.Fatal(err)
	}
	options := story.DefaultOptions()
	options.TargetSeconds, options.AspectRatio, options.CaptionMode = 8, "16:9", "off"
	options.Music = &story.MusicSelection{TrackID: "incompetech:fixture", Volume: .8, Sync: true, SourceAudio: "mute"}
	request := story.Request{ID: "measured-render", UserID: studioMediaTestOwner, Options: options, Assets: assets, Music: &story.PreparedMusic{Track: music.Track{ID: options.Music.TrackID, DurationSeconds: 8}, Key: key, Analysis: &story.MusicAnalysis{Model: "hosted-fixture", Duration: 8, Timing: timing, Sections: []story.MusicSection{{Start: 0, End: 8, Pace: "moderate", Energy: .6, Confidence: .9, Transition: "cut"}}}}}
	plan := story.Plan{Blocks: []story.Block{{ID: "blue", CandidateID: "blue"}, {ID: "green", CandidateID: "green"}}}
	updated, timeline, sync, err := story.BuildMusicTimeline(request, plan)
	if err != nil || len(timeline) != 2 || sync.AlignedCuts != 1 || sync.AdjustedCuts != 1 {
		t.Fatalf("no actual musical change: %v %+v %+v", err, sync, timeline)
	}
	cut := timeline[0].OutputOut
	nearest := math.Inf(1)
	for _, at := range attacks {
		nearest = math.Min(nearest, math.Abs(cut-at))
	}
	if nearest > 1.0/30 {
		t.Fatalf("planned cut %.5f misses known attack by %.5f", cut, nearest)
	}
	for _, entry := range timeline {
		if entry.Video.In > 1 || entry.Video.Out < 3 {
			t.Fatal("complete action trimmed", entry)
		}
	}
	version := story.Version{Number: 1, Plan: updated, Timeline: timeline, MusicSync: sync}
	output, err := p.RenderStory(ctx, request, version)
	if err != nil {
		t.Fatal(err)
	}
	if output.Music == nil || output.Music.AlignedCuts != 1 {
		t.Fatal("render lost measured alignment reporting", output.Music)
	}
	rendered, err := p.storyMaterialize(ctx, dir, output.Key)
	if err != nil {
		t.Fatal(err)
	}
	for _, check := range []struct {
		at      float64
		channel int
	}{{cut - 1.0/30, 2}, {cut + 1.0/30, 1}} {
		pixel, err := run(ctx, dir, p.cfg.FFmpegPath, "-v", "error", "-i", rendered, "-ss", seconds(check.at), "-frames:v", "1", "-vf", "crop=100:100:900:500,scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-")
		if err != nil || len(pixel) != 3 || pixel[check.channel] < 90 {
			t.Fatalf("cut pixels drifted at %.5f: %v %v", check.at, pixel, err)
		}
	}
	encodedAudio, err := run(ctx, dir, p.cfg.FFmpegPath, "-v", "error", "-i", rendered, "-ac", "1", "-ar", "16000", "-f", "s16le", "-")
	if err != nil {
		t.Fatal(err)
	}
	actual, err := measureMusicTiming(ctx, encodedAudio, output.Duration)
	if err != nil {
		t.Fatal(err)
	}
	distance := math.Inf(1)
	for _, event := range actual.Events {
		distance = math.Min(distance, math.Abs(cut-event.Time))
	}
	if distance > 1.0/30 {
		t.Fatalf("rendered audio and cut differ by %.5fs", distance)
	}
}

// This lane renders actual pixels and audio through Studio in disposable
// storage. It proves the composition contract, not the model's musical taste.
func TestMusicPacingRenderedOutputPreservesCutsAndMutesOnlySourceAudio(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	studioMediaFixture(t, p)
	ctx := context.Background()
	left := storySource(t, p, dir, "left-camera", "blue", 880)
	right := storySource(t, p, dir, "right-camera", "green", 1320)
	file := filepath.Join(dir, "soundtrack.flac")
	if err := p.ffmpeg(ctx, dir, "-f", "lavfi", "-i", "sine=frequency=220:sample_rate=48000:duration=4", "-c:a", "flac", file); err != nil {
		t.Fatal(err)
	}
	key := "music/incompetech/render-fixture.flac"
	if err := p.storage.Save(ctx, file, key, "audio/flac"); err != nil {
		t.Fatal(err)
	}
	selection := &story.MusicSelection{TrackID: "incompetech:render-fixture", Volume: .5, Sync: true, SourceAudio: "mute"}
	request := story.Request{ID: "music-pacing-render", UserID: studioMediaTestOwner, Options: story.Options{AspectRatio: "16:9", CaptionMode: "off", Music: selection}, Assets: []story.Asset{left, right}, Music: &story.PreparedMusic{Track: music.Track{ID: selection.TrackID, DurationSeconds: 4}, Key: key, Analysis: &story.MusicAnalysis{Model: "hosted-fixture", Duration: 4, Sections: []story.MusicSection{{Start: 0, End: 4, Pace: "moderate", Transition: "cut", Confidence: .9}}}}}
	version := story.Version{Number: 1, MusicSync: &story.MusicSync{Status: "partial", Strategy: "structure"}, Timeline: []story.Entry{
		{BlockID: "left", OutputOut: 1.5, Video: story.Interval{SourceID: left.ID, Out: 1.5}, Crop: "fit", Transition: "cut"},
		{BlockID: "right", OutputIn: 1.5, OutputOut: 3, Video: story.Interval{SourceID: right.ID, Out: 1.5}, Crop: "fit", Transition: "cut"},
	}}
	output, err := p.RenderStory(ctx, request, version)
	if err != nil {
		t.Fatal(err)
	}
	if math.Abs(output.Duration-3) > .04 || output.Music == nil || output.Music.Strategy != "structure" {
		t.Fatalf("output duration/music provenance changed: %#v", output)
	}
	rendered, err := p.storyMaterialize(ctx, dir, output.Key)
	if err != nil {
		t.Fatal(err)
	}
	for _, check := range []struct {
		at      string
		channel int
	}{{"1.43", 2}, {"1.57", 1}} {
		pixel, err := run(ctx, dir, p.cfg.FFmpegPath, "-v", "error", "-i", rendered, "-ss", check.at, "-frames:v", "1", "-vf", "crop=100:100:900:500,scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-")
		if err != nil || len(pixel) != 3 || pixel[check.channel] < 90 {
			t.Fatalf("explicit cut lost its source pixels: %v %v", pixel, err)
		}
	}
	for _, at := range []string{"0.3", "1.7"} {
		pcm, err := run(ctx, dir, p.cfg.FFmpegPath, "-v", "error", "-ss", at, "-i", rendered, "-t", "0.8", "-ac", "1", "-ar", "8000", "-f", "s16le", "-")
		if err != nil {
			t.Fatal(err)
		}
		musicLevel := renderedToneLevel(pcm, 220)
		if musicLevel < .005 || renderedToneLevel(pcm, 880) > musicLevel*.05 || renderedToneLevel(pcm, 1320) > musicLevel*.05 {
			t.Fatalf("source audio leaked or music disappeared at %s: music=%f", at, musicLevel)
		}
	}
}

func renderedToneLevel(pcm []byte, hz float64) float64 {
	real, imaginary := 0.0, 0.0
	n := len(pcm) / 2
	if n == 0 {
		return 0
	}
	for i := 0; i < n; i++ {
		value := float64(int16(binary.LittleEndian.Uint16(pcm[2*i:]))) / 32768
		phase := 2 * math.Pi * hz * float64(i) / 8000
		real += value * math.Cos(phase)
		imaginary += value * math.Sin(phase)
	}
	return 2 * math.Hypot(real, imaginary) / float64(n)
}
