package processing

import (
	"context"
	"errors"
	"testing"

	"sneepcut/backend-go/internal/aiprovider"
	"sneepcut/backend-go/internal/story"
)

func confidence(value float64) *float64 { return &value }

func TestHostedWordsBecomeWhisperWordSegments(t *testing.T) {
	hosted := aiprovider.Transcript{Language: "ron", Words: []aiprovider.TranscriptWord{
		{Text: "Nu", Start: .2, End: .4, Confidence: confidence(.91)},
		{Text: "știu", Start: .45, End: .8, Confidence: confidence(.62)},
		{Text: "!", Start: .8, End: .8},
		{Text: "[râsete]", Start: 1, End: 2, Event: true},
		{Text: "Acum", Start: 2.1, End: 2.4},
	}}
	raw, words, scored := hostedWhisperJSON(hosted)
	if words != 3 || scored != 2 {
		t.Fatalf("words %d scored %d", words, scored)
	}
	transcript, err := parseTranscriptClock(raw, 3, true)
	if err != nil || len(transcript.Words) != 3 {
		t.Fatalf("parsed %#v %v", transcript.Words, err)
	}
	if transcript.Words[1].Text != "știu!" || transcript.Words[0].Start != .2 || transcript.Words[2].Text != "Acum" || transcript.Language != "ron" {
		t.Fatalf("hosted timing or punctuation changed: %#v", transcript.Words)
	}
	candidates := []story.Candidate{{In: 0, Out: 1, Words: []story.Word{{Text: "Nu"}, {Text: "știu!"}}}, {In: 2, Out: 3, Words: []story.Word{{Text: "Acum"}}}}
	storyTranscriptConfidence(raw, candidates)
	if candidates[0].Confidence != .62 || candidates[1].Confidence != 0 {
		t.Fatalf("provider confidence lost or invented: %v %v", candidates[0].Confidence, candidates[1].Confidence)
	}
}

func TestEmptyHostedTranscriptMeansNoSpeech(t *testing.T) {
	raw, words, _ := hostedWhisperJSON(aiprovider.Transcript{Words: []aiprovider.TranscriptWord{{Text: "[muzică]", Start: 0, End: 3, Event: true}}})
	if _, err := parseTranscriptClock(raw, 3, true); words != 0 || !errors.Is(err, errNoSpeech) {
		t.Fatalf("non-speech event became speech: %d %v", words, err)
	}
}

type fixedTranscriber struct{ calls int }

func (f *fixedTranscriber) Transcribe(context.Context, []byte, string, string) (aiprovider.Transcript, error) {
	f.calls++
	return aiprovider.Transcript{}, nil
}
func (f *fixedTranscriber) Generate(context.Context, string) (string, error) { return "", nil }
func (f *fixedTranscriber) MediaModelIdentity() string                       { return "openrouter:test/stt" }

func TestHostedSpeechEngineChangesOnlyItsOwnCacheIdentity(t *testing.T) {
	local := &Processor{}
	hosted := &Processor{storyTranscriber: &fixedTranscriber{}, storyTranscriberID: "openrouter:test/stt"}
	if local.storySpeechSignature("/models/missing.bin") != storyModelSignature("/models/missing.bin") {
		t.Fatal("local analysis cache identity changed")
	}
	if hosted.storySpeechSignature("/models/missing.bin") != "hosted:openrouter:test/stt" || hosted.storySpeechEngine() != "openrouter:test/stt" || local.storySpeechEngine() != "local-whisper" {
		t.Fatal("hosted engine is not identified")
	}
	transcriber := &fixedTranscriber{}
	routed := &Processor{ai: &nativeRouting{taskProvider{providers: map[aiprovider.Task]aiprovider.Generator{aiprovider.TaskStoryTranscription: transcriber}}}}
	bound, err := routed.withNativeModels(context.Background())
	if err != nil || bound.storyTranscriber != transcriber || bound.storyTranscriberID != "openrouter:test/stt" || routed.storyTranscriber != nil {
		t.Fatalf("routed hosted transcription was not bound to this operation only: %v", err)
	}
	unrouted := &Processor{ai: &nativeRouting{taskProvider{providers: map[aiprovider.Task]aiprovider.Generator{}}}}
	if bound, err = unrouted.withNativeModels(context.Background()); err != nil || bound.storyTranscriber != nil {
		t.Fatalf("local Whisper route bound a hosted engine: %v", err)
	}
}

// nativeRouting is a routed provider with no installed native model overrides.
type nativeRouting struct{ taskProvider }

func (n *nativeRouting) NativeModels(context.Context) (map[aiprovider.Task]string, error) {
	return map[aiprovider.Task]string{}, nil
}
