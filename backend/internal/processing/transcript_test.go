package processing

import (
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
