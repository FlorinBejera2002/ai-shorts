package processing

// Legacy signal helpers remain test-only to check audio decode/loop clocks.
// Production song understanding uses hosted_music.go and never this detector.

import (
	"encoding/binary"
	"math"
	"sort"

	"sneepcut/backend-go/internal/story"
)

// Bump this when changing analysis so persisted evidence can be invalidated.
const storyMusicAnalysisVersion = "music-evidence-1"

// analyzeStoryMusic describes the decoded selection on its own source clock.
// Beats are observed attacks with locally consistent spacing, never a grid
// extrapolated from a global BPM. Energy changes remain useful when no pulse is
// supported. A "section" is a sustained energy boundary, not an inferred verse.
func analyzeStoryMusic(pcm []byte) *story.MusicAnalysis {
	const frameSamples = 80 // 10 ms, mono signed 16-bit little-endian at 8 kHz.
	analysis := &story.MusicAnalysis{
		Version: storyMusicAnalysisVersion, Duration: float64(len(pcm)/2) / 8000,
	}
	energy := make([]float64, len(pcm)/(frameSamples*2))
	peak := 0.0
	for i := range energy {
		for j := 0; j < frameSamples; j++ {
			v := float64(int16(binary.LittleEndian.Uint16(pcm[(i*frameSamples+j)*2:]))) / 32768
			energy[i] += v * v
		}
		energy[i] = math.Sqrt(energy[i] / frameSamples)
		peak = max(peak, energy[i])
	}
	if len(energy) == 0 {
		return analysis
	}
	// Do not amplify numerical noise into evidence. Quiet but measurable music
	// is scaled by its own level, so a quiet recording does not lose its rhythm.
	if peak < .0003 {
		analysis.Regions = []story.MusicRegion{{Start: 0, End: analysis.Duration}}
		return analysis
	}
	for i := range energy {
		energy[i] /= peak
	}
	for i := 0; i < len(energy); i += 25 {
		end := min(i+25, len(energy))
		sum := 0.0
		for _, v := range energy[i:end] {
			sum += v * v
		}
		analysis.Energy = append(analysis.Energy, story.MusicEnergyPoint{
			Time: float64(i) * .01, Value: math.Sqrt(sum / float64(end-i)),
		})
	}
	analysis.Events = musicOnsets(energy, peak)
	analysis.Regions = musicPulseRegions(analysis.Events, analysis.Duration)
	analysis.Events = append(analysis.Events, musicEnergyChanges(analysis.Energy, energy)...)
	sort.SliceStable(analysis.Events, func(i, j int) bool { return analysis.Events[i].Time < analysis.Events[j].Time })
	return analysis
}

func musicOnsets(energy []float64, scale float64) []story.MusicEvent {
	flux := make([]float64, len(energy))
	prefix := make([]float64, len(energy)+1)
	for i := 2; i < len(energy); i++ {
		flux[i] = max(0, energy[i]-(energy[i-1]+energy[i-2])/2)
	}
	for i, value := range flux {
		prefix[i+1] = prefix[i] + value
	}
	var events []story.MusicEvent
	for i := 2; i < len(flux)-1; i++ {
		lo, hi := max(0, i-30), min(len(flux), i+31)
		mean := (prefix[hi] - prefix[lo]) / float64(hi-lo)
		localPeak := 0.0
		for _, level := range energy[lo:hi] {
			localPeak = max(localPeak, level)
		}
		// A loud chorus must not suppress measurable attacks in a quiet intro.
		// Keep an absolute noise floor, but adapt the relative threshold locally.
		if flux[i] < max(.00015/scale, localPeak*.012) || flux[i] < mean*2.5 || flux[i] < flux[i-1] || flux[i] <= flux[i+1] {
			continue
		}
		event := story.MusicEvent{
			Time: float64(i) * .01, Kind: "onset", Strength: min(1, flux[i]/localPeak),
			Confidence: min(.95, .55+.4*(1-mean*2.5/flux[i])),
		}
		// A short attack has multiple waveform peaks. Collapse those peaks, not
		// the quieter real events elsewhere in the song.
		if len(events) > 0 && event.Time-events[len(events)-1].Time < .14 {
			if event.Strength > events[len(events)-1].Strength {
				events[len(events)-1] = event
			}
			continue
		}
		events = append(events, event)
	}
	return events
}

// musicPulseRegions labels only coherent runs of actual attacks. Local period
// tracking follows gradual drift; abrupt changes start a new region. Four
// agreeing intervals are required so an isolated transient or accidental pair
// never establishes a pulse. Subdivision/metre are intentionally not guessed.
func musicPulseRegions(events []story.MusicEvent, duration float64) []story.MusicRegion {
	var supported []story.MusicRegion
	for start := 0; start+1 < len(events); {
		period := events[start+1].Time - events[start].Time
		if period < .22 || period > 2 {
			start++
			continue
		}
		end := start + 1
		for end+1 < len(events) {
			next := events[end+1].Time - events[end].Time
			if next < .22 || next > 2 || math.Abs(next-period) > max(.035, period*.15) {
				break
			}
			period = .65*period + .35*next
			end++
		}
		if end-start >= 4 && events[end].Time-events[start].Time >= 1.2 {
			// Keep tempo/confidence local even within a long accelerando. The
			// regions partition the run, while the individual event clock stays
			// untouched and is the only clock used for synchronization.
			for lo := start; lo < end; {
				hi := min(lo+8, end)
				if end-hi < 4 {
					hi = end
				}
				mean := (events[hi].Time - events[lo].Time) / float64(hi-lo)
				deviation := 0.0
				for i := lo + 1; i <= hi; i++ {
					deviation += math.Abs(events[i].Time-events[i-1].Time-mean) / mean
				}
				confidence := max(.65, 1-deviation/float64(hi-lo)*2)
				for i := lo; i <= hi; i++ {
					events[i].Kind = "beat"
					events[i].Confidence = confidence
				}
				from, to := events[lo].Time, events[hi].Time
				if lo == start {
					from = max(0, from-(events[lo+1].Time-from)/2)
				}
				if hi == end {
					to = min(duration, to+(to-events[hi-1].Time)/2)
				}
				supported = append(supported, story.MusicRegion{Start: from, End: to, BPM: 60 / mean, Confidence: confidence})
				lo = hi
			}
		}
		start = end
	}
	// Include uncertain passages explicitly. Consumers can reduce beat emphasis
	// locally instead of rejecting or accepting the entire recording at once.
	var regions []story.MusicRegion
	at := 0.0
	for _, region := range supported {
		region.Start = max(at, region.Start)
		if region.Start > at {
			regions = append(regions, story.MusicRegion{Start: at, End: region.Start})
		}
		if region.End > region.Start {
			regions = append(regions, region)
			at = region.End
		}
	}
	if at < duration {
		regions = append(regions, story.MusicRegion{Start: at, End: duration})
	}
	return regions
}

func musicEnergyChanges(points []story.MusicEnergyPoint, frames []float64) []story.MusicEvent {
	// Compare one second on each side; single attacks must not masquerade as
	// structural changes. This intentionally makes no verse/chorus claims.
	var changes []story.MusicEvent
	for i := 4; i+4 <= len(points); i++ {
		before, after := 0.0, 0.0
		for j := 0; j < 4; j++ {
			before += points[i-4+j].Value / 4
			after += points[i+j].Value / 4
		}
		difference := math.Abs(after - before)
		if difference < .12 || difference < max(before, after)*.45 {
			continue
		}
		// Both halves of the louder side must support the change. A transient
		// surrounded by silence is an onset, not a new sustained section.
		loud := i
		if before > after {
			loud = i - 4
		}
		if (points[loud].Value+points[loud+1].Value)/2 < max(before, after)*.6 ||
			(points[loud+2].Value+points[loud+3].Value)/2 < max(before, after)*.6 {
			continue
		}
		sustained := 0
		for j := 0; j < 4; j++ {
			if points[loud+j].Value >= max(before, after)*.6 {
				sustained++
			}
		}
		if sustained < 3 {
			continue
		}
		// Quarter-second RMS can smear several short attacks across most bins.
		// Check the original 10 ms frames as well before calling it sustained.
		active := 0
		window := frames[loud*25 : min((loud+4)*25, len(frames))]
		for _, level := range window {
			if level >= max(before, after)*.3 {
				active++
			}
		}
		if float64(active) < float64(len(window))*.6 {
			continue
		}
		event := story.MusicEvent{Time: points[i].Time, Kind: "section", Strength: min(1, difference), Confidence: min(.9, .55+difference*.35)}
		if len(changes) > 0 && event.Time-changes[len(changes)-1].Time < 3 {
			if event.Strength > changes[len(changes)-1].Strength {
				changes[len(changes)-1] = event
			}
			continue
		}
		changes = append(changes, event)
	}
	return changes
}
