package processing

import (
	"errors"
	"testing"
)

func TestTranscriptRetainsZeroDurationLexicalFragments(t *testing.T) {
	// Actual whisper.cpp full-JSON shape observed with Romanian turbo ASR.
	raw := []byte(`{"result":{"language":"ro"},"transcription":[
		{"offsets":{"from":90,"to":180},"text":" Mă","tokens":[
			{"text":" M","offsets":{"from":90,"to":90}},
			{"text":"ă","offsets":{"from":130,"to":180}}]},
		{"offsets":{"from":180,"to":720},"text":" numesc","tokens":[
			{"text":" num","offsets":{"from":180,"to":450}},
			{"text":"esc","offsets":{"from":450,"to":670}}]},
		{"offsets":{"from":720,"to":1000},"text":" Nu","tokens":[
			{"text":" N","offsets":{"from":720,"to":720}},
			{"text":"u","offsets":{"from":800,"to":1000}}]}
	]}`)
	transcript, err := parseTranscript(raw, 1)
	if err != nil || len(transcript.Words) != 3 {
		t.Fatalf("transcription failed: %+v, %v", transcript, err)
	}
	for i, want := range []Word{{"Mă", .09, .18}, {"numesc", .18, .67}, {"Nu", .72, 1}} {
		if transcript.Words[i] != want {
			t.Fatalf("lexical fragment or aligned clock lost: got %+v, want %+v", transcript.Words[i], want)
		}
	}
}

func TestVADTranscriptUsesOriginalWordClockNotCompressedTokenClock(t *testing.T) {
	// Pinned whisper.cpp remaps word-bounded segments after removing silence,
	// while nested BPE token offsets remain on its shorter recognition clock.
	raw := []byte(`{"result":{"language":"en"},"transcription":[
		{"offsets":{"from":8000,"to":8700},"text":" Do","tokens":[{"text":" Do","offsets":{"from":0,"to":400}}]},
		{"offsets":{"from":8800,"to":9400},"text":" not","tokens":[{"text":" not","offsets":{"from":400,"to":600}}]},
		{"offsets":{"from":9500,"to":10000},"text":" stop.","tokens":[{"text":" stop.","offsets":{"from":600,"to":1000}}]}
	]}`)
	transcript, err := parseTranscriptClock(raw, 10, true)
	if err != nil || len(transcript.Words) != 3 || transcript.Text != "Do not stop." {
		t.Fatalf("VAD dropped speech: %#v %v", transcript, err)
	}
	for i, want := range []Word{{"Do", 8, 8.7}, {"not", 8.8, 9.4}, {"stop.", 9.5, 10}} {
		if transcript.Words[i] != want {
			t.Fatalf("compressed clock leaked into captions: %+v, want %+v", transcript.Words[i], want)
		}
	}
}

func TestTranscriptRejectsNonSpeechAnnotationsWithoutPhraseBlacklist(t *testing.T) {
	for _, raw := range []string{
		`{"transcription":[]}`,
		`{"transcription":[{"text":"[BLANK_AUDIO]","offsets":{"from":0,"to":1000}}]}`,
		`{"transcription":[{"text":"[Music]","offsets":{"from":0,"to":1000}}]}`,
		`{"transcription":[{"text":"♪ ♪","offsets":{"from":0,"to":1000}}]}`,
	} {
		got, err := parseTranscriptClock([]byte(raw), 1, true)
		if !errors.Is(err, errNoSpeech) || len(got.Words) != 0 || got.Text != "" {
			t.Fatalf("non-speech generated captions: %#v %v", got, err)
		}
	}
	// Frequently hallucinated phrases must still be preserved when the speech
	// recognizer reports them in actual VAD-gated speech; words are not banned.
	raw := []byte(`{"transcription":[{"text":"Thank you for watching.","offsets":{"from":0,"to":1000}}]}`)
	got, err := parseTranscriptClock(raw, 1, true)
	if err != nil || got.Text != "Thank you for watching." || len(got.Words) != 1 {
		t.Fatalf("a real spoken phrase was blacklisted: %#v %v", got, err)
	}
}

func TestTranscriptRetainsFullPhraseWhenTokenAlignmentIsIncomplete(t *testing.T) {
	raw := []byte(`{"result":{"language":"en"},"transcription":[
		{"offsets":{"from":0,"to":1000},"text":"I do not agree.","tokens":[
			{"text":" I","offsets":{"from":0,"to":100}},
			{"text":" do","offsets":{"from":100,"to":200}},
			{"text":" not"},
			{"text":" agree.","offsets":{"from":500,"to":1000}}]}
	]}`)
	transcript, err := parseTranscript(raw, 1)
	if err != nil || len(transcript.Words) != 1 || transcript.Words[0] != (Word{"I do not agree.", 0, 1}) {
		t.Fatalf("unaligned negation was lost or word timing invented: %+v, %v", transcript, err)
	}
}

func TestTranscriptPreservesValidWordAlignmentAndClampsRounding(t *testing.T) {
	raw := []byte(`{"result":{"language":"en"},"transcription":[
		{"offsets":{"from":0,"to":1000},"text":"Hello world.","tokens":[
			{"text":" Hello","offsets":{"from":0,"to":400}},
			{"text":" world","offsets":{"from":500,"to":990}},
			{"text":".","offsets":{"from":990,"to":1040}}]}
	]}`)
	transcript, err := parseTranscript(raw, 1)
	if err != nil || len(transcript.Words) != 2 || transcript.Words[1] != (Word{"world.", .5, 1}) {
		t.Fatalf("valid word alignment changed: %+v, %v", transcript, err)
	}
}
