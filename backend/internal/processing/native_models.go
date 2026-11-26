package processing

import (
	"context"
	"fmt"

	"sneepcut/backend-go/internal/aiprovider"
)

// withNativeModels binds one operation to a stable set of engines: installed
// voice detection and face tracking models, and the hosted speech-to-text
// models routed for story and clip transcription. The shared processor stays
// unresolved so the next operation sees admin edits.
func (p *Processor) withNativeModels(ctx context.Context) (*Processor, error) {
	if p.nativeResolved {
		return p, nil
	}
	bound := *p
	bound.nativeResolved = true
	if selector, ok := p.ai.(aiprovider.NativeModelSelector); ok {
		models, err := selector.NativeModels(ctx)
		if err != nil {
			return nil, err
		}
		for task, model := range models {
			if model == "" {
				continue
			}
			switch task {
			case aiprovider.TaskVoiceDetection:
				bound.cfg.WhisperVADModel = model
			case aiprovider.TaskFaceTracking:
				bound.cfg.FaceModel = model
			}
		}
	}
	// A routed model replaces any directly configured engine; without a route
	// the processor keeps what it was constructed with.
	if transcriber, id := hostedTranscriber(ctx, p.ai, aiprovider.TaskStoryTranscription); transcriber != nil {
		bound.storyTranscriber, bound.storyTranscriberID = transcriber, id
	}
	if transcriber, id := hostedTranscriber(ctx, p.ai, aiprovider.TaskTranscription); transcriber != nil {
		bound.clipTranscriber, bound.clipTranscriberID = transcriber, id
	}
	return &bound, nil
}

// hostedTranscriber returns the speech-to-text client routed for task, or nil
// when the route has no transcribing model or its key is not configured.
func hostedTranscriber(ctx context.Context, ai aiprovider.Generator, task aiprovider.Task) (aiprovider.Transcriber, string) {
	generator, err := aiprovider.ForTask(ctx, ai, task)
	if err != nil {
		return nil, ""
	}
	transcriber, ok := generator.(aiprovider.Transcriber)
	if !ok {
		return nil, ""
	}
	id := fmt.Sprintf("%T", generator)
	if identity, ok := generator.(aiprovider.MediaModelIdentity); ok {
		id = identity.MediaModelIdentity()
	}
	return transcriber, id
}
