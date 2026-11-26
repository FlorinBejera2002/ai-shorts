package processing

import (
	"context"
	"fmt"

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
	// Story transcription may instead be routed to a hosted model. Any other
	// route (an installed engine, or a missing key) keeps local recognition.
	if generator, err := aiprovider.ForTask(ctx, p.ai, aiprovider.TaskStoryTranscription); err == nil {
		if transcriber, ok := generator.(aiprovider.Transcriber); ok {
			bound.storyTranscriber = transcriber
			bound.storyTranscriberID = fmt.Sprintf("%T", generator)
			if identity, ok := generator.(aiprovider.MediaModelIdentity); ok {
				bound.storyTranscriberID = identity.MediaModelIdentity()
			}
		}
	}
	return &bound, nil
}
