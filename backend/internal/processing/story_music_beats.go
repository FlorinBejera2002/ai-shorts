package processing

import (
	"encoding/binary"
	"math"
	"sort"
)

// detectStoryMusicBeats measures attacks from the decoded audio, not a catalogue
// BPM tag. It only exposes observed attacks supported by a stable pulse. Ambient
// or irregular audio may still be mixed, but receives no invented beat grid.
func detectStoryMusicBeats(pcm []byte) ([]float64, float64, float64) {
	const frameSamples = 80 // 10 ms at 8 kHz; no phase quantization to video frames.
	energy := make([]float64, len(pcm)/(frameSamples*2))
	if len(energy) < 400 {
		return nil, 0, 0
	}
	for i := range energy {
		for j := 0; j < frameSamples; j++ {
			v := float64(int16(binary.LittleEndian.Uint16(pcm[(i*frameSamples+j)*2:]))) / 32768
			energy[i] += v * v
		}
		energy[i] = math.Sqrt(energy[i] / frameSamples)
	}
	flux := make([]float64, len(energy))
	for i := 2; i < len(energy); i++ {
		baseline := (energy[i-1] + energy[i-2]) / 2
		flux[i] = max(0, energy[i]-baseline)
	}
	var peaks []float64
	var strengths []float64
	for i := 2; i < len(flux)-1; i++ {
		mean := 0.0
		lo, hi := max(0, i-30), min(len(flux), i+31)
		for _, v := range flux[lo:hi] {
			mean += v
		}
		mean /= float64(hi - lo)
		if flux[i] < .006 || flux[i] < mean*2.5 || flux[i] < flux[i-1] || flux[i] <= flux[i+1] {
			continue
		}
		at := float64(i) * .01
		if len(peaks) > 0 && at-peaks[len(peaks)-1] < .20 {
			if flux[i] > strengths[len(strengths)-1] {
				peaks[len(peaks)-1], strengths[len(strengths)-1] = at, flux[i]
			}
			continue
		}
		peaks = append(peaks, at)
		strengths = append(strengths, flux[i])
	}
	if len(peaks) < 8 || peaks[len(peaks)-1]-peaks[0] < 3 {
		return nil, 0, 0
	}
	// Adjacent measured periods vote in 10 ms buckets. One isolated transient
	// or a tempo suggested by metadata cannot establish synchronization.
	votes := map[int][]float64{}
	for i := 1; i < len(peaks); i++ {
		period := peaks[i] - peaks[i-1]
		if period >= .27 && period <= 1.0 {
			bucket := int(math.Round(period / .02))
			votes[bucket] = append(votes[bucket], period)
		}
	}
	bestBucket, bestCount := 0, 0
	for bucket := 14; bucket <= 50; bucket++ {
		count := len(votes[bucket-1]) + len(votes[bucket]) + len(votes[bucket+1])
		if count > bestCount {
			bestBucket, bestCount = bucket, count
		}
	}
	if bestCount < 6 || float64(bestCount)/float64(len(peaks)-1) < .60 {
		return nil, 0, 0
	}
	periods := append(append(append([]float64{}, votes[bestBucket-1]...), votes[bestBucket]...), votes[bestBucket+1]...)
	sort.Float64s(periods)
	period := periods[len(periods)/2]
	var beats []float64
	for i, at := range peaks {
		// Require both neighbours where available. This permits tempo drift
		// while retaining actual attacks, never extrapolating from one phase.
		before := i > 0 && math.Abs(at-peaks[i-1]-period) <= .045
		after := i+1 < len(peaks) && math.Abs(peaks[i+1]-at-period) <= .045
		if before && after || i == 0 && after || i == len(peaks)-1 && before {
			beats = append(beats, at)
		}
	}
	confidence := float64(len(beats)) / float64(len(peaks))
	if len(beats) < 8 || confidence < .65 {
		return nil, 0, confidence
	}
	return beats, 60 / period, confidence
}
