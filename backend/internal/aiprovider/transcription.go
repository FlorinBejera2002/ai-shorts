package aiprovider

import "context"

// Transcriber is optional: a hosted speech-to-text model that returns words
// with their own clock. Audio is bounded private bytes, never a storage URL.
type Transcriber interface {
	Transcribe(ctx context.Context, audio []byte, format, language string) (Transcript, error)
}

// Transcript is a provider's word-timed result. Times are seconds from the
// start of the supplied audio.
type Transcript struct {
	Language string
	Words    []TranscriptWord
}

// TranscriptWord is one spoken word, or a non-speech event the provider
// recognised (Event true, such as laughter or music).
type TranscriptWord struct {
	Text       string
	Start, End float64
	// Confidence is the provider's own 0–1 score; nil when it gives none.
	Confidence *float64
	Event      bool
}

// MaxTranscriptionBytes bounds one hosted transcription upload; its base64
// encoding stays within MediaJSON's request limit.
const MaxTranscriptionBytes = 12 << 20
