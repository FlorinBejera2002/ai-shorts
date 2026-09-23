package worker

import (
	"context"
	"encoding/json"
	"errors"
	"sneepcut/backend-go/internal/processing"
	"strings"
)

func (r *Repository) Complete(ctx context.Context, j *Job, result processing.Result) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = owned(ctx, tx, j, true); err != nil {
		return err
	}
	compact := []map[string]any{}
	for _, s := range result.Transcript.Segments {
		if strings.TrimSpace(s.Text) != "" {
			compact = append(compact, map[string]any{"s": s.Start, "e": s.End, "text": strings.TrimSpace(s.Text)})
		}
		if len(compact) == 2000 {
			break
		}
	}
	transcript, err := json.Marshal(compact)
	if err != nil {
		return err
	}
	for _, c := range result.Clips {
		if c.StorageKey == "" {
			return errors.New("processed clip lacks durable storage")
		}
		segments := []map[string]any{}
		for i, s := range c.Segments {
			segments = append(segments, map[string]any{"start": s.Start, "end": s.End, "order": i})
		}
		raw, err := json.Marshal(segments)
		if err != nil {
			return err
		}
		hashtags, err := json.Marshal(c.Metadata["suggested_hashtags"])
		if err != nil {
			return err
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO clips(id,job_id,user_id,title,hook_text,viral_score,score_reason,start_time,end_time,duration,segments,file_path,file_storage_key,tiktok_file_storage_key,thumbnail_path,thumbnail_storage_key,file_size,resolution,aspect_ratio,has_subtitles,contains_platform_badge,transcript_text,caption_tiktok,caption_instagram,caption_youtube,suggested_hashtags) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,nullif($13,''),nullif($14,''),nullif($14,''),$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`, token(), j.ID, j.UserID, c.Title, c.HookText, int(c.Score), c.Metadata["score_reason"], c.Start, c.End, c.Duration, string(raw), c.StorageKey, c.TikTokStorageKey, c.ThumbnailKey, c.FileSize, c.Resolution, j.AspectRatio, c.HasSubtitles, c.ContainsPlatformBadge, result.Transcript.Text, c.Metadata["video_description_for_tiktok"], c.Metadata["video_description_for_instagram"], c.Metadata["video_title_for_youtube_short"], string(hashtags))
		if err != nil {
			return err
		}
		if state, ok := c.Metadata["transition_state"]; ok {
			encoded, err := json.Marshal(state)
			if err != nil {
				return err
			}
			if _, err = tx.ExecContext(ctx, `UPDATE clips SET transition_state=$3 WHERE job_id=$1 AND file_storage_key=$2`, j.ID, c.StorageKey, string(encoded)); err != nil {
				return err
			}
		}
	}
	_, err = tx.ExecContext(ctx, `UPDATE jobs SET source_storage_key=$2,transcript_segments=$3,status='completed',progress=100,progress_message='Complete',completed_at=now(),updated_at=now(),error_message=NULL WHERE id=$1`, j.ID, result.SourceKey, string(transcript))
	if err != nil {
		return err
	}
	if err = release(ctx, tx, j); err != nil {
		return err
	}
	return tx.Commit()
}
