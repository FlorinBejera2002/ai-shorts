package processing

import (
	"fmt"
	"runtime"
	"strconv"
)

// Whisper decoding settings. whisper-cli defaults to beam search with five
// beams and at most four threads; greedy decoding is several times faster on
// CPU with a small accuracy cost, and the worker usually has more cores.
const (
	defaultWhisperBeamSize = 1
	maxWhisperThreads      = 64
	maxWhisperBeamSize     = 8
)

// whisperSettingsFromEnv reads STORY_WHISPER_THREADS (0 = automatic) and
// STORY_WHISPER_BEAM_SIZE (1 = greedy decoding, up to 8 beams).
func whisperSettingsFromEnv(get func(string) string, c *Config) error {
	for _, field := range []struct {
		name   string
		target *int
		low    int
		high   int
	}{
		{"STORY_WHISPER_THREADS", &c.WhisperThreads, 0, maxWhisperThreads},
		{"STORY_WHISPER_BEAM_SIZE", &c.WhisperBeamSize, 1, maxWhisperBeamSize},
	} {
		raw := get(field.name)
		if raw == "" {
			continue
		}
		value, err := strconv.Atoi(raw)
		if err != nil || value < field.low || value > field.high {
			return fmt.Errorf("%s must be between %d and %d", field.name, field.low, field.high)
		}
		*field.target = value
	}
	return nil
}

// whisperThreads is the configured thread count, or half of the CPUs this
// process may use (2–8): two sources are analyzed at once by default.
func (p *Processor) whisperThreads() int {
	if p.cfg.WhisperThreads > 0 {
		return p.cfg.WhisperThreads
	}
	return max(2, min(8, runtime.GOMAXPROCS(0)/2))
}

func (p *Processor) whisperBeamSize() int {
	if p.cfg.WhisperBeamSize > 0 {
		return p.cfg.WhisperBeamSize
	}
	return defaultWhisperBeamSize
}

// whisperDecodingArguments selects the speed settings of a transcription
// pass. They change neither the model nor the cached analysis identity.
func (p *Processor) whisperDecodingArguments() []string {
	return []string{"-t", strconv.Itoa(p.whisperThreads()), "-bs", strconv.Itoa(p.whisperBeamSize())}
}
