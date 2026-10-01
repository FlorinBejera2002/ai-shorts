package processing

import (
	"path/filepath"
	"testing"
)

func TestStorySpeechModelIsIndependentAndFallsBackForExistingInstalls(t *testing.T) {
	for _, separate := range []bool{false, true} {
		env := map[string]string{"WHISPER_CPP_MODEL": "/models/base.bin"}
		want := "/models/base.bin"
		if separate {
			want = "/models/story.bin"
			env["STORY_WHISPER_CPP_MODEL"] = want
		}
		cfg, err := ConfigFromEnv(func(key string) string { return env[key] })
		if err != nil || cfg.StoryWhisperModel != want || cfg.WhisperModel != "/models/base.bin" {
			t.Fatalf("unexpected model configuration: %+v, %v", cfg, err)
		}
	}
}

func TestVoiceActivityModelUsesExplicitPathOrStoryModelDirectory(t *testing.T) {
	for _, explicit := range []string{"", "/custom/voice-detector.bin"} {
		env := map[string]string{"STORY_WHISPER_CPP_MODEL": "/speech/story.bin", "WHISPER_CPP_VAD_MODEL": explicit}
		cfg, err := ConfigFromEnv(func(key string) string { return env[key] })
		want := explicit
		if want == "" {
			want = filepath.Join("/speech", "ggml-silero-v6.2.0.bin")
		}
		if err != nil || cfg.WhisperVADModel != want {
			t.Fatalf("unexpected VAD configuration: %q, %v", cfg.WhisperVADModel, err)
		}
	}
}
