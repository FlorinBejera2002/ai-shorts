package processing

import "testing"

func TestVoiceDetectorUsesExplicitPathsOrInstalledDefaults(t *testing.T) {
	cfg, err := ConfigFromEnv(func(string) string { return "" })
	if err != nil || cfg.WhisperVADModel != "/models/ggml-vad.bin" || cfg.WhisperVADPath != "whisper-vad-speech-segments" {
		t.Fatalf("unexpected detector defaults: %q %q %v", cfg.WhisperVADModel, cfg.WhisperVADPath, err)
	}
	env := map[string]string{"WHISPER_CPP_VAD_MODEL": "/custom/voice-detector.bin", "WHISPER_CPP_VAD_PATH": "/custom/vad"}
	cfg, err = ConfigFromEnv(func(key string) string { return env[key] })
	if err != nil || cfg.WhisperVADModel != "/custom/voice-detector.bin" || cfg.WhisperVADPath != "/custom/vad" {
		t.Fatalf("explicit detector configuration ignored: %q %q %v", cfg.WhisperVADModel, cfg.WhisperVADPath, err)
	}
}
