package processing

import (
	"context"
	"encoding/binary"
	"math"
)

// rhythmicOnsets requires a run of regularly spaced, strong energy attacks.
// Speech frames are excluded; a single transient is not evidence of music.
func rhythmicOnsets(pcm []byte, start float64, words []Word) []float64 {
	const samples = 160 // 20 ms at 8 kHz
	energy := make([]float64, len(pcm)/(samples*2))
	mean := 0.0
	for i := range energy {
		for j := 0; j < samples; j++ {
			v := float64(int16(binary.LittleEndian.Uint16(pcm[(i*samples+j)*2:]))) / 32768
			energy[i] += v * v
		}
		energy[i] = math.Sqrt(energy[i] / samples)
		mean += energy[i]
	}
	if len(energy) == 0 {
		return nil
	}
	mean /= float64(len(energy))
	var peaks []float64
	for i := 2; i < len(energy)-1; i++ {
		at := start + float64(i)*.02
		if energy[i] > .015 && energy[i] > mean*1.3 && energy[i] > energy[i-1]*1.8 && silentWindow(at-.06, at+.06, words) && (len(peaks) == 0 || at-peaks[len(peaks)-1] > .22) {
			peaks = append(peaks, at)
		}
	}
	var beats []float64
	for i := 3; i < len(peaks); i++ {
		period := (peaks[i] - peaks[i-3]) / 3
		if period < .25 || period > 1 {
			continue
		}
		if math.Abs(peaks[i]-peaks[i-1]-period) < .06 && math.Abs(peaks[i-1]-peaks[i-2]-period) < .06 && math.Abs(peaks[i-2]-peaks[i-3]-period) < .06 {
			beats = append(beats, peaks[i-3:i+1]...)
		}
	}
	return beats
}

func (p *Processor) boundaryBeats(ctx context.Context, source string, at float64, words []Word) []float64 {
	start := max(0, at-4)
	raw, err := run(ctx, "", p.cfg.FFmpegPath, "-nostdin", "-v", "error", "-ss", seconds(start), "-i", source, "-t", "6", "-vn", "-ac", "1", "-ar", "8000", "-f", "s16le", "pipe:1")
	if err != nil {
		return nil
	}
	return rhythmicOnsets(raw, start, words)
}
