// Package processing runs the native media pipeline; it does not require Python.
package processing

import (
	"context"
	"sneepcut/backend-go/internal/aiprovider"
	"sneepcut/backend-go/internal/audiocleanup"
	"sneepcut/backend-go/internal/media"
	"sneepcut/backend-go/internal/music"
	"time"
)

type Config struct {
	StudioURL, StudioSecret, MediaOrigin, MediaSigningSecret string
	DeepFilterPath, DeepFilterModel                          string
	AudioCleanupTimeout                                      time.Duration
	FFmpegPath, FFprobePath, FaceModel, TempDir              string
	Timeout                                                  time.Duration

	// Speech is transcribed by the hosted model routed in admin; only the
	// Silero voice detector (model and its whisper.cpp CLI) runs locally.
	WhisperVADModel, WhisperVADPath string
}

func ConfigFromEnv(get func(string) string) (Config, error) {
	c := Config{FFmpegPath: get("FFMPEG_PATH"), FFprobePath: get("FFPROBE_PATH"), FaceModel: get("PIGO_FACE_MODEL"), TempDir: get("PROCESSING_TEMP_DIR"), Timeout: 2 * time.Hour}
	if c.FFmpegPath == "" {
		c.FFmpegPath = "ffmpeg"
	}
	if c.FFprobePath == "" {
		c.FFprobePath = "ffprobe"
	}
	c.WhisperVADModel, c.WhisperVADPath = get("WHISPER_CPP_VAD_MODEL"), get("WHISPER_CPP_VAD_PATH")
	if c.WhisperVADModel == "" {
		c.WhisperVADModel = "/models/ggml-vad.bin"
	}
	if c.WhisperVADPath == "" {
		c.WhisperVADPath = "whisper-vad-speech-segments"
	}
	if c.FaceModel == "" {
		c.FaceModel = "/models/facefinder"
	}
	c.DeepFilterPath, c.DeepFilterModel = get("DEEPFILTER_PATH"), get("DEEPFILTER_MODEL")
	c.AudioCleanupTimeout = 10 * time.Minute
	c.StudioURL, c.StudioSecret = get("STUDIO_AGENT_URL"), get("STUDIO_AGENT_SECRET")
	c.MediaOrigin, c.MediaSigningSecret = get("APP_URL"), get("INTERNAL_API_KEY")
	return c, nil
}

type Segment struct {
	Start float64 `json:"start"`
	End   float64 `json:"end"`
}
type Word struct {
	Text  string  `json:"text"`
	Start float64 `json:"start"`
	End   float64 `json:"end"`
}
type TranscriptSegment struct {
	ID    int     `json:"id"`
	Start float64 `json:"start"`
	End   float64 `json:"end"`
	Text  string  `json:"text"`
	Words []Word  `json:"words"`
}
type Transcript struct {
	Text     string              `json:"text"`
	Language string              `json:"language"`
	Duration float64             `json:"duration"`
	Segments []TranscriptSegment `json:"segments"`
	Words    []Word              `json:"words"`
}
type Input struct {
	UserID                                                                   string
	AudioCleanup                                                             *audiocleanup.Settings
	SourceKey, Namespace, Language, Instructions, AspectRatio, SubtitleStyle string
	RequestedClips                                                           int
	SmartCrop, BurnSubtitles                                                 bool
	Brand                                                                    map[string]any
}
type RenderInput struct {
	UserID                                                                 string                   `json:"user_id,omitempty"`
	StudioArtifactID                                                       string                   `json:"studio_artifact_id,omitempty"`
	StudioProjectID                                                        string                   `json:"-"`
	StudioOperationID                                                      string                   `json:"-"`
	StudioSourceClipID                                                     string                   `json:"-"`
	StudioExpectedDuration                                                 float64                  `json:"-"`
	StudioExportOnly                                                       bool                     `json:"-"`
	StudioRemovePlatformBadge                                              bool                     `json:"-"`
	StudioTrim                                                             bool                     `json:"-"`
	AudioCleanup                                                           *audiocleanup.Settings   `json:"audio_cleanup,omitempty"`
	PreparedAudio                                                          *audiocleanup.Derivative `json:"prepared_audio,omitempty"`
	Reuse                                                                  *Clip                    `json:"-"`
	PreviousDecisions                                                      []BoundaryDecision       `json:"-"`
	SourceKey, Namespace, AspectRatio, SubtitleStyle, Transition, HookText string
	TransitionDuration                                                     float64
	Segments                                                               []Segment
	SmartCrop, BurnSubtitles, PreserveGeometry, NaturalTransitions         bool
	Transcript                                                             Transcript
	Brand                                                                  map[string]any
}
type Clip struct {
	PreviewStorageKey                                                                                string
	TikTokStudioArtifactID                                                                           string
	StudioArtifactID                                                                                 string
	Index                                                                                            int
	Title, Description, HookText, StorageKey, ThumbnailKey, TikTokStorageKey, Resolution, Transition string
	Start, End, Duration, Score, TransitionDuration                                                  float64
	Segments                                                                                         []Segment
	Metadata                                                                                         map[string]any
	FileSize                                                                                         int64
	HasSubtitles, ContainsPlatformBadge                                                              bool
}
type Result struct {
	AudioCleanup *audiocleanup.Derivative
	SourceKey    string
	Duration     float64
	Transcript   Transcript
	Clips        []Clip
}
type Progress func(string, int, string)
type Processor struct {
	cfg            Config
	storage        media.Storage
	ai             aiprovider.Generator
	musicCatalog   *music.Catalog
	nativeResolved bool

	// Hosted speech-to-text bound per operation by withNativeModels; nil when
	// the routed model is unavailable (transcription then fails clearly).
	storyTranscriber   aiprovider.Transcriber
	storyTranscriberID string
	clipTranscriber    aiprovider.Transcriber
	clipTranscriberID  string
}

func New(c Config, s media.Storage, a aiprovider.Generator) *Processor {
	if c.Timeout <= 0 {
		c.Timeout = 2 * time.Hour
	}
	return &Processor{cfg: c, storage: s, ai: a, musicCatalog: music.NewCatalog()}
}
func (p *Processor) Process(ctx context.Context, in Input, progress Progress) (Result, error) {
	return p.process(ctx, in, progress)
}
func (p *Processor) Render(ctx context.Context, in RenderInput) (Clip, error) {
	return p.render(ctx, in)
}
