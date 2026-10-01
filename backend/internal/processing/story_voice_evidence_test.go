package processing

import (
	"context"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"sneepcut/backend-go/internal/story"
)

func TestVoiceEvidenceParsesCentisecondsAndRejectsIncompleteOutput(t *testing.T) {
	output := []byte("Detected 2 speech segments:\nSpeech segment 0: start = 1072.00, end = 1129.00\nSpeech segment 1: start = 2307.00, end = 2377.00\n")
	got, err := parseStoryVoiceIntervals(output, 30)
	if err != nil || !reflect.DeepEqual(got, []Segment{{10.72, 11.29}, {23.07, 23.77}}) {
		t.Fatalf("wrong original clock: %#v %v", got, err)
	}
	for _, bad := range []string{"", "usage: unrecognized option", "Detected 2 speech segments:\nSpeech segment 0: start = 0.00, end = 100.00", "Detected 1 speech segments:\nSpeech segment 0: start = 200.00, end = 100.00", "Detected 1 speech segments:\nSpeech segment 0: start = 0.00, end = 4000.00"} {
		if _, err := parseStoryVoiceIntervals([]byte(bad), 30); err == nil {
			t.Fatal("malformed detector output accepted as voice evidence")
		}
	}
	if empty, err := parseStoryVoiceIntervals([]byte("Detected 0 speech segments:\n"), 30); err != nil || len(empty) != 0 {
		t.Fatal("valid no-voice result was not accepted", err)
	}
}

func TestVoiceBoundsClampSilenceAndCoarsenOnlyOverlappingWords(t *testing.T) {
	asset := story.Asset{Key: "original.mp4", HasAudio: true, Candidates: []story.Candidate{
		{ID: "question", In: 10.62, Out: 17.18, Text: "Ce mananci?", Words: []story.Word{{Text: "Ce", Start: 10.74, End: 10.84}, {Text: "mananci?", Start: 10.77, End: 17.18}}},
		{ID: "answer", In: 17.18, Out: 25.26, Text: "Sardine.", Words: []story.Word{{Text: "Sardine.", Start: 17.18, End: 25.26}}},
	}}
	got, err := boundStorySpeechToVoice(asset, []Segment{{10.72, 11.29}, {23.07, 23.77}}, true)
	if err != nil || !reflect.DeepEqual(got.Candidates[0].Words, []story.Word{{Text: "Ce mananci?", Start: 10.74, End: 11.29}}) || !reflect.DeepEqual(got.Candidates[1].Words, []story.Word{{Text: "Sardine.", Start: 23.07, End: 23.77}}) {
		t.Fatalf("silence was captioned or overlapping words lost: %#v %v", got.Candidates, err)
	}
	if got.Candidates[0].In != 10.62 || got.Candidates[0].Out != 17.18 || !got.HasAudio || got.Key != "original.mp4" {
		t.Fatal("caption evidence changed source audio intervals")
	}
}

func TestVoiceBoundsAmbiguousOrUnvoicedWordWithholdsWholePhrase(t *testing.T) {
	for _, interval := range []Segment{{0, 10}, {4, 5}} {
		asset := story.Asset{Candidates: []story.Candidate{{ID: "phrase", In: 0, Out: 10, Text: "Do not.", Words: []story.Word{{Text: "Do", Start: 1, End: 2}, {Text: "not.", Start: interval.Start, End: interval.End}}}}}
		got, err := boundStorySpeechToVoice(asset, []Segment{{1, 3}, {8, 9}}, true)
		if err != nil || got.Candidates[0].Text != "" || len(got.Candidates[0].Words) != 0 || !strings.Contains(strings.Join(got.Warnings, " "), "complete phrase") {
			t.Fatal("ambiguous timing selectively deleted a negation instead of the whole phrase", err)
		}
	}
}

func TestVoiceBoundsAcceptBriefPhonemeGapsButNotDistantBursts(t *testing.T) {
	intervals := []Segment{{3.05, 3.86}, {3.91, 6.01}, {12.07, 12.85}, {12.91, 15.03}}
	regions := storyCaptionVoiceRegions(intervals)
	if !reflect.DeepEqual(regions, []Segment{{3.05, 6.01}, {12.07, 15.03}}) || intervals[0].End != 3.86 {
		t.Fatal("short phoneme gap handling bridged long silence or altered raw evidence")
	}
	asset := story.Asset{Candidates: []story.Candidate{{ID: "word", In: 3, Out: 6.1, Text: "Original", Words: []story.Word{{Text: "Original", Start: 3.23, End: 4.06}}}}}
	got, err := boundStorySpeechToVoice(asset, intervals, true)
	if err != nil || len(got.Candidates[0].Words) != 1 || got.Candidates[0].Words[0].Text != "Original" {
		t.Fatal("a brief unvoiced consonant discarded the complete spoken word", err)
	}
}

func TestVoiceEvidenceRefreshUsesCachedASRAndThenNoNativeWork(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	asset := storySource(t, p, dir, "voice-cache", "green", 440)
	t.Setenv("SNEEPCUT_NARRATION_ASR_FIXTURE", "1")
	p.cfg.WhisperPath, _ = os.Executable()
	p.cfg.WhisperVADPath = p.cfg.WhisperPath
	p.cfg.WhisperVADModel = filepath.Join(dir, "mock-vad.bin")
	if err := os.WriteFile(p.cfg.WhisperVADModel, []byte("detector"), 0600); err != nil {
		t.Fatal(err)
	}
	first, err := p.Analyze(context.Background(), "voice-evidence-cache", asset, story.DefaultOptions())
	if err != nil || len(first.Candidates[0].Words) == 0 {
		t.Fatal("working voice evidence suppressed real mock speech", err)
	}
	first.SemanticAnalysisVersion = "kept-semantics"
	first.Candidates[0].Idea = "A green scene"
	p.cfg.WhisperPath, p.cfg.FFmpegPath = filepath.Join(dir, "no-asr-again"), filepath.Join(dir, "no-decode-again")
	again, err := p.Analyze(context.Background(), "voice-evidence-cache", first, story.DefaultOptions())
	if err != nil || !reflect.DeepEqual(first.Candidates, again.Candidates) || again.AnalysisVersion != first.AnalysisVersion || again.SemanticAnalysisVersion != first.SemanticAnalysisVersion {
		t.Fatalf("voice evidence or post-policy semantic cache missed: %v", err)
	}
}

func TestNativeDistantSpeechBurstsNeverCaptionInterveningSilence(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	whisper, model, vad, fixture := os.Getenv("SNEEPCUT_NATIVE_WHISPER_PATH"), os.Getenv("SNEEPCUT_NATIVE_WHISPER_MODEL"), os.Getenv("SNEEPCUT_NATIVE_VAD_MODEL"), os.Getenv("SNEEPCUT_NATIVE_SPEECH_FIXTURE")
	if whisper == "" || model == "" || vad == "" || fixture == "" {
		t.Skip("requires explicit local Whisper/Silero and speech fixture")
	}
	p, _, dir := storyTestProcessor(t)
	p.cfg.WhisperPath, p.cfg.WhisperVADModel = whisper, vad
	file := filepath.Join(dir, "bursts.wav")
	spokenPCM, err := run(ctx, dir, p.cfg.FFmpegPath, "-v", "error", "-i", fixture, "-t", "9", "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", "-")
	if err != nil || len(spokenPCM) == 0 || len(spokenPCM) > 9*32000 {
		t.Fatal("speech control could not be decoded", err)
	}
	secondOffset := 9*32000 + len(spokenPCM)
	pcm := make([]byte, secondOffset+len(spokenPCM)+2*32000)
	copy(pcm[3*32000:], spokenPCM)
	copy(pcm[secondOffset:], spokenPCM)
	duration := float64(len(pcm)) / 32000
	silenceMiddle := float64(secondOffset)/32000 - 3
	pcmFile := filepath.Join(dir, "bursts.pcm")
	if err := os.WriteFile(pcmFile, pcm, 0600); err != nil {
		t.Fatal(err)
	}
	if err := p.ffmpeg(ctx, dir, "-f", "s16le", "-ar", "16000", "-ac", "1", "-i", pcmFile, "-c:a", "pcm_s16le", file); err != nil {
		t.Fatal(err)
	}
	intervals, err := p.detectStoryVoice(ctx, dir, file, vad, duration)
	if err != nil || len(intervals) < 2 {
		t.Fatalf("two actual voice bursts were not detected: %#v %v", intervals, err)
	}
	for _, interval := range intervals {
		if interval.Start < silenceMiddle && interval.End > silenceMiddle {
			t.Fatal("detector classified the long intervening silence as voice")
		}
	}
	transcript, err := p.transcribeStory(ctx, file, dir, "en", duration, model)
	if err != nil {
		t.Fatal(err)
	}
	asset := story.Asset{ID: "bursts", HasAudio: true, Duration: duration}
	asset.Candidates = storyCandidates(asset, transcript, .8, .8)
	got, err := boundStorySpeechToVoice(asset, intervals, true)
	if err != nil {
		t.Fatal(err)
	}
	count := 0
	regions := storyCaptionVoiceRegions(intervals)
	for _, candidate := range got.Candidates {
		for _, word := range candidate.Words {
			count++
			inside := false
			for _, interval := range regions {
				inside = inside || (word.Start >= interval.Start && word.End <= interval.End)
			}
			if !inside || (word.Start < silenceMiddle && word.End > silenceMiddle) {
				t.Fatal("caption extended across unvoiced silence")
			}
		}
	}
	if count == 0 {
		t.Logf("measured voice intervals: %+v", intervals)
		for _, segment := range transcript.Segments {
			t.Logf("ASR segment clock: %.2f..%.2f", segment.Start, segment.End)
		}
		t.Fatal("distant-burst safety erased all reliably alignable speech")
	}
}
