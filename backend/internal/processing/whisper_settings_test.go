package processing

import (
	"runtime"
	"slices"
	"strconv"
	"testing"
)

func TestWhisperDefaultsToGreedyDecodingOnHalfTheCPUs(t *testing.T) {
	cfg, err := ConfigFromEnv(func(string) string { return "" })
	if err != nil {
		t.Fatal(err)
	}
	p := &Processor{cfg: cfg}
	threads := max(2, min(8, runtime.GOMAXPROCS(0)/2))
	want := []string{"-t", strconv.Itoa(threads), "-bs", "1"}
	if got := p.whisperDecodingArguments(); !slices.Equal(got, want) {
		t.Fatalf("decoding arguments %v, want %v", got, want)
	}
}

func TestWhisperSpeedSettingsComeFromTheEnvironment(t *testing.T) {
	env := map[string]string{"STORY_WHISPER_THREADS": "12", "STORY_WHISPER_BEAM_SIZE": "5"}
	cfg, err := ConfigFromEnv(func(key string) string { return env[key] })
	if err != nil {
		t.Fatal(err)
	}
	p := &Processor{cfg: cfg}
	if got := p.whisperDecodingArguments(); !slices.Equal(got, []string{"-t", "12", "-bs", "5"}) {
		t.Fatalf("configured decoding ignored: %v", got)
	}
	for _, invalid := range []map[string]string{
		{"STORY_WHISPER_THREADS": "-1"},
		{"STORY_WHISPER_THREADS": "65"},
		{"STORY_WHISPER_BEAM_SIZE": "0"},
		{"STORY_WHISPER_BEAM_SIZE": "fast"},
	} {
		if _, err := ConfigFromEnv(func(key string) string { return invalid[key] }); err == nil {
			t.Fatalf("invalid whisper setting accepted: %v", invalid)
		}
	}
}
