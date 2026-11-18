package processing

import (
	"context"
	"encoding/binary"
	"math"
	"sort"

	"sneepcut/backend-go/internal/story"
)

const waveformTimingVersion = "waveform-rhythm-1"
const waveformSampleRate = 16000
const waveformHop = 80 // 5 ms, independent of the video's frame rate.
const waveformWindow = 512

type measuredAttack struct {
	time, strength float64
}

// measureMusicTiming measures attacks, then requires repeated local rhythmic
// support. Spectral flux is an onset cue, not a beat grid: missing attacks are
// never filled, and a tempo estimate never creates a cut opportunity.
// References: AudioLabs FMP C6S1 (spectral novelty), Dixon, JNMR 2007 (BeatRoot).
func measureMusicTiming(ctx context.Context, pcm []byte, duration float64) (*story.MusicTiming, error) {
	result := &story.MusicTiming{Version: waveformTimingVersion, Method: "measured-onsets", Duration: duration}
	samples := len(pcm) / 2
	if samples < waveformWindow || duration < 2 {
		return result, ctx.Err()
	}
	frames := 1 + (samples-waveformWindow)/waveformHop
	flux := make([]float64, frames)
	energy := make([]float64, samples/waveformHop)
	for i := range energy {
		for j := 0; j < waveformHop; j++ {
			x := float64(int16(binary.LittleEndian.Uint16(pcm[2*(i*waveformHop+j):]))) / 32768
			energy[i] += x * x / waveformHop
		}
	}
	var previous [waveformWindow / 2]float64
	var spectrum [waveformWindow]complex128
	var window [waveformWindow]float64
	for i := range window {
		window[i] = .5 - .5*math.Cos(2*math.Pi*float64(i)/float64(waveformWindow-1))
	}
	for frame := range flux {
		if frame%256 == 0 && ctx.Err() != nil {
			return nil, ctx.Err()
		}
		for j := range spectrum {
			x := float64(int16(binary.LittleEndian.Uint16(pcm[2*(frame*waveformHop+j):]))) / 32768
			spectrum[j] = complex(x*window[j], 0)
		}
		waveformFFT(spectrum[:])
		for bin := 2; bin < waveformWindow/2-16; bin++ {
			v := math.Log1p(8 * math.Hypot(real(spectrum[bin]), imag(spectrum[bin])))
			if frame > 0 {
				flux[frame] += math.Max(0, v-previous[bin])
			}
			previous[bin] = v
		}
	}
	attacks := measuredMusicAttacks(flux, energy)
	for index, attack := range attacks {
		if index%128 == 0 && ctx.Err() != nil {
			return nil, ctx.Err()
		}
		period, support := localAttackRhythm(attacks, index)
		if support < .8 || attack.time < 0 || attack.time >= duration {
			continue
		}
		result.Events = append(result.Events, story.MusicEvent{Time: attack.time, Kind: "onset", Strength: attack.strength, Confidence: support, UncertaintySeconds: .02})
		// Regions are diagnostics about observed local repetition, never anchors.
		if len(result.Regions) > 0 {
			last := &result.Regions[len(result.Regions)-1]
			if attack.time-last.End < period*1.6 && math.Abs(last.BPM-60/period)/last.BPM < .12 {
				last.End = math.Min(duration, attack.time+.04)
				continue
			}
		}
		result.Regions = append(result.Regions, story.MusicRegion{Start: math.Max(0, attack.time-.04), End: math.Min(duration, attack.time+.04), BPM: 60 / period, Confidence: support})
	}
	return result, nil
}

func measuredMusicAttacks(flux, energy []float64) []measuredAttack {
	var attacks []measuredAttack
	for i := 2; i+2 < len(flux); i++ {
		v := flux[i]
		if v <= 1 || v < flux[i-1] || v <= flux[i+1] || v < flux[i-2] || v < flux[i+2] {
			continue
		}
		// The median rejects stationary noise; the mean prevents accepting tiny
		// fluctuations in sparse recordings. Both adapt to the local loudness.
		local := append([]float64(nil), flux[max(0, i-100):min(len(flux), i+101)]...)
		mean := 0.0
		for _, x := range local {
			mean += x / float64(len(local))
		}
		sort.Float64s(local)
		median := local[len(local)/2]
		if v < math.Max(2.8*median, 2.0*mean) {
			continue
		}
		left, right := i, i
		for left > 0 && flux[left-1] > v*.5 {
			left--
		}
		for right+1 < len(flux) && flux[right+1] > v*.5 {
			right++
		}
		if right-left > 6 {
			continue // Broad swells do not support a 20 ms localization claim.
		}
		// Flux windows straddle an attack. Locate its rising edge in the
		// independent 5 ms energy envelope rather than using the FFT peak time.
		center := i + waveformWindow/(2*waveformHop)
		best, rise := center, 0.0
		for j := max(1, center-4); j <= min(len(energy)-1, center+3); j++ {
			delta := energy[j] - energy[j-1]
			if delta > rise {
				best, rise = j, delta
			}
		}
		if rise < 1e-7 || energy[best] < 1e-6 {
			continue
		}
		// A broad swell does not establish a precise attack. Require a material
		// rise within one 5 ms bin relative to this local transient's energy.
		if rise < energy[best]*.12 {
			continue
		}
		attackPower, laterPower, priorPower, olderPower := 0.0, 0.0, 0.0, 0.0
		for j := best; j < min(len(energy), best+3); j++ {
			attackPower += energy[j] / 3
		}
		for j := max(0, best-6); j < max(0, best-3); j++ {
			priorPower += energy[j] / 3
		}
		for j := max(0, best-12); j < max(0, best-9); j++ {
			olderPower += energy[j] / 3
		}
		for j := best + 3; j+2 < min(len(energy), best+18); j++ {
			laterPower = math.Max(laterPower, (energy[j]+energy[j+1]+energy[j+2])/3)
		}
		// Compare acceleration as well as level. A percussion attack can be
		// quieter than an ongoing instrument; a smooth ramp merely continues
		// its previous rise and should not acquire a precise late timestamp.
		growth := attackPower - priorPower
		if attackPower < laterPower*.2 || growth < math.Max(attackPower*.08, 1.8*math.Max(0, priorPower-olderPower)) {
			continue // A tiny initial rise followed by a long swell is ambiguous.
		}
		attack := measuredAttack{time: float64(best*waveformHop) / waveformSampleRate, strength: math.Min(1, v/(math.Max(mean, 1)*6))}
		if len(attacks) > 0 && attack.time-attacks[len(attacks)-1].time < .12 {
			if attack.strength > attacks[len(attacks)-1].strength {
				attacks[len(attacks)-1] = attack
			}
			continue
		}
		attacks = append(attacks, attack)
	}
	return attacks
}

// Each accepted event needs at least five actual neighbors on a locally
// coherent rhythm. Only a bounded neighborhood is considered, so tempo changes
// and silent breaks cannot be bridged by a song-wide BPM assumption.
func localAttackRhythm(attacks []measuredAttack, index int) (float64, float64) {
	bestPeriod, bestScore := 0.0, 0.0
	center := attacks[index].time
	for neighbor := max(0, index-6); neighbor < min(len(attacks), index+7); neighbor++ {
		if neighbor == index {
			continue
		}
		for division := 1; division <= 3; division++ {
			period := math.Abs(attacks[neighbor].time-center) / float64(division)
			if period < .25 || period > 1.1 {
				continue
			}
			hits, slots, errorSum := 0, 0, 0.0
			for step := -4; step <= 4; step++ {
				if step == 0 {
					continue
				}
				target := center + float64(step)*period
				if target < attacks[0].time-.03 || target > attacks[len(attacks)-1].time+.03 {
					continue
				}
				slots++
				pos := sort.Search(len(attacks), func(j int) bool { return attacks[j].time >= target })
				distance := math.Inf(1)
				for j := max(0, pos-1); j < min(len(attacks), pos+1); j++ {
					distance = math.Min(distance, math.Abs(attacks[j].time-target))
				}
				tolerance := math.Max(.02, period*.045)
				if distance <= tolerance {
					hits++
					errorSum += distance / tolerance
				}
			}
			if hits < 5 || slots < 5 || float64(hits)/float64(slots) < .8 {
				continue
			}
			// A bounded quality score, not a calibrated probability of beat truth.
			score := .8 + .15*(1-errorSum/float64(hits))
			if score > bestScore {
				bestPeriod, bestScore = period, score
			}
		}
	}
	return bestPeriod, bestScore
}

// In-place radix-2 FFT, fixed at 512 samples by the caller. Keeping this small
// transform here avoids a model download or another native runtime dependency.
func waveformFFT(values []complex128) {
	for i, j := 1, 0; i < len(values); i++ {
		bit := len(values) >> 1
		for ; j&bit != 0; bit >>= 1 {
			j ^= bit
		}
		j ^= bit
		if i < j {
			values[i], values[j] = values[j], values[i]
		}
	}
	for width := 2; width <= len(values); width <<= 1 {
		angle := -2 * math.Pi / float64(width)
		root := complex(math.Cos(angle), math.Sin(angle))
		for start := 0; start < len(values); start += width {
			factor := complex(1, 0)
			for j := 0; j < width/2; j++ {
				a, b := values[start+j], factor*values[start+j+width/2]
				values[start+j], values[start+j+width/2] = a+b, a-b
				factor *= root
			}
		}
	}
}
