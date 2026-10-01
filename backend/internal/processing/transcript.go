package processing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"unicode"
)

var errNoSpeech = errors.New("no speech detected in the video audio")
var errSpeechDetectionUnavailable = errors.New("voice activity detection is unavailable")

func (p *Processor) transcribe(ctx context.Context, file, dir, language string, duration float64) (Transcript, error) {
	return p.transcribeModel(ctx, file, dir, language, duration, p.cfg.WhisperModel)
}

func (p *Processor) transcribeModel(ctx context.Context, file, dir, language string, duration float64, model string) (Transcript, error) {
	return p.transcribeWithVAD(ctx, file, dir, language, duration, model, "")
}

// Story speech needs independent voice evidence. Audio level alone cannot
// distinguish a speaker from music, traffic or machinery. Legacy transcription
// callers retain their existing behavior until they opt into this contract.
func (p *Processor) transcribeStory(ctx context.Context, file, dir, language string, duration float64, model string) (Transcript, error) {
	vad := p.storyVADModel(model)
	if info, err := os.Stat(vad); err != nil || !info.Mode().IsRegular() || info.Size() == 0 {
		return Transcript{}, errSpeechDetectionUnavailable
	}
	return p.transcribeWithVAD(ctx, file, dir, language, duration, model, vad)
}

func (p *Processor) storyVADModel(model string) string {
	if p.cfg.WhisperVADModel != "" {
		return p.cfg.WhisperVADModel
	}
	return filepath.Join(filepath.Dir(model), "ggml-silero-v6.2.0.bin")
}

func (p *Processor) transcribeWithVAD(ctx context.Context, file, dir, language string, duration float64, model, vad string) (Transcript, error) {
	if language == "" {
		language = "auto"
	}
	if err := p.ffmpeg(ctx, dir, "-i", file, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", "audio.wav"); err != nil {
		return Transcript{}, err
	}
	args := []string{"-m", model, "-f", "audio.wav", "-l", language, "-ojf", "-of", "transcript", "-sow", "-ml", "1"}
	if vad != "" {
		// Keep short utterances and generous word-edge padding. These settings
		// gate ASR input; they never cut or modify the rendered source audio.
		args = append(args, "--vad", "--vad-model", vad)
		args = append(args, storyVADArguments...)
		args = append(args, "--no-speech-thold", "0.6", "--max-context", "0")
	}
	_, err := run(ctx, dir, p.cfg.WhisperPath, args...)
	if err != nil {
		return Transcript{}, err
	}
	raw, err := os.ReadFile(filepath.Join(dir, "transcript.json"))
	if err != nil {
		return Transcript{}, err
	}
	return parseTranscriptClock(raw, duration, vad != "")
}
func parseTranscript(raw []byte, duration float64) (Transcript, error) {
	return parseTranscriptClock(raw, duration, false)
}

func parseTranscriptClock(raw []byte, duration float64, originalSegmentClock bool) (Transcript, error) {
	type entry struct {
		Text    string
		Offsets struct{ From, To float64 }
		Tokens  []struct {
			Text    string
			Offsets *struct{ From, To float64 }
		}
	}
	var doc struct {
		Result        struct{ Language string }
		Transcription []entry
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		return Transcript{}, err
	}
	result := Transcript{Language: doc.Result.Language, Duration: duration, Words: []Word{}, Segments: []TranscriptSegment{}}
	for _, e := range doc.Transcription {
		start, end := e.Offsets.From/1000, e.Offsets.To/1000
		text := strings.TrimSpace(e.Text)
		if !spokenTranscriptText(text) || !finite(start) || !finite(end) || start < 0 || end <= start || end > duration+0.5 {
			continue
		}
		if end > duration {
			end = duration
		}
		s := TranscriptSegment{ID: len(result.Segments), Start: start, End: end, Text: text, Words: []Word{}}
		for _, t := range e.Tokens {
			// whisper.cpp v1.8.3 remaps segment timestamps after VAD, but
			// exports token timestamps on the compressed speech-only clock.
			// -sow -ml 1 gives word-bounded segments on the original clock.
			if originalSegmentClock {
				break
			}
			if t.Offsets == nil || strings.HasPrefix(t.Text, "[_") {
				continue
			}
			a, b := t.Offsets.From/1000, t.Offsets.To/1000
			if a < start || a >= end || b <= a || b > end+0.1 {
				continue
			}
			txt := strings.TrimSpace(t.Text)
			if txt == "" {
				continue
			}
			if len(s.Words) > 0 && !strings.HasPrefix(t.Text, " ") {
				last := &s.Words[len(s.Words)-1]
				last.Text += txt
				last.End = min(b, end)
			} else {
				s.Words = append(s.Words, Word{txt, a, min(b, end)})
			}
		}
		// Whisper can assign zero duration (or no timing) to a lexical BPE
		// fragment. Discarding that fragment must never change a word, number or
		// negation: e.g. " M" + "ă" must not become "ă". Our -sow -ml 1
		// invocation supplies word-bounded segments. For coarser imported JSON,
		// retain the whole segment and its measured clock instead of inventing
		// finer word alignment that the speech engine did not establish.
		parts := make([]string, len(s.Words))
		for i, word := range s.Words {
			parts[i] = word.Text
		}
		if strings.Join(strings.Fields(strings.Join(parts, " ")), " ") != strings.Join(strings.Fields(text), " ") {
			s.Words = []Word{{Text: text, Start: start, End: end}}
		}
		result.Segments = append(result.Segments, s)
		result.Words = append(result.Words, s.Words...)
		if result.Text != "" {
			result.Text += " "
		}
		result.Text += text
	}
	if result.Text == "" {
		return result, errNoSpeech
	}
	return result, nil
}

// Whisper annotations and control tokens are not spoken captions. This checks
// their structural syntax, never a blacklist of phrases a real person can say.
func spokenTranscriptText(text string) bool {
	if (strings.HasPrefix(text, "[") && strings.HasSuffix(text, "]")) || (strings.HasPrefix(text, "<|") && strings.HasSuffix(text, "|>")) {
		return false
	}
	return strings.ContainsFunc(text, func(r rune) bool { return unicode.IsLetter(r) || unicode.IsNumber(r) })
}

// RemapWords maps the visible halves of crossfades onto the composed timeline.
func RemapWords(words []Word, segments []Segment, transition string, overlap float64) []Word {
	result := []Word{}
	overlaps := make([]float64, len(segments))
	if transition != "" && transition != "cut" {
		for i := 0; i+1 < len(segments); i++ {
			overlaps[i] = max(0, min(overlap, (segments[i].End-segments[i].Start)/2, (segments[i+1].End-segments[i+1].Start)/2))
		}
	}
	offset := 0.0
	for i, segment := range segments {
		start, end := segment.Start, segment.End-overlaps[i]/2
		if i > 0 {
			start += overlaps[i-1] / 2
		}
		for _, word := range words {
			a, b := max(word.Start, start), min(word.End, end)
			if b > a {
				result = append(result, Word{word.Text, offset + a - segment.Start, offset + b - segment.Start})
			}
		}
		offset += segment.End - segment.Start - overlaps[i]
	}
	return result
}

func subtitleTime(t float64) string {
	ms := int(t*1000 + 0.5)
	return fmt.Sprintf("%02d:%02d:%02d,%03d", ms/3600000, ms/60000%60, ms/1000%60, ms%1000)
}

func writeSRT(file string, words []Word) error {
	var output strings.Builder
	clean := strings.NewReplacer("\r", " ", "\n", " ", "<", "", ">", "")
	block := 1
	for i := 0; i < len(words); {
		first := words[i]
		text, end := first.Text, first.End
		next := i + 1
		for next < len(words) {
			candidate := text + " " + words[next].Text
			// A readable cue may group adjacent words, but must disappear during
			// a real pause instead of bridging independently aligned utterances.
			if words[next].Start-end > .25 || len([]rune(candidate)) > 24 || words[next].End-first.Start > 2 {
				break
			}
			text, end = candidate, words[next].End
			next++
		}
		fmt.Fprintf(&output, "%d\n%s --> %s\n%s\n\n", block, subtitleTime(max(0, first.Start)), subtitleTime(max(.05, end)), clean.Replace(text))
		block++
		i = next
	}
	return os.WriteFile(file, []byte(output.String()), 0600)
}
