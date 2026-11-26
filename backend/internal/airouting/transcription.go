package airouting

import "sneepcut/backend-go/internal/aiprovider"

// OpenRouter's speech-to-text models are served by a separate endpoint and
// do not appear in its chat model catalog. These return word timings in
// verbose JSON, which story analysis requires; ElevenLabs Scribe v2 also
// scores every word and tags non-speech events.
var openRouterTranscriptionModels = []Model{
	{ID: "elevenlabs/scribe-v2", Name: "ElevenLabs Scribe v2", Provider: "openrouter", InputModalities: []string{"audio", "transcription"}},
	{ID: "assemblyai/universal-3-6-pro", Name: "AssemblyAI Universal-3.6 Pro", Provider: "openrouter", InputModalities: []string{"audio", "transcription"}},
	{ID: "deepgram/nova-3", Name: "Deepgram Nova-3", Provider: "openrouter", InputModalities: []string{"audio", "transcription"}},
	{ID: "mistralai/voxtral-small-transcribe-3-0", Name: "Mistral Voxtral Small Transcribe", Provider: "openrouter", InputModalities: []string{"audio", "transcription"}},
	{ID: "openai/whisper-large-v3-turbo", Name: "Whisper Large v3 Turbo", Provider: "openrouter", InputModalities: []string{"audio", "transcription"}},
}

func hostedTranscriptionProvider(provider string) bool { return provider == "openrouter" }

// nativeRouteRequired reports whether a stage only runs on an installed
// engine. Story transcription alone has a hosted path (with local fallback).
func nativeRouteRequired(task aiprovider.Task, provider string) bool {
	switch task {
	case aiprovider.TaskTranscription, aiprovider.TaskVoiceDetection, aiprovider.TaskFaceTracking:
		return true
	case aiprovider.TaskStoryTranscription:
		return !hostedTranscriptionProvider(provider)
	}
	return false
}

func nativeProvider(provider string) bool {
	return provider == "whisper_cpp" || provider == "silero" || provider == "pigo"
}

func transcriptionModels() []Model {
	models := make([]Model, len(openRouterTranscriptionModels))
	for i, model := range openRouterTranscriptionModels {
		model.InputModalities = append([]string{}, model.InputModalities...)
		models[i] = model
	}
	return models
}
