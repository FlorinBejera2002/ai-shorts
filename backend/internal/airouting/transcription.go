package airouting

import "sneepcut/backend-go/internal/aiprovider"

// defaultTranscriptionModel scored every word, tagged non-speech events and
// reports the lowest published Romanian error rate among the models compared.
const defaultTranscriptionModel = "elevenlabs/scribe-v2"

// OpenRouter's speech-to-text models are served by a separate endpoint and
// do not appear in its chat model catalog. These return word timings in
// verbose JSON, which transcription requires.
var openRouterTranscriptionModels = []Model{
	{ID: "elevenlabs/scribe-v2", Name: "ElevenLabs Scribe v2", Provider: "openrouter", InputModalities: []string{"audio", "transcription"}},
	{ID: "assemblyai/universal-3-6-pro", Name: "AssemblyAI Universal-3.6 Pro", Provider: "openrouter", InputModalities: []string{"audio", "transcription"}},
	{ID: "deepgram/nova-3", Name: "Deepgram Nova-3", Provider: "openrouter", InputModalities: []string{"audio", "transcription"}},
	{ID: "mistralai/voxtral-small-transcribe-3-0", Name: "Mistral Voxtral Small Transcribe", Provider: "openrouter", InputModalities: []string{"audio", "transcription"}},
	{ID: "openai/whisper-large-v3-turbo", Name: "Whisper Large v3 Turbo", Provider: "openrouter", InputModalities: []string{"audio", "transcription"}},
}

func transcriptionModels() []Model {
	models := make([]Model, len(openRouterTranscriptionModels))
	for i, model := range openRouterTranscriptionModels {
		model.InputModalities = append([]string{}, model.InputModalities...)
		models[i] = model
	}
	return models
}

// retiredProvider names engines no longer installed. Saved routes to them are
// ignored so the stage uses its current default.
func retiredProvider(provider string) bool { return provider == "whisper_cpp" }

// routeProviderAllowed keeps each stage on the kind of engine that can run it:
// transcription only through OpenRouter, voice detection and face tracking
// only on installed engines.
func routeProviderAllowed(task aiprovider.Task, provider string) bool {
	switch task {
	case aiprovider.TaskTranscription, aiprovider.TaskStoryTranscription:
		return provider == "openrouter"
	case aiprovider.TaskVoiceDetection, aiprovider.TaskFaceTracking:
		return provider == "silero" || provider == "pigo"
	}
	return true
}
