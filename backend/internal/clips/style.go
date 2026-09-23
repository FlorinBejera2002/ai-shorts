package clips

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"math"
	"sneepcut/backend-go/internal/processing"
	"sort"
)

type StyleInput struct {
	AspectRatio   string `json:"aspect_ratio,omitempty"`
	SubtitleStyle string `json:"subtitle_style,omitempty"`
	BurnSubtitles *bool  `json:"burn_subtitles,omitempty"`
	SmartCrop     *bool  `json:"smart_crop,omitempty"`
}

func (p StyleInput) Validate() error {
	if p.AspectRatio == "" && p.SubtitleStyle == "" && p.BurnSubtitles == nil && p.SmartCrop == nil {
		return errors.New("Choose at least one clip style change")
	}
	if p.AspectRatio != "" && p.AspectRatio != "9:16" && p.AspectRatio != "16:9" && p.AspectRatio != "1:1" {
		return errors.New("Invalid clip aspect ratio")
	}
	switch p.SubtitleStyle {
	case "", "default", "clean", "bold", "caption-box", "none":
	default:
		return errors.New("Invalid clip subtitle preset")
	}
	return nil
}
func sourceSegments(raw []byte, start, end, duration float64) ([]Segment, error) {
	var segments []Segment
	if len(raw) > 0 && string(raw) != "null" {
		if err := json.Unmarshal(raw, &segments); err != nil {
			return nil, err
		}
	}
	if len(segments) == 0 {
		segments = []Segment{{Start: start, End: end, Order: 0}}
	}
	sort.SliceStable(segments, func(i, j int) bool { return segments[i].Order < segments[j].Order })
	total := 0.0
	for _, s := range segments {
		if !finite(s.Start) || !finite(s.End) || s.Start < 0 || s.End <= s.Start {
			return nil, errors.New("Saved clip source mapping is invalid")
		}
		total += s.End - s.Start
	}
	if math.Abs(total-duration) > .15 {
		return nil, errors.New("Saved clip source mapping is ambiguous; restore or recut the original sources first")
	}
	return segments, nil
}
func prepareTrimMapping(ctx context.Context, tx *sql.Tx, id string, payload map[string]any) error {
	ambiguous, err := legacyTrimMapping(ctx, tx, id)
	if err != nil {
		return err
	}
	if ambiguous {
		payload["source_segments"] = nil
		return nil
	}
	var raw []byte
	var start, end, duration float64
	if err := tx.QueryRowContext(ctx, `SELECT segments,start_time,end_time,duration FROM clips WHERE id=$1`, id).Scan(&raw, &start, &end, &duration); err != nil {
		return err
	}
	segments, err := sourceSegments(raw, start, end, duration)
	if err != nil {
		payload["source_segments"] = nil
		return nil
	}
	from, okFrom := payload["start_time"].(float64)
	to, okTo := payload["end_time"].(float64)
	if !okFrom || !okTo {
		payload["source_segments"] = nil
		return nil
	}
	mapped := []Segment{}
	offset := 0.0
	for _, s := range segments {
		length := s.End - s.Start
		left := math.Max(from, offset)
		right := math.Min(to, offset+length)
		if right > left {
			mapped = append(mapped, Segment{Start: s.Start + left - offset, End: s.Start + right - offset, Order: len(mapped)})
		}
		offset += length
	}
	payload["source_segments"] = mapped
	return nil
}
func legacyTrimMapping(ctx context.Context, tx *sql.Tx, id string) (bool, error) {
	var ambiguous bool
	err := tx.QueryRowContext(ctx, `SELECT coalesce((SELECT kind='trim' AND (payload->'source_segments' IS NULL OR payload->'source_segments'='null'::jsonb) FROM edit_deliveries WHERE clip_id=$1 AND state='completed' ORDER BY completed_at DESC,id DESC LIMIT 1),false)`, id).Scan(&ambiguous)
	return ambiguous, err
}
func prepareStyle(ctx context.Context, tx *sql.Tx, id string, payload map[string]any) error {
	ambiguous, err := legacyTrimMapping(ctx, tx, id)
	if err != nil {
		return err
	}
	if ambiguous {
		return errors.New("Saved trim source mapping is unavailable; recut the original source before styling")
	}
	encoded, _ := json.Marshal(payload["style"])
	var style StyleInput
	if err := json.Unmarshal(encoded, &style); err != nil {
		return err
	}
	var raw, transcript, state []byte
	var start, end, duration float64
	var source, aspect, preset string
	var captions, branded, badge bool
	err = tx.QueryRowContext(ctx, `SELECT c.segments,c.start_time,c.end_time,c.duration,c.aspect_ratio,c.has_subtitles,coalesce(j.source_storage_key,''),j.subtitle_style,j.include_brand,j.transcript_segments,c.transition_state,coalesce(c.contains_platform_badge,true) FROM clips c JOIN jobs j ON j.id=c.job_id WHERE c.id=$1`, id).Scan(&raw, &start, &end, &duration, &aspect, &captions, &source, &preset, &branded, &transcript, &state, &badge)
	if err != nil {
		return err
	}
	segments, err := sourceSegments(raw, start, end, duration)
	if err != nil {
		return err
	}
	if source == "" {
		return errors.New("Original clip source is unavailable")
	}
	recipe := processing.RenderInput{SourceKey: source, AspectRatio: aspect, SubtitleStyle: preset, BurnSubtitles: captions, PreserveGeometry: false}
	if len(state) > 0 && string(state) != "null" {
		var saved processing.TransitionState
		if json.Unmarshal(state, &saved) == nil && saved.Recipe.SourceKey == source {
			recipe.Transcript = saved.Recipe.Transcript
			recipe.Brand = saved.Recipe.Brand
			recipe.HookText = saved.Recipe.HookText
			recipe.SubtitleStyle = saved.Recipe.SubtitleStyle
			recipe.SmartCrop = saved.Recipe.SmartCrop
		}
	}
	if branded && len(recipe.Brand) == 0 {
		return errors.New("The saved brand recipe is unavailable; recreate the source composition before styling")
	}
	if recipe.Brand == nil {
		recipe.Brand = map[string]any{"apply_brand": false, "hide_platform_badge": !badge}
	}
	for _, s := range segments {
		recipe.Segments = append(recipe.Segments, processing.Segment{Start: s.Start, End: s.End})
	}
	if len(recipe.Transcript.Words) == 0 && len(transcript) > 0 {
		var saved []struct {
			Start float64 `json:"s"`
			End   float64 `json:"e"`
			Text  string  `json:"text"`
		}
		if err = json.Unmarshal(transcript, &saved); err != nil {
			return err
		}
		for _, s := range saved {
			if s.Text != "" && finite(s.Start) && finite(s.End) && s.End > s.Start {
				recipe.Transcript.Words = append(recipe.Transcript.Words, processing.Word{Text: s.Text, Start: s.Start, End: s.End})
			}
		}
	}
	if style.AspectRatio != "" {
		recipe.AspectRatio = style.AspectRatio
		recipe.PreserveGeometry = false
	}
	if style.SubtitleStyle != "" {
		recipe.SubtitleStyle = style.SubtitleStyle
	}
	if style.BurnSubtitles != nil {
		recipe.BurnSubtitles = *style.BurnSubtitles
	} else if style.SubtitleStyle != "" {
		recipe.BurnSubtitles = style.SubtitleStyle != "none"
	}
	if style.SmartCrop != nil {
		recipe.SmartCrop = *style.SmartCrop
	}
	if recipe.BurnSubtitles && recipe.SubtitleStyle != "none" && len(recipe.Transcript.Words) == 0 {
		return errors.New("Saved transcript timing is required for subtitles")
	}
	payload["recipe"] = recipe
	payload["expected_duration"] = duration
	return nil
}
