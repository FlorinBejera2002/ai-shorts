package processing

import (
	"context"
	"encoding/binary"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/music"
	"sneepcut/backend-go/internal/story"
)

func musicPulsePCM(duration float64, attacks []float64) []byte {
	pcm := make([]byte, int(duration*8000)*2)
	for _, attack := range attacks {
		for i := int(attack * 8000); i < min(len(pcm)/2, int((attack+.055)*8000)); i++ {
			v := .5 * math.Sin(2*math.Pi*350*float64(i)/8000)
			binary.LittleEndian.PutUint16(pcm[i*2:], uint16(int16(v*32767)))
		}
	}
	return pcm
}

func TestStoryMusicBeatsUseObservedPhaseAndRejectIrregularAudio(t *testing.T) {
	var pulses []float64
	for at := .23; at < 12; at += .5 {
		pulses = append(pulses, at)
	}
	beats, bpm, confidence := detectStoryMusicBeats(musicPulsePCM(12, pulses))
	if len(beats) < 20 || math.Abs(bpm-120) > 1 || confidence < .9 {
		t.Fatalf("measured pulse missing: beats=%d bpm=%.2f confidence=%.2f", len(beats), bpm, confidence)
	}
	for _, at := range beats {
		phase := math.Abs(math.Remainder(at-.23, .5))
		if phase > .02 {
			t.Fatalf("beat phase %.3f is unrelated to actual pulse at %.3f", phase, at)
		}
	}
	for name, pcm := range map[string][]byte{
		"silence":       make([]byte, 12*16000),
		"one transient": musicPulsePCM(12, []float64{2}),
		"irregular":     musicPulsePCM(12, []float64{.23, .61, 1.5, 1.83, 2.6, 3.03, 3.93, 4.2, 5.07, 5.43, 6.2, 6.63, 7.6, 8.2, 8.49, 9.4, 10.08, 10.93, 11.23}),
	} {
		t.Run(name, func(t *testing.T) {
			if beats, _, confidence := detectStoryMusicBeats(pcm); len(beats) != 0 {
				t.Fatalf("invented confident %.3f beat grid for %s: %v", confidence, name, beats)
			}
		})
	}
}

func TestStoryMusicPreparationDecodesActualTempoAndDuration(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	ctx := context.Background()
	file := filepath.Join(dir, "pulse.flac")
	if err := p.ffmpeg(ctx, dir, "-f", "lavfi", "-i", "aevalsrc=if(lt(mod(t-0.23\\,0.5)\\,0.05)*gte(t\\,0.23)\\,0.5*sin(2*PI*350*t)\\,0):s=48000:d=12", "-c:a", "flac", file); err != nil {
		t.Fatal(err)
	}
	prepared, err := p.prepareStoryMusicFile(ctx, dir, music.Track{ID: "incompetech:pulse", DurationSeconds: 99, BPM: 77}, "music/incompetech/pulse.flac", file)
	if err != nil {
		t.Fatal(err)
	}
	if prepared.Track.DurationSeconds != 12 || len(prepared.Beats) < 20 || math.Abs(prepared.BPM-120) > 1 || prepared.Confidence < .9 {
		t.Fatalf("metadata was substituted for actual audio: %#v", prepared)
	}
	for _, at := range prepared.Beats {
		if math.Abs(math.Remainder(at-.23, .5)) > .025 {
			t.Fatalf("decoded onset phase wrong: %.3f", at)
		}
	}
}

func TestStoryMusicMixDucksOnlyBedLoopsAndKeepsSampleClock(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	ctx := context.Background()
	voice, bed, output := filepath.Join(dir, "voice.flac"), filepath.Join(dir, "bed.flac"), filepath.Join(dir, "mixed.flac")
	if err := p.ffmpeg(ctx, dir, "-f", "lavfi", "-i", "aevalsrc=if(between(t\\,2\\,4)\\,0.3*sin(2*PI*1000*t)\\,0)|if(between(t\\,2\\,4)\\,0.3*sin(2*PI*1000*t)\\,0):s=48000:d=8", "-c:a", "flac", voice); err != nil {
		t.Fatal(err)
	}
	if err := p.ffmpeg(ctx, dir, "-f", "lavfi", "-i", "aevalsrc=0.4*sin(2*PI*440*t):s=48000:d=2", "-c:a", "flac", bed); err != nil {
		t.Fatal(err)
	}
	filters := append([]string{"[0:a]anull[a]"}, storyMusicMixFilters(1, 8, 1)...)
	if err := p.ffmpeg(ctx, dir, "-i", voice, "-stream_loop", "-1", "-i", bed, "-filter_complex", strings.Join(filters, ";"), "-map", "[mixed]", "-c:a", "flac", output); err != nil {
		t.Fatal(err)
	}
	decode := func(file string) []float64 {
		raw, err := run(ctx, dir, p.cfg.FFmpegPath, "-v", "error", "-i", file, "-ac", "1", "-ar", "48000", "-f", "s16le", "-")
		if err != nil {
			t.Fatal(err)
		}
		values := make([]float64, len(raw)/2)
		for i := range values {
			values[i] = float64(int16(binary.LittleEndian.Uint16(raw[i*2:]))) / 32768
		}
		return values
	}
	samples := decode(output)
	if len(samples) != 8*48000 {
		t.Fatalf("mix changed the output sample clock: %d", len(samples))
	}
	tone := func(at, duration, frequency float64) float64 {
		var real, imaginary float64
		window := samples[int(at*48000):int((at+duration)*48000)]
		for i, v := range window {
			angle := 2 * math.Pi * frequency * float64(i) / 48000
			real += v * math.Cos(angle)
			imaginary += v * math.Sin(angle)
		}
		return 2 * math.Hypot(real, imaginary) / float64(len(window))
	}
	before, during, after := tone(1, .5, 440), tone(2.8, .5, 440), tone(5.5, .5, 440)
	voiceLevel := tone(2.8, .5, 1000)
	t.Logf("music amplitude before/during/after voice: %.4f / %.4f / %.4f; original voice amplitude %.4f", before, during, after, voiceLevel)
	if before < .03 || during > before*.3 || after < before*.8 {
		t.Fatalf("music did not duck and recover: %.4f %.4f %.4f", before, during, after)
	}
	if math.Abs(voiceLevel-.3) > .01 {
		t.Fatalf("voice gain changed: %.4f", voiceLevel)
	}
	if tone(.01, .05, 440) > before*.15 || tone(7.94, .05, 440) > after*.15 {
		t.Fatal("music start/end fades missing")
	}
	for _, value := range samples {
		if math.Abs(value) > .951 {
			t.Fatal("mixed audio clipped")
		}
	}
	// A loop at 6 s lies outside speech/fades; energy and phase stay continuous.
	if math.Abs(tone(5.9, .2, 440)-after) > after*.1 {
		t.Fatal("music repeat has a timing gap")
	}
}

func TestStoryMusicRenderIncludesSelectedCreditAndRejectsMissingPreparation(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	ctx := context.Background()
	asset := storySource(t, p, dir, "music-video", "blue", 0)
	silent := storySource(t, p, dir, "music-silent-video", "green", 0)
	request := story.Request{ID: "music-output", Options: story.Options{AspectRatio: "16:9", CaptionMode: "off", Music: &story.MusicSelection{TrackID: "incompetech:fixture", Volume: .4, Sync: true}}, Assets: []story.Asset{asset, silent}}
	version := story.Version{Number: 1, MusicSync: &story.MusicSync{Status: "synced", AdjustedCuts: 2}, Timeline: []story.Entry{
		{BlockID: "b", OutputOut: 1.5, Video: story.Interval{SourceID: asset.ID, Out: 1.5}, Crop: "fit"},
		{BlockID: "c", OutputIn: 1.5, OutputOut: 3, Video: story.Interval{SourceID: silent.ID, Out: 1.5}, Crop: "fit"},
	}}
	if _, err := p.RenderStory(ctx, request, version); err == nil {
		t.Fatal("missing selected music silently omitted")
	}
	file := filepath.Join(dir, "music.flac")
	if err := p.ffmpeg(ctx, dir, "-f", "lavfi", "-i", "aevalsrc=0.08*sin(2*PI*440*t)+if(lt(mod(t\\,0.5)\\,0.05)\\,0.5*sin(2*PI*350*t)\\,0):s=48000:d=6", "-c:a", "flac", file); err != nil {
		t.Fatal(err)
	}
	key := "music/incompetech/fixture.flac"
	if err := p.storage.Save(ctx, file, key, "audio/flac"); err != nil {
		t.Fatal(err)
	}
	credit := "Fixture by Test Artist, CC BY 4.0. https://creativecommons.org/licenses/by/4.0/"
	prepared, err := p.prepareStoryMusicFile(ctx, dir, music.Track{ID: request.Options.Music.TrackID, Title: "Fixture", Artist: "Test Artist", Attribution: credit, License: "CC BY 4.0"}, key, file)
	if err != nil {
		t.Fatal(err)
	}
	if len(prepared.Beats) < 8 || math.Abs(prepared.BPM-120) > 1 {
		t.Fatalf("render fixture must have measured beats: %#v", prepared)
	}
	request.Music = prepared
	result, err := p.RenderStory(ctx, request, version)
	if err != nil {
		t.Fatal(err)
	}
	if result.Music == nil || result.Music.Attribution != credit || result.Music.AdjustedCuts != 2 || result.Music.SyncStatus != "synced" || math.Abs(result.Duration-3) > .04 {
		t.Fatalf("music output credit/timing missing: %#v", result)
	}
	rendered, err := p.storyMaterialize(ctx, dir, result.Key)
	if err != nil {
		t.Fatal(err)
	}
	metadata, err := run(ctx, dir, p.cfg.FFprobePath, "-v", "error", "-show_entries", "format_tags=copyright,comment", "-of", "json", rendered)
	if err != nil || !strings.Contains(string(metadata), credit) || !strings.Contains(string(metadata), "Music trimmed, looped and mixed") {
		t.Fatalf("MP4 attribution absent: %s, %v", metadata, err)
	}
	for _, check := range []struct {
		at      string
		channel int
	}{{"1.46", 2}, {"1.50", 1}} {
		pixel, err := run(ctx, dir, p.cfg.FFmpegPath, "-v", "error", "-i", rendered, "-ss", check.at, "-frames:v", "1", "-vf", "crop=100:100:900:500,scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-")
		if err != nil || len(pixel) != 3 || pixel[check.channel] < 90 {
			t.Fatalf("visual cut/source lost at %ss: %v %v", check.at, pixel, err)
		}
	}
	// The beat in the delivered AAC must still coincide with the measured
	// source onset and the rendered visual cut, after loudness/limiter filters.
	beatPCM, err := run(ctx, dir, p.cfg.FFmpegPath, "-v", "error", "-ss", "1.3", "-i", rendered, "-t", "0.4", "-ac", "1", "-ar", "8000", "-f", "s16le", "-")
	if err != nil {
		t.Fatal(err)
	}
	previous, attack, strongest := 0.0, -1.0, 0.0
	for frame := 0; (frame+1)*160 <= len(beatPCM); frame++ {
		energy := 0.0
		for sample := 0; sample < 80; sample++ {
			value := float64(int16(binary.LittleEndian.Uint16(beatPCM[(frame*80+sample)*2:]))) / 32768
			energy += value * value
		}
		energy = math.Sqrt(energy / 80)
		if frame > 0 && energy-previous > strongest {
			strongest = energy - previous
			attack = 1.3 + float64(frame)*.01
		}
		previous = energy
	}
	if strongest < .005 || math.Abs(attack-1.5) > .025 {
		t.Fatalf("final audio pulse drifted from visual cut: attack %.3f strength %.4f", attack, strongest)
	}
	raw, err := run(ctx, dir, p.cfg.FFmpegPath, "-v", "error", "-ss", "2.1", "-i", rendered, "-t", "0.3", "-ac", "1", "-ar", "8000", "-f", "s16le", "-")
	if err != nil {
		t.Fatal(err)
	}
	var energy float64
	for i := 0; i+1 < len(raw); i += 2 {
		value := float64(int16(binary.LittleEndian.Uint16(raw[i:]))) / 32768
		energy += value * value
	}
	if len(raw) < 1000 || math.Sqrt(energy/float64(len(raw)/2)) < .005 {
		t.Fatal("selected music absent after silent visual cut")
	}
	creditPixels, err := run(ctx, dir, p.cfg.FFmpegPath, "-v", "error", "-ss", "2", "-i", rendered, "-frames:v", "1", "-vf", "crop=1000:160:50:25", "-f", "rawvideo", "-pix_fmt", "rgb24", "-")
	if err != nil {
		t.Fatal(err)
	}
	white := 0
	for i := 0; i+2 < len(creditPixels); i += 3 {
		if creditPixels[i] > 190 && creditPixels[i+1] > 190 && creditPixels[i+2] > 190 {
			white++
		}
	}
	if white < 100 {
		t.Fatal("visible credit was not burned into the exported video")
	}
	if destination := os.Getenv("SNEEPCUT_MUSIC_TEST_ARTIFACT_DIR"); destination != "" {
		if err := os.MkdirAll(destination, 0750); err != nil {
			t.Fatal(err)
		}
		data, err := os.ReadFile(rendered)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(destination, "measured-beat-render.mp4"), data, 0600); err != nil {
			t.Fatal(err)
		}
	}
}

func TestStoryMusicLiveSelectedDownload(t *testing.T) {
	trackID := os.Getenv("SNEEPCUT_LIVE_MUSIC_TRACK")
	if trackID == "" {
		t.Skip("set SNEEPCUT_LIVE_MUSIC_TRACK to verify one provider track")
	}
	p, _, _ := storyTestProcessor(t)
	selection := story.MusicSelection{TrackID: trackID, Volume: .3, Sync: true}
	first, err := p.PrepareStoryMusic(context.Background(), selection)
	if err != nil {
		t.Fatal(err)
	}
	second, err := p.PrepareStoryMusic(context.Background(), selection)
	if err != nil {
		t.Fatal(err)
	}
	if first.Key != second.Key || first.Track.DurationSeconds != second.Track.DurationSeconds || first.Track.DurationSeconds < 1 {
		t.Fatal("selected music cache or clock changed")
	}
	t.Logf("selected %s (%s), decoded %.6fs, measured BPM %.2f, confidence %.2f, %d supported beats; shared audio reused", first.Track.ID, first.Track.Title, first.Track.DurationSeconds, first.BPM, first.Confidence, len(first.Beats))
}
