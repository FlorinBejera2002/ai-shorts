// Package story defines source-backed editing contracts. AI can propose edits,
// but only validated source intervals can become executable timelines.
package story

import (
	"context"
	"time"
)

const AlgorithmVersion = "story-v1"

type budgetKey struct{}

// WithAIBudget carries a durable reservation hook through planning and media
// review so process restarts cannot silently reset the provider-call budget.
func WithAIBudget(ctx context.Context, reserve func(context.Context) error) context.Context {
	return context.WithValue(ctx, budgetKey{}, reserve)
}
func ReserveAICall(ctx context.Context) error {
	if reserve, ok := ctx.Value(budgetKey{}).(func(context.Context) error); ok {
		return reserve(ctx)
	}
	return ctx.Err()
}

type Limits struct {
	MaxFiles         int           `json:"max_files"`
	MaxFileBytes     int64         `json:"max_file_bytes"`
	MaxTotalBytes    int64         `json:"max_total_bytes"`
	MaxSourceSeconds float64       `json:"max_source_seconds"`
	MaxTotalSeconds  float64       `json:"max_total_seconds"`
	MaxRepairCycles  int           `json:"max_repair_cycles"`
	MaxAlternatives  int           `json:"max_alternatives"`
	MaxAICalls       int           `json:"max_ai_calls"`
	Timeout          time.Duration `json:"-"`
}

func DefaultLimits() Limits { return Limits{20, 2 << 30, 10 << 30, 900, 3600, 2, 2, 12, 2 * time.Hour} }

type Options struct {
	Narration        bool     `json:"narration,omitempty"`
	Brief            string   `json:"brief"`
	TargetSeconds    int      `json:"target_seconds"`
	AspectRatio      string   `json:"aspect_ratio"`
	Language         string   `json:"language"`
	Mode             string   `json:"mode"`
	PreserveOrder    bool     `json:"preserve_order"`
	Captions         bool     `json:"captions"`
	SubtitleColor    string   `json:"subtitle_color,omitempty"`
	SubtitlePosition string   `json:"subtitle_position,omitempty"`
	SubtitleFont     string   `json:"subtitle_font,omitempty"`
	SubtitleSize     int      `json:"subtitle_size,omitempty"`
	LogoResourceID   string   `json:"logo_resource_id,omitempty"`
	LogoPosition     string   `json:"logo_position,omitempty"`
	LogoOpacity      *float64 `json:"logo_opacity,omitempty"`
}

func DefaultOptions() Options {
	return Options{TargetSeconds: 45, AspectRatio: "9:16", Language: "auto", Mode: "smart", Captions: true}
}

type TimeMap struct {
	OriginalStart   float64 `json:"original_start"`
	NormalizedStart float64 `json:"normalized_start"`
	Duration        float64 `json:"duration"`
	Rate            float64 `json:"rate"`
	Method          string  `json:"method"`
}

type Asset struct {
	Kind                    string      `json:"kind,omitempty"`
	ID                      string      `json:"id"`
	Name                    string      `json:"name"`
	Key                     string      `json:"key"`
	Hash                    string      `json:"hash"`
	Size                    int64       `json:"size"`
	Duration                float64     `json:"duration"`
	Width                   int         `json:"width"`
	Height                  int         `json:"height"`
	HasAudio                bool        `json:"has_audio"`
	Order                   int         `json:"order"`
	Role                    string      `json:"role"`
	Include                 string      `json:"include"` // auto, required, excluded
	ProxyKey                string      `json:"proxy_key,omitempty"`
	ThumbnailKey            string      `json:"thumbnail_key,omitempty"`
	Mapping                 TimeMap     `json:"mapping"`
	AnalysisVersion         string      `json:"analysis_version,omitempty"`
	SemanticAnalysisVersion string      `json:"semantic_analysis_version,omitempty"`
	Candidates              []Candidate `json:"candidates,omitempty"`
	Warnings                []string    `json:"warnings,omitempty"`
}

type Word struct {
	Text  string  `json:"text"`
	Start float64 `json:"start"`
	End   float64 `json:"end"`
}

type Candidate struct {
	ID           string   `json:"id"`
	SourceID     string   `json:"source_id"`
	In           float64  `json:"in"`
	Out          float64  `json:"out"`
	Text         string   `json:"text"`
	Words        []Word   `json:"words"`
	Language     string   `json:"language"`
	Speaker      string   `json:"speaker"`
	Role         string   `json:"role"`
	Idea         string   `json:"idea"`
	Dependencies []string `json:"dependencies"`
	TakeGroup    string   `json:"take_group"`
	AudioScore   float64  `json:"audio_score"`
	VisualScore  float64  `json:"visual_score"`
	Confidence   float64  `json:"confidence"`
	Reason       string   `json:"reason"`
}

type Block struct {
	Narration           *Interval `json:"narration,omitempty"`
	Visual              *Interval `json:"visual,omitempty"`
	ID                  string    `json:"id"`
	CandidateID         string    `json:"candidate_id"`
	IdentityReferenceID string    `json:"identity_reference_id,omitempty"`
	Role                string    `json:"role"`
	Reason              string    `json:"reason"`
	Alternatives        []string  `json:"alternatives"`
	BRollID             string    `json:"b_roll_id,omitempty"`
	Crop                string    `json:"crop"` // fit or track
	Locked              bool      `json:"locked"`
	LockText            bool      `json:"lock_text"`
	LockOrder           bool      `json:"lock_order"`
	LockCrop            bool      `json:"lock_crop"`
}

type Plan struct {
	Title   string   `json:"title"`
	Summary string   `json:"summary"`
	Blocks  []Block  `json:"blocks"`
	Gaps    []string `json:"gaps"`
}

type Interval struct {
	SourceID string  `json:"source_id"`
	In       float64 `json:"in"`
	Out      float64 `json:"out"`
}

type Entry struct {
	BlockID     string    `json:"block_id"`
	CandidateID string    `json:"candidate_id"`
	OutputIn    float64   `json:"output_in"`
	OutputOut   float64   `json:"output_out"`
	Video       Interval  `json:"video"`
	Audio       *Interval `json:"audio,omitempty"`
	Crop        string    `json:"crop"`
	Words       []Word    `json:"words"` // Output clock; source words remain in Candidate.
	Transition  string    `json:"transition"`
}

type Issue struct {
	ID          string   `json:"id"`
	Type        string   `json:"type"`
	Severity    string   `json:"severity"`
	Start       float64  `json:"start"`
	End         float64  `json:"end"`
	BlockID     string   `json:"block_id,omitempty"`
	SourceIDs   []string `json:"source_ids"`
	Evidence    string   `json:"evidence"`
	Confidence  float64  `json:"confidence"`
	Operation   string   `json:"operation,omitempty"`
	CandidateID string   `json:"candidate_id,omitempty"`
	Resolved    bool     `json:"resolved"`
	RepairNote  string   `json:"repair_note,omitempty"`
}

type Coverage struct {
	Plan           bool     `json:"plan"`
	File           bool     `json:"file"`
	Audio          bool     `json:"audio"`
	Visual         bool     `json:"visual"`
	Captions       bool     `json:"captions"`
	Semantics      bool     `json:"semantics"`
	SourceIdentity bool     `json:"source_identity"`
	Boundaries     bool     `json:"boundaries"`
	Incomplete     []string `json:"incomplete"`
}

type Report struct {
	Version  int      `json:"version"`
	Status   string   `json:"status"`
	Coverage Coverage `json:"coverage"`
	Issues   []Issue  `json:"issues"`
}

type Output struct {
	Key          string  `json:"key"`
	ThumbnailKey string  `json:"thumbnail_key"`
	Duration     float64 `json:"duration"`
	Size         int64   `json:"size"`
	Resolution   string  `json:"resolution"`
	Captions     bool    `json:"captions"`
}

type Version struct {
	RenderOptions *Options `json:"render_options,omitempty"`
	Number        int      `json:"number"`
	Parent        int      `json:"parent"`
	Plan          Plan     `json:"plan"`
	Timeline      []Entry  `json:"timeline"`
	Output        Output   `json:"output"`
	Report        Report   `json:"report"`
	Accepted      bool     `json:"accepted"`
}

type Attempt struct {
	IssueID     string   `json:"issue_id"`
	Operation   string   `json:"operation"`
	BlockID     string   `json:"block_id"`
	CandidateID string   `json:"candidate_id"`
	Scope       []string `json:"scope"`
	Version     int      `json:"version"`
	Accepted    bool     `json:"accepted"`
	Reason      string   `json:"reason"`
}

type Request struct {
	ID               string    `json:"id"`
	UserID           string    `json:"user_id"`
	LogoKey          string    `json:"logo_key,omitempty"`
	Options          Options   `json:"options"`
	Assets           []Asset   `json:"assets"`
	Base             *Version  `json:"base,omitempty"`
	Action           string    `json:"action,omitempty"`
	BlockID          string    `json:"block_id,omitempty"`
	CandidateID      string    `json:"candidate_id,omitempty"`
	VersionStart     int       `json:"version_start"`
	PreviousAttempts []Attempt `json:"previous_attempts,omitempty"`
}

type Result struct {
	Best     Version   `json:"best"`
	Attempts []Attempt `json:"attempts"`
	AICalls  int       `json:"ai_calls"`
}

// Media operates only on trusted, project-scoped assets, never URLs supplied by AI.
type Media interface {
	Inspect(context.Context, string) (Asset, error)
	Analyze(context.Context, string, Asset, Options) (Asset, error)
	RenderStory(context.Context, Request, Version) (Output, error)
	ReviewStory(context.Context, Request, Version) (Report, error)
}

type NarrationInspector interface {
	InspectNarration(context.Context, string) (Asset, error)
}

// SourceAnalyzer optionally enriches original source candidates with visual and
// contextual meaning. Implementations own content/model/settings cache checks
// and reserve a provider call only on an actual cache miss.
type SourceAnalyzer interface {
	AnalyzeStorySources(context.Context, []Asset, Options) ([]Asset, error)
}

// Checkpoints are fenced by the durable worker's lease. Losing ownership must
// cancel processing; accepted versions survive retries and failed repairs.
type Checkpoints interface {
	Progress(context.Context, string, string) error
	SaveAsset(context.Context, Asset) error
	SaveVersion(context.Context, Version) error
	SaveAttempt(context.Context, Attempt) error
}
