package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"sneepcut/backend-go/internal/processing"
)

func (r *Repository) transitionRecipe(ctx context.Context, e *Edit) (processing.RenderInput, error) {
	var raw []byte
	err := r.db.QueryRowContext(ctx, `SELECT transition_state FROM clips WHERE id=$1 AND job_id=$2`, e.ClipID, e.JobID).Scan(&raw)
	if err != nil {
		return processing.RenderInput{}, err
	}
	var state processing.TransitionState
	if err = json.Unmarshal(raw, &state); err != nil {
		return processing.RenderInput{}, err
	}
	if len(state.Recipe.Segments) < 2 || state.Recipe.SourceKey != e.SourceKey {
		return processing.RenderInput{}, fmt.Errorf("transition recipe unavailable")
	}
	state.Recipe.NaturalTransitions = true
	previous := &processing.Clip{StorageKey: e.FileKey, TikTokStorageKey: e.TikTokKey, ThumbnailKey: e.ThumbnailKey, Transition: "cut"}
	var segmentJSON []byte
	err = r.db.QueryRowContext(ctx, `SELECT start_time,end_time,duration,coalesce(file_size,0),resolution,has_subtitles,coalesce(contains_platform_badge,false),segments FROM clips WHERE id=$1 AND job_id=$2`, e.ClipID, e.JobID).Scan(&previous.Start, &previous.End, &previous.Duration, &previous.FileSize, &previous.Resolution, &previous.HasSubtitles, &previous.ContainsPlatformBadge, &segmentJSON)
	if err != nil {
		return processing.RenderInput{}, err
	}
	if err = json.Unmarshal(segmentJSON, &previous.Segments); err != nil {
		return processing.RenderInput{}, err
	}
	state.Recipe.Reuse = previous
	state.Recipe.PreviousDecisions = state.Decisions
	return state.Recipe, nil
}

func (r *Repository) completeTransitions(ctx context.Context, e *Edit, c processing.Clip) error {
	state, err := json.Marshal(c.Metadata["transition_state"])
	if err != nil {
		return err
	}
	segments := make([]orderedSegment, len(c.Segments))
	for i, s := range c.Segments {
		segments[i] = orderedSegment{Start: s.Start, End: s.End, Order: i}
	}
	raw, err := json.Marshal(segments)
	if err != nil {
		return err
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = editOwner(ctx, tx, e); err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `UPDATE clips SET file_path=$2,file_url=NULL,file_storage_key=$2,tiktok_file_storage_key=nullif($3,''),thumbnail_path=nullif($4,''),thumbnail_url=NULL,thumbnail_storage_key=nullif($4,''),start_time=$5,end_time=$6,duration=$7,file_size=$8,segments=$9,transition_state=$10,has_subtitles=$11,contains_platform_badge=$12,resolution=$13 WHERE id=$1 AND job_id=$14`, e.ClipID, c.StorageKey, c.TikTokStorageKey, c.ThumbnailKey, c.Start, c.End, c.Duration, c.FileSize, string(raw), string(state), c.HasSubtitles, c.ContainsPlatformBadge, c.Resolution, e.JobID)
	if err != nil {
		return err
	}
	if e.Kind == "style" {
		var payload struct {
			Recipe processing.RenderInput `json:"recipe"`
		}
		if err = json.Unmarshal(e.Payload, &payload); err != nil {
			return err
		}
		if _, err = tx.ExecContext(ctx, `UPDATE clips SET aspect_ratio=$2 WHERE id=$1 AND job_id=$3`, e.ClipID, payload.Recipe.AspectRatio, e.JobID); err != nil {
			return err
		}
	}
	if _, err = tx.ExecContext(ctx, `UPDATE edit_deliveries SET payload=payload||jsonb_build_object('verified_output',jsonb_build_object('key',$3::text,'duration',$4::float8,'size',$5::bigint)) WHERE id=$1 AND execution_token=$2 AND state='running'`, e.ID, e.Token, c.StorageKey, c.Duration, c.FileSize); err != nil {
		return err
	}
	if err = finishEdit(ctx, tx, e, "completed", ""); err != nil {
		return err
	}
	return tx.Commit()
}
