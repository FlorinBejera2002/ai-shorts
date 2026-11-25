package stories

import (
	"context"
	"database/sql"
	"strings"

	"sneepcut/backend-go/internal/story"
)

// aiCallLimit is the durable review/repair allowance for the whole project. Each
// requested clip gets its own allowance, so multi-clip stories are not starved.
func (e *execution) aiCallLimit() int {
	return e.repo.limits.MaxAICalls * story.ResolvedClipCount(e.Input.Options, e.Input.Assets)
}

// saveClip publishes every output of a library version to the Clips library.
// Output 0 keeps the story's existing single-clip identity.
func saveClip(ctx context.Context, tx *sql.Tx, id, user string, v story.Version, options story.Options) error {
	if !libraryVersion(v) {
		return ErrInvalid
	}
	for _, output := range v.ClipOutputs() {
		if output.Index > 0 && !output.Library() {
			return ErrInvalid
		}
		if err := saveClipOutput(ctx, tx, id, user, v.Number, output, options); err != nil {
			return err
		}
	}
	return nil
}

func saveClipOutput(ctx context.Context, tx *sql.Tx, id, user string, number int, output story.ClipOutput, options story.Options) error {
	// Editorial titles are metadata; an overlong model title must not discard a
	// reviewed render at the library's VARCHAR(255) boundary.
	title := []rune(strings.TrimSpace(output.Title))
	if len(title) > 255 {
		title = title[:255]
	}
	aspect := output.AspectRatio
	if aspect == "" {
		aspect = options.AspectRatio
	}
	_, err := tx.ExecContext(ctx, `INSERT INTO clips(id,job_id,user_id,title,viral_score,start_time,end_time,duration,segments,file_path,file_storage_key,thumbnail_path,thumbnail_storage_key,file_size,resolution,aspect_ratio,has_subtitles,transcript_text,story_project_id,story_version,story_output_index,studio_artifact_id) VALUES($1,$2,$3,$4,0,0,$5,$5,'[]',$6,$6,$7,$7,$8,$9,$10,$11,$12,$2,$13,$14,nullif($15,'')::uuid) ON CONFLICT(story_project_id,story_output_index) WHERE story_project_id IS NOT NULL DO UPDATE SET title=excluded.title,end_time=excluded.end_time,duration=excluded.duration,file_path=excluded.file_path,file_storage_key=excluded.file_storage_key,thumbnail_path=excluded.thumbnail_path,thumbnail_storage_key=excluded.thumbnail_storage_key,file_size=excluded.file_size,resolution=excluded.resolution,aspect_ratio=excluded.aspect_ratio,has_subtitles=excluded.has_subtitles,transcript_text=excluded.transcript_text,story_version=excluded.story_version,studio_artifact_id=excluded.studio_artifact_id`,
		newID(), id, user, string(title), output.DurationSeconds, output.Key, output.ThumbnailKey, output.Size, output.Resolution, aspect, output.Captions, output.TranscriptText, number, output.Index, output.StudioArtifactID)
	return err
}

// readClipIDs maps each version number to the Clips library row of every output.
func readClipIDs(ctx context.Context, q projectReader, id, user string) (map[int]map[int]string, error) {
	rows, err := q.QueryContext(ctx, `SELECT story_version,story_output_index,id::text FROM clips WHERE story_project_id=$1 AND user_id=$2`, id, user)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := map[int]map[int]string{}
	for rows.Next() {
		var number, index int
		var clipID string
		if err = rows.Scan(&number, &index, &clipID); err != nil {
			return nil, err
		}
		if ids[number] == nil {
			ids[number] = map[int]string{}
		}
		ids[number][index] = clipID
	}
	return ids, rows.Err()
}

// attachClipIDs gives every version its clip identities. Versions saved before
// multi-clip support expose their single output as clip 0.
func attachClipIDs(versions []story.Version, ids map[int]map[int]string) {
	for i := range versions {
		v := &versions[i]
		outputs := v.ClipOutputs()
		for j := range outputs {
			outputs[j].ClipID = ids[v.Number][outputs[j].Index]
		}
		if len(outputs) > 0 {
			v.Outputs = outputs
		}
		v.ClipID = ids[v.Number][0]
	}
}

// creditsPerStoryClip is charged once per requested clip, as the YouTube flow does.
const creditsPerStoryClip = 10

// clipOutputViews is the public shape of a version's clips: signed media URLs and
// the Clips library identity, without storage keys or transcript text.
func (h *Handler) clipOutputViews(ctx context.Context, outputs []story.ClipOutput, accepted bool) []map[string]any {
	views := make([]map[string]any, 0, len(outputs))
	for _, output := range outputs {
		view := map[string]any{
			"id": output.ID, "index": output.Index, "video_url": nil, "poster_url": nil,
			"duration_seconds": output.DurationSeconds, "aspect_ratio": output.AspectRatio,
			"clip_id": nil, "size": output.Size, "resolution": output.Resolution,
			"captions": output.Captions, "title": output.Title,
		}
		if output.ClipID != "" {
			view["clip_id"] = output.ClipID
		}
		if accepted && output.Key != "" {
			if url, err := h.media.SignedURL(ctx, output.Key); err == nil {
				view["video_url"] = url
			}
		}
		if accepted && output.ThumbnailKey != "" {
			if url, err := h.media.SignedURL(ctx, output.ThumbnailKey); err == nil {
				view["poster_url"] = url
			}
		}
		views = append(views, view)
	}
	return views
}
