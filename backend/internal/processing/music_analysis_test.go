package processing

import (
	"encoding/binary"
	"math"
	"testing"

	"sneepcut/backend-go/internal/story"
)

func TestMusicAnalysisFollowsTempoChangesWithoutInventingEvents(t *testing.T) {
	var attacks []float64
	for at := .23; at < 8; at += .5 {
		attacks = append(attacks, at)
	}
	for at := 8.23; at < 16; at += .75 {
		attacks = append(attacks, at)
	}
	analysis := analyzeStoryMusic(musicPulsePCM(16, attacks))
	fast, slow, beatCount := false, false, 0
	for _, region := range analysis.Regions {
		fast = fast || region.Confidence >= .65 && math.Abs(region.BPM-120) < 1
		slow = slow || region.Confidence >= .65 && math.Abs(region.BPM-80) < 1
	}
	for _, event := range analysis.Events {
		if event.Kind != "beat" {
			continue
		}
		beatCount++
		nearest := math.Inf(1)
		for _, at := range attacks {
			nearest = min(nearest, math.Abs(at-event.Time))
		}
		if nearest > .02 {
			t.Fatalf("beat %.3f has no observed attack", event.Time)
		}
	}
	if !fast || !slow || beatCount < len(attacks)-3 {
		t.Fatalf("local tempo was lost: fast=%v slow=%v beats=%d regions=%+v", fast, slow, beatCount, analysis.Regions)
	}
	assertMusicAnalysisBounds(t, analysis)
}

func TestMusicAnalysisTracksGradualTempoAndPreservesUncertainPassages(t *testing.T) {
	var attacks []float64
	period := .7
	for at := .23; at < 12; {
		attacks = append(attacks, at)
		at += period
		period *= .98
	}
	// The rest is silent. Tempo may not be extrapolated beyond the evidence.
	analysis := analyzeStoryMusic(musicPulsePCM(20, attacks))
	var first, last float64
	for _, region := range analysis.Regions {
		if region.BPM > 0 {
			if first == 0 {
				first = region.BPM
			}
			last = region.BPM
		}
	}
	if first == 0 || last < first*1.1 {
		t.Fatalf("accelerando collapsed to a global tempo: first=%.2f last=%.2f", first, last)
	}
	for _, event := range analysis.Events {
		if event.Kind == "beat" && event.Time > 12 {
			t.Fatalf("extrapolated beat in silence: %+v", event)
		}
	}
	lastRegion := analysis.Regions[len(analysis.Regions)-1]
	if lastRegion.BPM != 0 || lastRegion.Confidence != 0 || lastRegion.End != 20 {
		t.Fatalf("silent passage lacks uncertainty: %+v", lastRegion)
	}
	assertMusicAnalysisBounds(t, analysis)
}

func TestMusicAnalysisDoesNotCallIrregularAttacksOrSilenceBeats(t *testing.T) {
	for name, pcm := range map[string][]byte{
		"empty":              nil,
		"odd trailing byte":  {1},
		"silence":            make([]byte, 12*16000),
		"isolated transient": musicPulsePCM(12, []float64{2}),
		"irregular":          musicPulsePCM(12, []float64{.23, .61, 1.5, 1.83, 2.6, 3.03, 3.93, 4.2, 5.07, 5.43, 6.2, 6.63, 7.6, 8.2, 8.49, 9.4, 10.08, 10.93, 11.23}),
	} {
		t.Run(name, func(t *testing.T) {
			analysis := analyzeStoryMusic(pcm)
			for _, event := range analysis.Events {
				if event.Kind == "beat" || event.Kind == "section" {
					t.Fatalf("invented structural evidence: %+v", event)
				}
			}
			assertMusicAnalysisBounds(t, analysis)
		})
	}
}

func TestMusicAnalysisAmbientEnergyAndSustainedBoundary(t *testing.T) {
	pcm := musicTonePCM(16, func(at float64) float64 {
		if at < 8 {
			return .08
		}
		return .6
	})
	analysis := analyzeStoryMusic(pcm)
	found := false
	for _, event := range analysis.Events {
		if event.Kind == "beat" {
			t.Fatal("sustained tone was assigned a beat grid")
		}
		if event.Kind == "section" && math.Abs(event.Time-8) <= .25 {
			found = true
		}
	}
	if !found || len(analysis.Energy) != 64 || analysis.Energy[4].Value >= analysis.Energy[40].Value*.5 {
		t.Fatalf("sustained change not represented: events=%+v energy=%+v", analysis.Events, analysis.Energy)
	}
	assertMusicAnalysisBounds(t, analysis)

	crescendo := analyzeStoryMusic(musicTonePCM(16, func(at float64) float64 { return .05 + at*.03 }))
	if len(crescendo.Energy) != 64 || crescendo.Energy[60].Value < crescendo.Energy[4].Value*4 {
		t.Fatal("gradual energy was flattened")
	}
	for _, event := range crescendo.Events {
		if event.Kind == "beat" {
			t.Fatal("gradual crescendo was assigned beats")
		}
	}
}

func TestMusicAnalysisQuietPulseKeepsItsPhase(t *testing.T) {
	var attacks []float64
	for at := .23; at < 8; at += .5 {
		attacks = append(attacks, at)
	}
	pcm := musicPulsePCM(8, attacks)
	for i := 0; i < len(pcm); i += 2 {
		v := int16(binary.LittleEndian.Uint16(pcm[i:])) / 100
		binary.LittleEndian.PutUint16(pcm[i:], uint16(v))
	}
	analysis := analyzeStoryMusic(pcm)
	beats := 0
	for _, event := range analysis.Events {
		if event.Kind == "beat" {
			beats++
			if math.Abs(math.Remainder(event.Time-.23, .5)) > .02 {
				t.Fatalf("quiet beat changed phase: %+v", event)
			}
		}
	}
	if beats < 14 {
		t.Fatalf("quiet measurable pulse missing: %d", beats)
	}
}

func TestMusicAnalysisHandlesTruncatedAndClippedPCM(t *testing.T) {
	// An odd trailing byte is not a sample. Short final frames must not cause
	// an out-of-bounds read or evidence outside the decoded sample clock.
	pcm := musicPulsePCM(2, []float64{.23, .73, 1.23, 1.73})
	for _, length := range []int{0, 1, 2, 159, 160, 161, 319, 320, 321, 16001, len(pcm) - 1} {
		analysis := analyzeStoryMusic(pcm[:length])
		if analysis.Duration != float64(length/2)/8000 {
			t.Fatalf("partial sample changed duration for %d bytes: %f", length, analysis.Duration)
		}
		assertMusicAnalysisBounds(t, analysis)
	}
	for _, value := range []int16{-32768, -1, 0, 1, 32767} {
		constant := make([]byte, 16000)
		for i := 0; i < len(constant); i += 2 {
			binary.LittleEndian.PutUint16(constant[i:], uint16(value))
		}
		analysis := analyzeStoryMusic(constant)
		if len(analysis.Events) != 0 {
			t.Fatalf("constant sample value %d invented events: %+v", value, analysis.Events)
		}
		assertMusicAnalysisBounds(t, analysis)
	}
}

func TestMusicAnalysisLoudPassageDoesNotHideQuietIntro(t *testing.T) {
	var attacks []float64
	for at := .23; at < 12; at += .5 {
		attacks = append(attacks, at)
	}
	pcm := musicPulsePCM(12, attacks)
	for i := 0; i < 6*16000; i += 2 {
		v := int16(binary.LittleEndian.Uint16(pcm[i:])) / 100
		binary.LittleEndian.PutUint16(pcm[i:], uint16(v))
	}
	analysis := analyzeStoryMusic(pcm)
	quiet, loud := 0, 0
	for _, event := range analysis.Events {
		if event.Kind == "beat" {
			if event.Time < 6 {
				quiet++
			} else {
				loud++
			}
		}
	}
	if quiet < 10 || loud < 10 {
		t.Fatalf("global volume hid a local pulse: quiet=%d loud=%d", quiet, loud)
	}
	assertMusicAnalysisBounds(t, analysis)
}

func musicTonePCM(duration float64, amplitude func(float64) float64) []byte {
	pcm := make([]byte, int(duration*8000)*2)
	for i := 0; i < len(pcm)/2; i++ {
		at := float64(i) / 8000
		v := amplitude(at) * math.Sin(2*math.Pi*400*at)
		binary.LittleEndian.PutUint16(pcm[i*2:], uint16(int16(v*32767)))
	}
	return pcm
}

func assertMusicAnalysisBounds(t *testing.T, analysis *story.MusicAnalysis) {
	t.Helper()
	previous := -1.0
	for _, event := range analysis.Events {
		if !finite(event.Time) || event.Time < 0 || event.Time >= analysis.Duration || event.Time < previous ||
			!finite(event.Strength) || event.Strength < 0 || event.Strength > 1 ||
			!finite(event.Confidence) || event.Confidence < 0 || event.Confidence > 1 {
			t.Fatalf("invalid musical event: %+v", event)
		}
		previous = event.Time
	}
	at := 0.0
	for _, region := range analysis.Regions {
		if region.Start != at || region.End <= region.Start || region.End > analysis.Duration || !finite(region.BPM) || region.BPM < 0 ||
			!finite(region.Confidence) || region.Confidence < 0 || region.Confidence > 1 {
			t.Fatalf("invalid or discontinuous region: previous=%f region=%+v", at, region)
		}
		at = region.End
	}
	if analysis.Duration >= .01 && at != analysis.Duration {
		t.Fatalf("regions do not cover recording: %.3f / %.3f", at, analysis.Duration)
	}
	for _, point := range analysis.Energy {
		if !finite(point.Value) || point.Value < 0 || point.Value > 1 || point.Time < 0 || point.Time >= analysis.Duration {
			t.Fatalf("invalid energy point: %+v", point)
		}
	}
}
