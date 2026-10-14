package aiprovider

import "context"

// Task describes the responsibility of an AI call, independently of its model.
type Task string

const (
	TaskAssistant          Task = "assistant"
	TaskScripts            Task = "scripts"
	TaskWorkspaceAgent     Task = "workspace_agent"
	TaskStudioEditing      Task = "studio_editing"
	TaskStudioBackground   Task = "studio_background_removal"
	TaskTranscription      Task = "transcription"
	TaskStoryTranscription Task = "story_transcription"
	TaskVoiceDetection     Task = "voice_detection"
	TaskFaceTracking       Task = "face_tracking"
	TaskHighlights         Task = "highlights"
	TaskTransitions        Task = "transitions"
	TaskSourceAnalysis     Task = "source_analysis"
	TaskSpeechReview       Task = "speech_review"
	TaskStoryPlanning      Task = "story_planning"
	TaskStoryReview        Task = "story_review"
	TaskVideoReview        Task = "video_review"
)

// TaskSelector resolves one immutable provider for the operation about to run.
// A subsequent operation can observe a newer configuration without a restart.
type TaskSelector interface {
	ForTask(context.Context, Task) (Generator, error)
}

// NativeModelSelector returns approved installed paths, never administrator-
// supplied executable names or arbitrary filesystem paths.
type NativeModelSelector interface {
	NativeModels(context.Context) (map[Task]string, error)
}

// ForTask preserves simple generators used by local fixtures and evaluations.
func ForTask(ctx context.Context, generator Generator, task Task) (Generator, error) {
	if generator == nil {
		return nil, ErrNotConfigured
	}
	if selector, ok := generator.(TaskSelector); ok {
		return selector.ForTask(ctx, task)
	}
	return generator, nil
}
