package processing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/story"
)

// This test-only subprocess records native invocations while delegating actual
// media extraction to FFmpeg. It works without platform-specific shell scripts.
func init() {
	binary := os.Getenv("SNEEPCUT_PREPARED_AUDIO_FFMPEG")
	if binary == "" || len(os.Args) < 2 || os.Args[1] != "-nostdin" {
		return
	}
	log, err := os.OpenFile(os.Getenv("SNEEPCUT_PREPARED_AUDIO_LOG"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err == nil {
		err = json.NewEncoder(log).Encode(os.Args[1:])
		_ = log.Close()
	}
	if err != nil {
		_, _ = fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	command := exec.Command(binary, os.Args[1:]...)
	command.Stdout, command.Stderr = os.Stdout, os.Stderr
	if err := command.Run(); err != nil {
		_, _ = fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	os.Exit(0)
}

func recordPreparedAudioProcessing(t *testing.T, p *Processor, dir string) string {
	t.Helper()
	binary, err := exec.LookPath(p.cfg.FFmpegPath)
	if err != nil {
		t.Fatal(err)
	}
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	log := filepath.Join(dir, "ffmpeg-invocations.jsonl")
	t.Setenv("SNEEPCUT_PREPARED_AUDIO_FFMPEG", binary)
	t.Setenv("SNEEPCUT_PREPARED_AUDIO_LOG", log)
	t.Setenv("SNEEPCUT_NARRATION_ASR_FIXTURE", "1")
	p.cfg.FFmpegPath, p.cfg.WhisperPath, p.cfg.WhisperVADPath = executable, executable, executable
	p.cfg.WhisperVADModel = filepath.Join(dir, "mock-vad.bin")
	if err := os.WriteFile(p.cfg.WhisperVADModel, []byte("detector fixture"), 0600); err != nil {
		t.Fatal(err)
	}
	return log
}

func assertPreparedAudioExtractions(t *testing.T, log string, want []string) {
	t.Helper()
	data, err := os.ReadFile(log)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		t.Fatal(err)
	}
	var outputs []string
	for _, line := range strings.Split(strings.TrimSpace(string(data)), "\n") {
		if line == "" {
			continue
		}
		var args []string
		if err := json.Unmarshal([]byte(line), &args); err != nil {
			t.Fatal(err)
		}
		for i := 0; i+1 < len(args); i++ {
			if args[i] == "-ar" && args[i+1] == "16000" {
				outputs = append(outputs, filepath.Base(args[len(args)-1]))
			}
		}
	}
	if !reflect.DeepEqual(outputs, want) {
		t.Fatalf("16 kHz extractions = %v, want %v", outputs, want)
	}
}

func TestStoryPreparedAudioReusesSamplesAndRefreshesMissingVoiceCache(t *testing.T) {
	for _, kind := range []string{"video", "narration"} {
		t.Run(kind, func(t *testing.T) {
			p, storage, dir := storyTestProcessor(t)
			options := story.DefaultOptions()
			var asset story.Asset
			if kind == "narration" {
				asset = narrationAudioFixture(t, p, dir, "voice.wav", false, "-c:a", "pcm_s16le")
				options.Narration = true
			} else {
				asset = storySource(t, p, dir, "prepared-voice", "green", 440)
			}
			log := recordPreparedAudioProcessing(t, p, dir)
			ctx := context.Background()
			first, err := p.Analyze(ctx, "prepared-audio-"+kind, asset, options)
			if err != nil {
				t.Fatal(err)
			}
			assertPreparedAudioExtractions(t, log, []string{"audio.wav"})
			if len(first.Candidates) == 0 || first.Candidates[0].Text != "Original voice." || len(first.Candidates[0].Words) != 2 {
				t.Fatalf("independent voice evidence changed speech: %#v", first.Candidates)
			}
			proxy, err := storage.Path(first.ProxyKey)
			if err != nil {
				t.Fatal(err)
			}
			files, err := filepath.Glob(filepath.Join(filepath.Dir(proxy), "voice-intervals-*.json"))
			if err != nil || len(files) != 1 {
				t.Fatalf("missing independent VAD sidecar: %v %v", files, err)
			}
			data, err := os.ReadFile(files[0])
			var evidence storyVoiceEvidence
			if err != nil || json.Unmarshal(data, &evidence) != nil || !reflect.DeepEqual(evidence.Intervals, []Segment{{.3, 1.5}}) {
				t.Fatalf("VAD source clock changed: %#v %v", evidence, err)
			}
			if err := storage.Delete(ctx, path.Dir(first.ProxyKey)+"/"+filepath.Base(files[0])); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(log, nil, 0600); err != nil {
				t.Fatal(err)
			}
			p.cfg.WhisperPath = filepath.Join(dir, "must-not-run-asr-again")
			refreshed, err := p.Analyze(ctx, "prepared-audio-"+kind, first, options)
			if err != nil || !reflect.DeepEqual(first.Candidates, refreshed.Candidates) || first.AnalysisVersion != refreshed.AnalysisVersion {
				t.Fatalf("cached ASR voice refresh changed candidates: %v", err)
			}
			assertPreparedAudioExtractions(t, log, []string{"voice-evidence.wav"})
			p.cfg.FFmpegPath = filepath.Join(dir, "must-not-decode-a-warm-cache")
			warm, err := p.Analyze(ctx, "prepared-audio-"+kind, refreshed, options)
			if err != nil || !reflect.DeepEqual(first.Candidates, warm.Candidates) {
				t.Fatalf("fully cached speech ran native processing: %v", err)
			}
		})
	}
}

func TestStoryPreparedAudioRejectsUnrelatedOrUnavailableSamples(t *testing.T) {
	for _, mode := range []string{"unclaimed", "different-proxy", "different-workspace", "missing"} {
		t.Run(mode, func(t *testing.T) {
			p, _, dir := storyTestProcessor(t)
			asset := storySource(t, p, dir, "voice-"+mode, "green", 440)
			asset.ProxyKey = asset.Key
			log := recordPreparedAudioProcessing(t, p, dir)
			file := filepath.Join(dir, "audio.wav")
			if mode == "different-workspace" {
				file = filepath.Join(t.TempDir(), "audio.wav")
			}
			if mode != "missing" {
				if err := os.WriteFile(file, []byte("unrelated stale samples"), 0600); err != nil {
					t.Fatal(err)
				}
			}
			audio := storyPreparedAudio{proxyKey: asset.ProxyKey, file: file}
			if mode == "unclaimed" {
				audio = storyPreparedAudio{}
			} else if mode == "different-proxy" {
				audio.proxyKey = "another/immutable/proxy.mp4"
			}
			intervals, _, err := p.storyVoiceIntervals(context.Background(), dir, asset, "prepared-fallback", p.cfg.WhisperVADModel, audio)
			if err != nil || !reflect.DeepEqual(intervals, []Segment{{.3, 1.5}}) {
				t.Fatalf("source fallback lost VAD evidence: %v %v", intervals, err)
			}
			assertPreparedAudioExtractions(t, log, []string{"voice-evidence.wav"})
		})
	}
}

func TestStoryPreparedAudioPreservesMissingDetectorAndCancellation(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	asset := storySource(t, p, dir, "guarded-voice", "green", 440)
	file, err := p.storyMaterialize(context.Background(), dir, asset.Key)
	if err != nil {
		t.Fatal(err)
	}
	log := recordPreparedAudioProcessing(t, p, dir)
	model := p.cfg.WhisperVADModel
	p.cfg.WhisperVADModel = filepath.Join(dir, "missing-vad.bin")
	_, audio, err := p.transcribeStoryWithAudio(context.Background(), file, dir, "en", asset.Duration, "mock-asr.bin", asset.Key)
	if !errors.Is(err, errSpeechDetectionUnavailable) || audio.file != "" {
		t.Fatalf("missing detector exposed prepared samples: %#v %v", audio, err)
	}
	assertPreparedAudioExtractions(t, log, nil)
	p.cfg.WhisperVADModel = model
	_, audio, err = p.transcribeStoryWithAudio(context.Background(), file, dir, "en", asset.Duration, "mock-asr.bin", asset.Key)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	asset.ProxyKey = asset.Key
	if _, _, err := p.storyVoiceIntervals(ctx, dir, asset, "cancelled-voice", model, audio); !errors.Is(err, context.Canceled) {
		t.Fatalf("prepared VAD ignored cancellation: %v", err)
	}
	assertPreparedAudioExtractions(t, log, []string{"audio.wav"})
}
