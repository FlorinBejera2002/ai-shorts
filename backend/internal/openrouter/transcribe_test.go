package openrouter

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

func TestTranscribeRequestsWordTimingsWithoutDataCollection(t *testing.T) {
	client := New("private-test-key", "elevenlabs/scribe-v2", "")
	var languages []any
	client.HTTP = &http.Client{Transport: transportFunc(func(r *http.Request) (*http.Response, error) {
		var payload map[string]any
		if json.NewDecoder(r.Body).Decode(&payload) != nil || !strings.HasSuffix(r.URL.Path, "/audio/transcriptions") {
			t.Fatal("invalid transcription request")
		}
		granularities, _ := payload["timestamp_granularities"].([]any)
		audio, _ := payload["input_audio"].(map[string]any)
		if payload["model"] != "elevenlabs/scribe-v2" || payload["response_format"] != "verbose_json" || len(granularities) != 1 || granularities[0] != "word" ||
			payload["provider"].(map[string]any)["data_collection"] != "deny" || audio["format"] != "mp3" || audio["data"] == "" {
			t.Fatalf("transcription policy changed: %v", payload)
		}
		languages = append(languages, payload["language"])
		return response(200, `{"text":"Salut, lume! [râsete]","language":"ron","words":[
			{"word":"Salut,","type":"word","start":0.1,"end":0.5,"confidence":0.97},
			{"word":" ","type":"spacing","start":0.5,"end":0.6},
			{"word":"lume!","type":"word","start":0.6,"end":1.0},
			{"word":"[râsete]","type":"audio_event","start":1.1,"end":2.0,"confidence":0.9}]}`), nil
	})}
	got, err := client.Transcribe(context.Background(), []byte("mp3"), "mp3", "ro")
	if err != nil || got.Language != "ron" || len(got.Words) != 3 {
		t.Fatalf("unexpected transcript: %#v %v", got, err)
	}
	if got.Words[0].Text != "Salut," || got.Words[0].Confidence == nil || *got.Words[0].Confidence != .97 || got.Words[1].Confidence != nil || !got.Words[2].Event {
		t.Fatalf("word evidence lost or invented: %#v", got.Words)
	}
	if _, err = client.Transcribe(context.Background(), []byte("mp3"), "mp3", "auto"); err != nil || languages[0] != "ro" || languages[1] != nil {
		t.Fatalf("language hint: %v %v", languages, err)
	}
}

func TestTranscribeRejectsTextWithoutWordTimings(t *testing.T) {
	client := New("private-test-key", "openai/whisper-large-v3", "")
	client.HTTP = &http.Client{Transport: transportFunc(func(*http.Request) (*http.Response, error) {
		return response(200, `{"text":"Salut lume","language":"ro"}`), nil
	})}
	if _, err := client.Transcribe(context.Background(), []byte("mp3"), "mp3", "ro"); err == nil {
		t.Fatal("transcript without word timings was accepted")
	}
	client.HTTP.Transport = transportFunc(func(*http.Request) (*http.Response, error) {
		return response(400, `{"error":"private-test-key unsupported"}`), nil
	})
	if _, err := client.Transcribe(context.Background(), []byte("mp3"), "mp3", "ro"); err == nil || strings.Contains(err.Error(), "private-test-key") {
		t.Fatal("provider error accepted or leaked", err)
	}
	if _, err := client.Transcribe(context.Background(), []byte("audio"), "ogg", "ro"); err == nil {
		t.Fatal("unsupported audio format accepted")
	}
}
