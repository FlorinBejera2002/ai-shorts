package processing

import (
	"math"
	"reflect"
	"testing"
)

func TestStudioMusicEnvelopeSimplificationPreservesInputAndTimeOrder(t *testing.T) {
	var points []studioPoint
	for i := 0; i < 400; i++ {
		points = append(points, studioPoint{float64(i) * .02, .2 + .15*math.Sin(float64(i)*.21)})
	}
	before := append([]studioPoint(nil), points...)
	simplified := studioSimplifyEnvelope(points, .002)
	if !reflect.DeepEqual(points, before) {
		t.Fatal("simplification mutated its shared input")
	}
	assertValidMusicEnvelope(t, simplified, points[len(points)-1].Time, .4)
	if len(simplified) >= len(points) {
		t.Fatal("fixture did not exercise simplification")
	}
}

func TestStudioMusicFadeEndsAtExactSilence(t *testing.T) {
	// Regression: this real output length and gain previously interpolated the
	// ending to -5.551115123125783e-17, making Studio reject the entire video.
	const duration = 14.51
	const volume = .37
	points := studioDuckEnvelope(make([]float64, int(math.Ceil(duration*50))), duration, volume)
	window := studioEnvelopeWindow(points, 0, duration)
	if last := window[len(window)-1]; last.Time != duration || last.Value != 0 {
		t.Fatalf("music fade did not end at exact silence: %+v", last)
	}
	assertValidMusicEnvelope(t, window, duration, volume)
}

func TestStudioMusicLoopWindowsRetainBoundedContinuousGain(t *testing.T) {
	for _, duration := range []float64{1.007, 14.51, 45.731, 188.496} {
		for _, volume := range []float64{0, .01, .18, .37, 1} {
			levels := make([]float64, int(math.Ceil(duration*50)))
			for i := range levels {
				if i%31 < 12 {
					levels[i] = .15
				}
			}
			points := studioDuckEnvelope(levels, duration, volume)
			previous := 0.0
			for start := 0.0; start < duration; {
				length := min(3.137, duration-start)
				window := studioEnvelopeWindow(points, start, length)
				assertValidMusicEnvelope(t, window, length, volume)
				if math.Abs(window[0].Value-previous) > 1e-12 {
					t.Fatal("gain jumped at an excerpt seam")
				}
				previous = window[len(window)-1].Value
				start += length
			}
			if previous != 0 {
				t.Fatalf("looped fade ended above silence: %.18g", previous)
			}
		}
	}
}

func assertValidMusicEnvelope(t *testing.T, points []studioPoint, duration, volume float64) {
	t.Helper()
	previous := -1.0
	for _, point := range points {
		if !finite(point.Time) || point.Time < 0 || point.Time > duration || point.Time <= previous || !finite(point.Value) || point.Value < 0 || point.Value > volume {
			t.Fatalf("invalid music envelope point: %+v previous=%.18g duration=%.18g volume=%.9f", point, previous, duration, volume)
		}
		previous = point.Time
	}
}
