package openrouter

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"math"
	"strings"

	"sneepcut/backend-go/internal/aiprovider"
)

var _ aiprovider.Transcriber = (*Client)(nil)

type transcriptionResponse struct {
	Language string `json:"language"`
	Text     string `json:"text"`
	Words    []struct {
		Word       string   `json:"word"`
		Type       string   `json:"type"`
		Start      float64  `json:"start"`
		End        float64  `json:"end"`
		Confidence *float64 `json:"confidence"`
	} `json:"words"`
}

// Transcribe sends one bounded audio file to OpenRouter's speech-to-text
// endpoint and returns word timings. Providers that do not return words are
// rejected, so callers can fall back to local recognition. Data collection is
// denied: customer audio must not be retained for provider training.
func (c *Client) Transcribe(ctx context.Context, audio []byte, format, language string) (aiprovider.Transcript, error) {
	if c.Key == "" || c.Model == "" {
		return aiprovider.Transcript{}, aiprovider.ErrNotConfigured
	}
	if len(audio) == 0 || len(audio) > aiprovider.MaxTranscriptionBytes {
		return aiprovider.Transcript{}, errors.New("transcription audio exceeds the upload limit")
	}
	switch format {
	case "mp3", "wav", "flac":
	default:
		return aiprovider.Transcript{}, errors.New("unsupported transcription audio format")
	}
	body := map[string]any{
		"model":                   c.Model,
		"input_audio":             map[string]any{"data": base64.StdEncoding.EncodeToString(audio), "format": format},
		"response_format":         "verbose_json",
		"timestamp_granularities": []string{"word"},
		"temperature":             0,
		"provider":                map[string]any{"data_collection": "deny"},
	}
	if language = strings.TrimSpace(language); language != "" && language != "auto" {
		body["language"] = language
	}
	headers := map[string]string{"Authorization": "Bearer " + c.Key, "X-Title": "Sneepcut"}
	if c.Referer != "" {
		headers["HTTP-Referer"] = c.Referer
	}
	raw, err := aiprovider.MediaJSON(ctx, c.HTTP, strings.TrimRight(c.BaseURL, "/")+"/audio/transcriptions", headers, body)
	if err != nil {
		return aiprovider.Transcript{}, err
	}
	return parseTranscription(raw)
}

func parseTranscription(raw []byte) (aiprovider.Transcript, error) {
	var response transcriptionResponse
	if json.Unmarshal(raw, &response) != nil {
		return aiprovider.Transcript{}, errors.New("transcription response is invalid")
	}
	result := aiprovider.Transcript{Language: response.Language}
	if strings.TrimSpace(response.Text) != "" && len(response.Words) == 0 {
		return result, errors.New("transcription model returned no word timings")
	}
	for _, word := range response.Words {
		text := strings.TrimSpace(word.Word)
		// Spacing entries carry no word; a provider may mark them by type or
		// by whitespace-only text.
		if word.Type == "spacing" || text == "" {
			continue
		}
		if math.IsNaN(word.Start) || math.IsNaN(word.End) || math.IsInf(word.Start, 0) || math.IsInf(word.End, 0) || word.Start < 0 || word.End < word.Start {
			return result, errors.New("transcription returned an invalid word timing")
		}
		var confidence *float64
		if word.Confidence != nil && *word.Confidence >= 0 && *word.Confidence <= 1 {
			value := *word.Confidence
			confidence = &value
		}
		result.Words = append(result.Words, aiprovider.TranscriptWord{Text: text, Start: word.Start, End: word.End, Confidence: confidence, Event: word.Type == "audio_event"})
	}
	return result, nil
}
