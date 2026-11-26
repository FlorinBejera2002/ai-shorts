package processing

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode"

	"sneepcut/backend-go/internal/aiprovider"
)

// Hosted transcription uploads mono 16 kHz MP3 at 64 kbit/s (8 KB per second)
// in pieces of at most ten minutes, so each request stays well inside the
// provider's upload and processing limits.
const (
	hostedTranscriptionChunkSeconds = 600
	hostedTranscriptionTimeout      = 3 * time.Minute
)

// storySpeechSignature identifies the story speech engine in cache keys.
func (p *Processor) storySpeechSignature() string {
	return hostedSpeechSignature(p.storyTranscriber, p.storyTranscriberID)
}

// clipSpeechSignature identifies the clip speech engine in cache keys.
func (p *Processor) clipSpeechSignature() string {
	return hostedSpeechSignature(p.clipTranscriber, p.clipTranscriberID)
}

func hostedSpeechSignature(transcriber aiprovider.Transcriber, id string) string {
	if transcriber == nil {
		return "transcription-unavailable"
	}
	return "hosted:" + id
}

// storySpeechEngine names the bound story engine for logs.
func (p *Processor) storySpeechEngine() string {
	if p.storyTranscriber == nil {
		return "none"
	}
	return p.storyTranscriberID
}

// transcribeHosted runs a hosted model on the file's audio and writes the
// words as whisper.cpp JSON (one word per segment), so confidence, voice
// bounds and captions keep reading one format. Long audio is sent in pieces
// whose word clocks are shifted back onto the source clock.
func (p *Processor) transcribeHosted(ctx context.Context, transcriber aiprovider.Transcriber, id, file, dir, language string, duration float64) (Transcript, error) {
	if !finite(duration) || duration <= 0 {
		return Transcript{}, fmt.Errorf("invalid transcription duration")
	}
	started := time.Now()
	combined := aiprovider.Transcript{}
	chunks := int(math.Ceil(duration / hostedTranscriptionChunkSeconds))
	for i := range chunks {
		offset := float64(i * hostedTranscriptionChunkSeconds)
		name := fmt.Sprintf("hosted-audio-%03d.mp3", i)
		args := []string{"-i", file, "-vn"}
		if chunks > 1 {
			args = []string{"-ss", seconds(offset), "-i", file, "-t", seconds(min(hostedTranscriptionChunkSeconds, duration-offset)), "-vn"}
		}
		// Mono 64 kbit/s keeps speech intact at the source's own sample rate.
		args = append(args, "-ac", "1", "-c:a", "libmp3lame", "-b:a", "64k", name)
		if err := p.ffmpeg(ctx, dir, args...); err != nil {
			return Transcript{}, err
		}
		data, err := os.ReadFile(filepath.Join(dir, name))
		_ = os.Remove(filepath.Join(dir, name))
		if err != nil {
			return Transcript{}, err
		}
		callCtx, cancel := context.WithTimeout(ctx, hostedTranscriptionTimeout)
		part, err := transcriber.Transcribe(callCtx, data, "mp3", language)
		cancel()
		if err != nil {
			if ctx.Err() != nil {
				return Transcript{}, ctx.Err()
			}
			slog.Warn("Hosted transcription failed", "model", id, "chunk", i, "reason", aiprovider.SafeFailure(err).Error())
			return Transcript{}, fmt.Errorf("speech transcription failed: %w", aiprovider.SafeFailure(err))
		}
		if combined.Language == "" {
			combined.Language = part.Language
		}
		for _, word := range part.Words {
			word.Start, word.End = word.Start+offset, word.End+offset
			combined.Words = append(combined.Words, word)
		}
	}
	raw, words, scored := hostedWhisperJSON(combined)
	slog.Info("Hosted transcription", "model", id, "source_seconds", duration, "requests", chunks, "words", words, "words_with_confidence", scored, "ms", time.Since(started).Milliseconds())
	if err := os.WriteFile(filepath.Join(dir, "transcript.json"), raw, 0600); err != nil {
		return Transcript{}, err
	}
	return parseTranscriptClock(raw, duration, true)
}

// Some providers report ISO 639-3 codes ("ron"); the pipeline compares the
// two-letter codes Whisper used ("ro").
var hostedLanguageCodes = map[string]string{"ron": "ro", "rum": "ro", "mol": "ro", "eng": "en", "fra": "fr", "fre": "fr", "deu": "de", "ger": "de", "spa": "es", "ita": "it", "hun": "hu", "por": "pt", "rus": "ru", "ukr": "uk", "bul": "bg", "pol": "pl", "nld": "nl", "dut": "nl", "tur": "tr"}

func hostedLanguageCode(code string) string {
	code = strings.ToLower(strings.TrimSpace(code))
	if short, ok := hostedLanguageCodes[code]; ok {
		return short
	}
	return code
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
	doc.Result.Language = hostedLanguageCode(hosted.Language)
	if doc.Transcription == nil {
		doc.Transcription = []whisperJSONSegment{}
	}
	raw, _ := json.Marshal(doc)
	return raw, len(segments), scored
}
