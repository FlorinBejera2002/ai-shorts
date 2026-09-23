// Package processing runs the native media pipeline; it does not require Python.
package processing

import (
	"context"
	"sneepcut/backend-go/internal/aiprovider"
	"sneepcut/backend-go/internal/media"
	"time"
)

type Config struct {
	FFmpegPath, FFprobePath, WhisperPath, WhisperModel, FaceModel, TempDir string
	StoryWhisperModel                                                      string
	Timeout                                                                time.Duration
}

func ConfigFromEnv(get func(string) string) (Config, error) {
	c := Config{FFmpegPath: get("FFMPEG_PATH"), FFprobePath: get("FFPROBE_PATH"), WhisperPath: get("WHISPER_CPP_PATH"), WhisperModel: get("WHISPER_CPP_MODEL"), FaceModel: get("PIGO_FACE_MODEL"), TempDir: get("PROCESSING_TEMP_DIR"), Timeout: 2 * time.Hour}
	if c.FFmpegPath == "" {
		c.FFmpegPath = "ffmpeg"
	}
	if c.FFprobePath == "" {
		c.FFprobePath = "ffprobe"
	}
	if c.WhisperPath == "" {
		c.WhisperPath = "whisper-cli"
	}
	if c.WhisperModel == "" {
		c.WhisperModel = "/models/ggml-base.bin"
	}
	c.StoryWhisperModel = get("STORY_WHISPER_CPP_MODEL")
	if c.StoryWhisperModel == "" {
		c.StoryWhisperModel = c.WhisperModel
	}
	if c.FaceModel == "" {
		c.FaceModel = "/models/facefinder"
	}
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
	SourceKey, SourceURL, Namespace, Language, Instructions, AspectRatio, SubtitleStyle string
	RequestedClips                                                                      int
	SmartCrop, BurnSubtitles                                                            bool
	Brand                                                                               map[string]any
}
type RenderInput struct {
	Reuse                                                                  *Clip              `json:"-"`
	PreviousDecisions                                                      []BoundaryDecision `json:"-"`
	SourceKey, Namespace, AspectRatio, SubtitleStyle, Transition, HookText string
	TransitionDuration                                                     float64
	Segments                                                               []Segment
	SmartCrop, BurnSubtitles, PreserveGeometry, NaturalTransitions         bool
	Transcript                                                             Transcript
	Brand                                                                  map[string]any
}
type Clip struct {
	Index                                                                                            int
	Title, Description, HookText, StorageKey, ThumbnailKey, TikTokStorageKey, Resolution, Transition string
	Start, End, Duration, Score, TransitionDuration                                                  float64
	Segments                                                                                         []Segment
	Metadata                                                                                         map[string]any
	FileSize                                                                                         int64
	HasSubtitles, ContainsPlatformBadge                                                              bool
}
type Result struct {
	SourceKey  string
	Duration   float64
	Transcript Transcript
	Clips      []Clip
}
type Progress func(string, int, string)
type Processor struct {
	cfg     Config
	storage media.Storage
	ai      aiprovider.Generator
}

func New(c Config, s media.Storage, a aiprovider.Generator) *Processor {
	if c.Timeout <= 0 {
		c.Timeout = 2 * time.Hour
	}
	return &Processor{c, s, a}
}
func (p *Processor) Process(ctx context.Context, in Input, progress Progress) (Result, error) {
	return p.process(ctx, in, progress)
}
func (p *Processor) Render(ctx context.Context, in RenderInput) (Clip, error) {
	return p.render(ctx, in)
}
