package processing

import (
	"context"
	"encoding/binary"
	"math"
	"math/rand"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"sneepcut/backend-go/internal/story"
)

func measuredTimingFixture(duration float64, attacks []float64, noise float64) []byte {
	pcm := make([]byte, int(duration*waveformSampleRate)*2)
	random := rand.New(rand.NewSource(71))
	for i := 0; i < len(pcm)/2; i++ {
		time := float64(i) / waveformSampleRate
		value := noise * (random.Float64()*2 - 1)
		for n, attack := range attacks {
			delta := time - attack
			if delta >= 0 && delta < .11 {
				// A damped kick and brighter percussion alternate; attacks are
				// deliberately not aligned to sample hops or a whole-second grid.
				frequency := 92.0 + float64(n%2)*670
				value += (.35 + float64(n%3)*.12) * math.Exp(-delta*38) * math.Cos(2*math.Pi*frequency*delta)
			}
		}
		value = math.Max(-.99, math.Min(.99, value))
		binary.LittleEndian.PutUint16(pcm[2*i:], uint16(int16(value*32767)))
	}
	return pcm
}

func TestMeasuredMusicTimingOffGridPrecisionAndTempoChange(t *testing.T) {
	var attacks []float64
	for time := .237; time < 10; time += .487 {
		attacks = append(attacks, time)
	}
	for time := 11.173; time < 23; time += .653 {
		attacks = append(attacks, time)
	}
	timing, err := measureMusicTiming(context.Background(), measuredTimingFixture(24, attacks, .002), 24)
	if err != nil || len(timing.Events) < 28 {
		t.Fatalf("failed to measure both local tempi: events=%d err=%v", len(timing.Events), err)
	}
	assertMeasuredEventsMatch(t, timing, attacks, .02)
	if !validMeasuredMusicTiming(timing, 24) {
		t.Fatal("detector emitted invalid timing")
	}
}

func assertMeasuredEventsMatch(t *testing.T, timing *story.MusicTiming, attacks []float64, tolerance float64) {
	t.Helper()
	for _, event := range timing.Events {
		distance := math.Inf(1)
		for _, attack := range attacks {
			distance = math.Min(distance, math.Abs(event.Time-attack))
		}
		if distance > tolerance {
			t.Fatalf("invented or imprecise attack at %.4f, nearest actual attack %.4f away", event.Time, distance)
		}
	}
}

func TestMeasuredMusicTimingDoesNotFillSilentGaps(t *testing.T) {
	var attacks []float64
	for time := .373; time < 18; time += .5 {
		if time < 6 || time > 11 {
			attacks = append(attacks, time)
		}
	}
	timing, err := measureMusicTiming(context.Background(), measuredTimingFixture(19, attacks, 0), 19)
	if err != nil || len(timing.Events) < 15 {
		t.Fatalf("expected qualified rhythm outside gap, got %+v %v", timing, err)
	}
	assertMeasuredEventsMatch(t, timing, attacks, .02)
	for _, event := range timing.Events {
		if event.Time > 6 && event.Time < 11 {
			t.Fatal("fabricated beat inside silence", event)
		}
	}
}

func TestMeasuredMusicTimingAbstainsOnSilenceNoiseAmbientAndIrregularAttacks(t *testing.T) {
	irregular := []float64{.41, 1.173, 2.557, 3.811, 4.099, 5.731, 7.223, 7.981, 8.391, 10.113, 11.881, 13.117, 14.009}
	fixtures := map[string][]byte{
		"silence":   measuredTimingFixture(16, nil, 0),
		"noise":     measuredTimingFixture(16, nil, .3),
		"irregular": measuredTimingFixture(16, irregular, 0),
	}
	ambient := make([]byte, 16*waveformSampleRate*2)
	for i := 0; i < len(ambient)/2; i++ {
		time := float64(i) / waveformSampleRate
		v := .3 * math.Pow(math.Sin(math.Pi*time/16), 2) * (math.Sin(2*math.Pi*220*time) + .3*math.Sin(2*math.Pi*331*time))
		binary.LittleEndian.PutUint16(ambient[2*i:], uint16(int16(v*32767)))
	}
	fixtures["ambient"] = ambient
	for name, pcm := range fixtures {
		t.Run(name, func(t *testing.T) {
			timing, err := measureMusicTiming(context.Background(), pcm, 16)
			if err != nil || len(timing.Events) != 0 {
				t.Fatalf("uncertain audio acquired precise beat claims: %+v %v", timing, err)
			}
		})
	}
}

func TestMeasuredMusicTimingUsesExcerptClock(t *testing.T) {
	var attacks []float64
	for time := .237; time < 14; time += .5 {
		attacks = append(attacks, time)
	}
	pcm := measuredTimingFixture(15, attacks, 0)
	start := 2.113
	startSample := int(start * waveformSampleRate)
	start = float64(startSample) / waveformSampleRate
	shifted := make([]float64, 0)
	for _, time := range attacks {
		if time >= start {
			shifted = append(shifted, time-start)
		}
	}
	timing, err := measureMusicTiming(context.Background(), pcm[startSample*2:], 15-start)
	if err != nil || len(timing.Events) < 15 {
		t.Fatal("excerpt timing missing", err)
	}
	assertMeasuredEventsMatch(t, timing, shifted, .02)
}

func TestMeasuredMusicTimingCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := measureMusicTiming(ctx, measuredTimingFixture(2, nil, 0), 2); err != context.Canceled {
		t.Fatal("cancellation lost", err)
	}
}

func TestMeasuredMusicTimingAttackEnvelopes(t *testing.T) {
	for _, rise := range []float64{.002, .008, .016, .03, .12, .3} {
		t.Run(seconds(rise), func(t *testing.T) {
			pcm := make([]byte, 16*waveformSampleRate*2)
			var attacks []float64
			for time := .237; time < 15; time += .571 {
				attacks = append(attacks, time)
			}
			for i := 0; i < len(pcm)/2; i++ {
				time, value := float64(i)/waveformSampleRate, 0.0
				for n, attack := range attacks {
					delta := time - attack
					if delta < 0 || delta > rise+.18 {
						continue
					}
					envelope := math.Min(1, delta/rise) * math.Exp(-math.Max(0, delta-rise)*30)
					value += (.2 + .06*float64(n%5)) * envelope * math.Cos(2*math.Pi*(150+float64(n%2)*420)*delta)
				}
				binary.LittleEndian.PutUint16(pcm[2*i:], uint16(int16(value*32767)))
			}
			timing, err := measureMusicTiming(context.Background(), pcm, 16)
			if err != nil {
				t.Fatal(err)
			}
			if rise <= .016 && len(timing.Events) < 16 {
				t.Fatalf("clear attacks lost: %d", len(timing.Events))
			}
			if rise >= .12 && len(timing.Events) > 0 {
				t.Fatalf("broad attacks claimed precise: %+v", timing.Events[:min(5, len(timing.Events))])
			}
			assertMeasuredEventsMatch(t, timing, attacks, .02)
		})
	}
}

func TestMeasuredMusicTimingSyncopationDoesNotInventMissingBeats(t *testing.T) {
	var attacks []float64
	for beat := 0; beat < 36; beat++ {
		if beat%4 != 2 {
			attacks = append(attacks, .237+float64(beat)*.5)
		}
		if beat%4 == 1 {
			attacks = append(attacks, .237+float64(beat)*.5+.25)
		}
	}
	timing, err := measureMusicTiming(context.Background(), measuredTimingFixture(19, attacks, .003), 19)
	if err != nil {
		t.Fatal(err)
	}
	assertMeasuredEventsMatch(t, timing, attacks, .02)
	// Sparse syncopation may abstain. Every accepted event must still be a real
	// attack; a metrically plausible but absent beat is never an output event.
}

func TestMeasuredMusicTimingPercussionOverSustainedInstrument(t *testing.T) {
	var attacks []float64
	for at := .237; at < 16; at += .513 {
		attacks = append(attacks, at)
	}
	pcm := measuredTimingFixture(17, attacks, 0)
	for i := 0; i < len(pcm)/2; i++ {
		value := float64(int16(binary.LittleEndian.Uint16(pcm[2*i:]))) / 32768 * .5
		value += .18 * math.Sin(2*math.Pi*263*float64(i)/waveformSampleRate)
		binary.LittleEndian.PutUint16(pcm[2*i:], uint16(int16(value*32767)))
	}
	timing, err := measureMusicTiming(context.Background(), pcm, 17)
	if err != nil || len(timing.Events) < 16 {
		t.Fatalf("percussion lost behind sustained tone: events=%d err=%v", len(timing.Events), err)
	}
	assertMeasuredEventsMatch(t, timing, attacks, .02)
}

func TestMeasuredMusicFileCachesAndInvalidatesActualExcerptContent(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	var attacks []float64
	for time := .237; time < 12; time += .5 {
		attacks = append(attacks, time)
	}
	pcmFile, audioFile := filepath.Join(dir, "fixture.pcm"), filepath.Join(dir, "fixture.flac")
	if err := os.WriteFile(pcmFile, measuredTimingFixture(12, attacks, 0), 0600); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	if err := p.ffmpeg(ctx, dir, "-f", "s16le", "-ar", "16000", "-ac", "1", "-i", pcmFile, "-c:a", "flac", audioFile); err != nil {
		t.Fatal(err)
	}
	key := "uploads/fixture/music-cache/timing.flac"
	timing, err := p.measuredMusicFile(ctx, t.TempDir(), key, audioFile, 12)
	if err != nil || len(timing.Events) < 16 {
		t.Fatalf("FFmpeg timing decode failed: %+v %v", timing, err)
	}
	assertMeasuredEventsMatch(t, timing, attacks, .02)
	p.cfg.FFmpegPath = filepath.Join(dir, "must-not-decode-cached-audio")
	again, err := p.measuredMusicFile(ctx, t.TempDir(), key, audioFile, 12)
	if err != nil || !reflect.DeepEqual(timing, again) {
		t.Fatal("timing cache missed or changed evidence", err)
	}
	// Reusing the object key with different audio must miss the cache, so the
	// intentionally unavailable decoder now fails instead of returning old cuts.
	if err := os.WriteFile(audioFile, []byte("different audio"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := p.measuredMusicFile(ctx, t.TempDir(), key, audioFile, 12); err == nil {
		t.Fatal("content change reused stale timing")
	}
}

func TestMeasuredMusicTimingRejectsMalformedCache(t *testing.T) {
	valid := story.MusicTiming{Version: waveformTimingVersion, Method: story.MeasuredMusicTimingMethod, Duration: 12,
		Events: []story.MusicEvent{{Time: .5, Kind: "onset", Strength: .8, Confidence: .9, UncertaintySeconds: .02}}}
	for name, edit := range map[string]func(*story.MusicTiming){
		"wrong version":       func(v *story.MusicTiming) { v.Version = "unverified" },
		"wrong duration":      func(v *story.MusicTiming) { v.Duration = 10 },
		"NaN event":           func(v *story.MusicTiming) { v.Events[0].Time = math.NaN() },
		"infinite confidence": func(v *story.MusicTiming) { v.Events[0].Confidence = math.Inf(1) },
		"uncertain event":     func(v *story.MusicTiming) { v.Events[0].UncertaintySeconds = .2 },
		"negative time":       func(v *story.MusicTiming) { v.Events[0].Time = -.2 },
		"out of excerpt":      func(v *story.MusicTiming) { v.Events[0].Time = 12 },
		"duplicate time":      func(v *story.MusicTiming) { v.Events = append(v.Events, v.Events[0]) },
	} {
		t.Run(name, func(t *testing.T) {
			value := valid
			value.Events = append([]story.MusicEvent(nil), valid.Events...)
			edit(&value)
			if validMeasuredMusicTiming(&value, 12) {
				t.Fatal("malformed timing accepted")
			}
		})
	}
}

// Opt-in, read-only evaluation of local media. It does not contact AI services
// or persist measurements beside the user's recording.
func TestMeasuredMusicTimingLocalEvaluation(t *testing.T) {
	file := os.Getenv("SNEEPCUT_TIMING_EVAL_AUDIO")
	if file == "" {
		t.Skip("set SNEEPCUT_TIMING_EVAL_AUDIO to a local audio file")
	}
	p, _, dir := storyTestProcessor(t)
	duration, err := p.storyMusicDuration(context.Background(), file)
	if err != nil {
		t.Fatal(err)
	}
	pcmFile := dir + "/evaluation.pcm"
	if err := p.ffmpeg(context.Background(), dir, "-i", file, "-map", "0:a:0", "-ar", "16000", "-ac", "1", "-f", "s16le", pcmFile); err != nil {
		t.Fatal(err)
	}
	pcm, err := readBoundedMusicFile(pcmFile, waveformSampleRate*2*(storyMusicAnalysisSeconds+1))
	if err != nil {
		t.Fatal(err)
	}
	timing, err := measureMusicTiming(context.Background(), pcm, duration)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("duration=%.3fs measured=%d regions=%d", duration, len(timing.Events), len(timing.Regions))
	for _, event := range timing.Events[:min(30, len(timing.Events))] {
		t.Logf("attack %.3f confidence %.3f strength %.3f", event.Time, event.Confidence, event.Strength)
	}
	if !validMeasuredMusicTiming(timing, duration) {
		t.Fatal("invalid measured evidence")
	}
}
