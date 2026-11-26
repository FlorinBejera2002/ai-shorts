package processing

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode"

	"sneepcut/backend-go/internal/aiprovider"
)

// Hosted transcription uploads mono 16 kHz MP3 at 64 kbit/s (8 KB per second):
// 20 minutes stay well inside the provider upload limit.
const (
	storyHostedTranscriptionSeconds = 1200
	storyHostedTranscriptionTimeout = 3 * time.Minute
)

// storySpeechSignature identifies the speech engine in analysis cache keys.
// Local identities are unchanged, so existing cached analyses stay valid.
func (p *Processor) storySpeechSignature(model string) string {
	if p.storyTranscriber != nil {
		return "hosted:" + p.storyTranscriberID
	}
	return storyModelSignature(model)
}

// storySpeechEngine names the bound engine for logs.
func (p *Processor) storySpeechEngine() string {
	if p.storyTranscriber != nil {
		return p.storyTranscriberID
	}
	return "local-whisper"
}

// transcribeStoryHosted runs the routed hosted model on the source audio and
// writes its words as whisper.cpp JSON (one word per segment, as -sow -ml 1
// produces), so confidence, voice bounds and captions read one format.
func (p *Processor) transcribeStoryHosted(ctx context.Context, file, dir, language string, duration float64) (Transcript, error) {
	if duration > storyHostedTranscriptionSeconds {
		return Transcript{}, errors.New("source is longer than the hosted transcription limit")
	}
	started := time.Now()
	if err := p.ffmpeg(ctx, dir, "-i", file, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "64k", "hosted-audio.mp3"); err != nil {
		return Transcript{}, err
	}
	data, err := os.ReadFile(filepath.Join(dir, "hosted-audio.mp3"))
	if err != nil {
		return Transcript{}, err
	}
	callCtx, cancel := context.WithTimeout(ctx, storyHostedTranscriptionTimeout)
	defer cancel()
	hosted, err := p.storyTranscriber.Transcribe(callCtx, data, "mp3", language)
	if err != nil {
		return Transcript{}, err
	}
	raw, words, scored := hostedWhisperJSON(hosted)
	slog.Info("Story hosted transcription", "model", p.storyTranscriberID, "source_seconds", duration, "words", words, "words_with_confidence", scored, "ms", time.Since(started).Milliseconds())
	if err = os.WriteFile(filepath.Join(dir, "transcript.json"), raw, 0600); err != nil {
		return Transcript{}, err
	}
	return parseTranscriptClock(raw, duration, true)
}

type whisperJSONOffsets struct {
	From float64 `json:"from"`
	To   float64 `json:"to"`
}

type whisperJSONToken struct {
	Text    string             `json:"text"`
	P       *float64           `json:"p,omitempty"`
	Offsets whisperJSONOffsets `json:"offsets"`
}

type whisperJSONSegment struct {
	Text    string             `json:"text"`
	Offsets whisperJSONOffsets `json:"offsets"`
	Tokens  []whisperJSONToken `json:"tokens"`
}

// hostedWhisperJSON converts hosted words to whisper.cpp's JSON shape. Non-
// speech events are dropped and punctuation-only entries join the previous
// word. It returns the document, the word count and how many words carry the
// provider's confidence; a missing confidence is never invented.
func hostedWhisperJSON(hosted aiprovider.Transcript) ([]byte, int, int) {
	var segments []whisperJSONSegment
	scored := 0
	for _, word := range hosted.Words {
		text := strings.TrimSpace(word.Text)
		if word.Event || text == "" {
			continue
		}
		lexical := strings.ContainsFunc(text, func(r rune) bool { return unicode.IsLetter(r) || unicode.IsNumber(r) })
		if !lexical {
			if len(segments) > 0 {
				last := &segments[len(segments)-1]
				last.Text += text
				last.Tokens = append(last.Tokens, whisperJSONToken{Text: text, Offsets: last.Offsets})
			}
			continue
		}
		end := max(word.End, word.Start+.02)
		offsets := whisperJSONOffsets{From: word.Start * 1000, To: end * 1000}
		token := whisperJSONToken{Text: " " + text, Offsets: offsets}
		if word.Confidence != nil {
			value := *word.Confidence
			token.P = &value
			scored++
		}
		segments = append(segments, whisperJSONSegment{Text: " " + text, Offsets: offsets, Tokens: []whisperJSONToken{token}})
	}
	doc := struct {
		Result struct {
			Language string `json:"language"`
		} `json:"result"`
		Transcription []whisperJSONSegment `json:"transcription"`
	}{Transcription: segments}
	doc.Result.Language = hosted.Language
	if doc.Transcription == nil {
		doc.Transcription = []whisperJSONSegment{}
	}
	raw, _ := json.Marshal(doc)
	return raw, len(segments), scored
}
