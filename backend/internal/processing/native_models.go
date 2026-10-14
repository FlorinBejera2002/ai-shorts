package processing

import (
	"context"

	"sneepcut/backend-go/internal/aiprovider"
)

// withNativeModels binds one operation to a stable set of installed models.
// The shared processor stays unresolved so the next operation sees admin edits.
func (p *Processor) withNativeModels(ctx context.Context) (*Processor, error) {
	if p.nativeResolved {
		return p, nil
	}
	selector, ok := p.ai.(aiprovider.NativeModelSelector)
	if !ok {
		return p, nil
	}
	models, err := selector.NativeModels(ctx)
	if err != nil {
		return nil, err
	}
	bound := *p
	bound.nativeResolved = true
	for task, model := range models {
		if model == "" {
			continue
		}
		switch task {
		case aiprovider.TaskTranscription:
			bound.cfg.WhisperModel = model
		case aiprovider.TaskStoryTranscription:
			bound.cfg.StoryWhisperModel = model
		case aiprovider.TaskVoiceDetection:
			bound.cfg.WhisperVADModel = model
		case aiprovider.TaskFaceTracking:
			bound.cfg.FaceModel = model
		}
	}
	return &bound, nil
}
