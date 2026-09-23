package processing

import "testing"

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
