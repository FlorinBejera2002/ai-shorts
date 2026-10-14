package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"sneepcut/backend-go/internal/aiprovider"
	"sneepcut/backend-go/internal/airouting"
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
	// Keep the legacy field readable when replaying single-model manifests.
	ProviderModel       string                     `json:"provider_model,omitempty"`
	TaskModels          map[aiprovider.Task]string `json:"task_models,omitempty"`
	SpeechModel         string                     `json:"speech_model"`
	SpeechModelBytes    int64                      `json:"speech_model_bytes,omitempty"`
	SpeechModelModified time.Time                  `json:"speech_model_modified_at,omitempty"`
}

func evaluationModels(ctx context.Context, cfg processing.Config, ai aiprovider.Generator) (modelConfiguration, error) {
	model := cfg.StoryWhisperModel
	if model == "" {
		model = cfg.WhisperModel
	}
	models := modelConfiguration{SpeechModel: filepath.Base(model)}
	if ai == nil {
		models.ProviderModel = "offline"
	} else {
		models.TaskModels = make(map[aiprovider.Task]string)
		for _, stage := range airouting.Stages() {
			selected, err := aiprovider.ForTask(ctx, ai, stage.Stage)
			if err != nil {
				return modelConfiguration{}, fmt.Errorf("resolve evaluation model for %s: %w", stage.Stage, err)
			}
			identity, ok := selected.(aiprovider.MediaModelIdentity)
			if !ok {
				return modelConfiguration{}, fmt.Errorf("evaluation model identity is unavailable for %s", stage.Stage)
			}
			models.TaskModels[stage.Stage] = identity.MediaModelIdentity()
		}
	}
	if info, err := os.Stat(model); err == nil {
		models.SpeechModelBytes, models.SpeechModelModified = info.Size(), info.ModTime().UTC()
	}
	return models, nil
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
