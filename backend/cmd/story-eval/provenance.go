package main

import (
	"os"
	"path/filepath"
	"time"

	"sneepcut/backend-go/internal/aiprovider"
	"sneepcut/backend-go/internal/processing"
	"sneepcut/backend-go/internal/story"
)

type evaluationProvenance struct {
	Created          time.Time          `json:"created_at"`
	Input            string             `json:"input_directory"`
	Provider         string             `json:"provider"`
	SpeechModel      string             `json:"speech_model"`
	Limits           story.Limits       `json:"limits"`
	Sources          []sourceProvenance `json:"sources"`
	AlgorithmVersion string             `json:"algorithm_version,omitempty"`
	Models           modelConfiguration `json:"model_configuration"`
	Replay           *replayProvenance  `json:"replay,omitempty"`
}

type modelConfiguration struct {
	ProviderModel       string    `json:"provider_model"`
	SpeechModel         string    `json:"speech_model"`
	SpeechModelBytes    int64     `json:"speech_model_bytes,omitempty"`
	SpeechModelModified time.Time `json:"speech_model_modified_at,omitempty"`
}

func evaluationModels(cfg processing.Config, ai aiprovider.Generator) modelConfiguration {
	model := cfg.StoryWhisperModel
	if model == "" {
		model = cfg.WhisperModel
	}
	models := modelConfiguration{ProviderModel: "offline", SpeechModel: filepath.Base(model)}
	if identity, ok := ai.(aiprovider.MediaModelIdentity); ok {
		models.ProviderModel = identity.MediaModelIdentity()
	}
	if info, err := os.Stat(model); err == nil {
		models.SpeechModelBytes, models.SpeechModelModified = info.Size(), info.ModTime().UTC()
	}
	return models
}

type replayProvenance struct {
	PreviousRun         string `json:"previous_run_directory"`
	PreviousRequestHash string `json:"previous_request_sha256"`
	PreviousProvider    string `json:"previous_provider"`
	PreviousSpeechModel string `json:"previous_speech_model"`
	VerifiedSources     int    `json:"verified_sources"`
	Verification        string `json:"verification"`
	LinkedCacheFiles    int    `json:"linked_cache_files"`
	CopiedCacheFiles    int    `json:"copied_cache_files"`
	VersionStart        int    `json:"version_start"`
}

func (r *replayRun) provenanceRecord(versionStart int) *replayProvenance {
	return &replayProvenance{PreviousRun: r.directory, PreviousRequestHash: r.requestHash,
		PreviousProvider: r.provenance.Provider, PreviousSpeechModel: r.provenance.SpeechModel,
		VerifiedSources: len(r.request.Assets), Verification: "Production Inspect: complete media decode, stream/timestamp checks and original SHA-256 match",
		LinkedCacheFiles: r.linked, CopiedCacheFiles: r.copied, VersionStart: versionStart}
}
