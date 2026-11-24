package story

import (
	"strconv"
	"strings"
)

// MaxClipCount bounds how many clips one upload story can produce.
const MaxClipCount = 30

const (
	// autoFootageSecondsPerClip sizes Auto from the footage: about two minutes of
	// source material per clip, so a 45 second edit has room to choose distinct moments.
	autoFootageSecondsPerClip = 120
	autoClipCountCeiling      = 5
)

// ClipOutput is one rendered clip of a version. Keys and internal fields stay in
// the saved version; the HTTP layer exposes signed URLs and the library clip id.
type ClipOutput struct {
	ID               string  `json:"id"`
	Index            int     `json:"index"`
	Key              string  `json:"key"`
	ThumbnailKey     string  `json:"thumbnail_key,omitempty"`
	DurationSeconds  float64 `json:"duration_seconds"`
	AspectRatio      string  `json:"aspect_ratio"`
	ClipID           string  `json:"clip_id"`
	Size             int64   `json:"size"`
	Resolution       string  `json:"resolution"`
	Captions         bool    `json:"captions"`
	Title            string  `json:"title"`
	StudioArtifactID string  `json:"studio_artifact_id,omitempty"`
	TranscriptText   string  `json:"transcript_text,omitempty"`
}

// Library reports whether the output has everything a Clips library row needs.
func (o ClipOutput) Library() bool {
	return o.Key != "" && o.DurationSeconds > 0 && o.Size > 0 && o.Resolution != ""
}

// ResolvedClipCount is the number of clips a generation produces and is charged
// for. Auto scales with the footage, as the YouTube flow lets its selection stop
// early when the material cannot support more clips.
func ResolvedClipCount(o Options, assets []Asset) int {
	if o.Narration {
		return 1
	}
	if o.ClipCount > 0 {
		return min(o.ClipCount, MaxClipCount)
	}
	footageSeconds := 0.0
	for _, a := range assets {
		if a.Kind != "narration" && a.Include != "excluded" {
			footageSeconds += a.Duration
		}
	}
	return min(max(int(footageSeconds/autoFootageSecondsPerClip), 1), autoClipCountCeiling)
}

// ClipOutputs returns the version's clips. Versions saved before multi-clip
// support expose their single Output as the only clip.
func (v Version) ClipOutputs() []ClipOutput {
	if len(v.Outputs) > 0 {
		return v.Outputs
	}
	if v.Output.Key == "" {
		return nil
	}
	return []ClipOutput{primaryClipOutput(v)}
}

// primaryClipOutput mirrors the legacy single-output fields as clip 0.
func primaryClipOutput(v Version) ClipOutput {
	aspect := ""
	if v.RenderOptions != nil {
		aspect = v.RenderOptions.AspectRatio
	}
	return ClipOutput{
		ID:               clipOutputID(v.Number, 0),
		Index:            0,
		Key:              v.Output.Key,
		ThumbnailKey:     v.Output.ThumbnailKey,
		DurationSeconds:  v.Output.Duration,
		AspectRatio:      aspect,
		Size:             v.Output.Size,
		Resolution:       v.Output.Resolution,
		Captions:         v.Output.Captions,
		Title:            v.Plan.Title,
		StudioArtifactID: v.Output.StudioArtifactID,
		TranscriptText:   transcriptText(v.Timeline),
	}
}

func clipOutputID(number, index int) string {
	return "v" + strconv.Itoa(number) + "-" + strconv.Itoa(index)
}

func transcriptText(timeline []Entry) string {
	var text strings.Builder
	for _, entry := range timeline {
		for _, word := range entry.Words {
			if text.Len() > 0 {
				text.WriteByte(' ')
			}
			text.WriteString(word.Text)
		}
	}
	return text.String()
}
