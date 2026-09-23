package clips

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
)

// ClipRead plus the existing Next detail fields (social captions and hashtags).
const clipSelect = `(to_jsonb(c)-'transition_state') || jsonb_build_object('can_improve_transitions',c.transition_state IS NOT NULL AND jsonb_array_length(c.transition_state->'decisions')>0,'source_video_url',j.source_video_url,'source_storage_key',j.source_storage_key,'active_edit_tasks',j.active_edit_tasks,'processing_active',j.processing_active,'job_status',j.status,'edit_status',(SELECT state FROM edit_deliveries e WHERE e.clip_id=c.id ORDER BY e.created_at DESC,e.id DESC LIMIT 1),'edit_error',(SELECT last_error FROM edit_deliveries e WHERE e.clip_id=c.id ORDER BY e.created_at DESC,e.id DESC LIMIT 1))`
const clipJoin = ` FROM clips c JOIN jobs j ON j.id=c.job_id AND j.user_id=c.user_id `

func (h *Handler) resolve(ctx context.Context, raw []byte, camel bool) (map[string]any, error) {
	var record map[string]any
	if err := json.Unmarshal(raw, &record); err != nil {
		return nil, err
	}
	for _, field := range []struct{ url, key, fallback string }{{"file_url", "file_storage_key", "file_path"}, {"thumbnail_url", "thumbnail_storage_key", "thumbnail_path"}, {"source_video_url", "source_storage_key", "source_video_url"}} {
		key, _ := record[field.key].(string)
		if key == "" {
			for _, name := range []string{field.url, field.fallback} {
				ref, _ := record[name].(string)
				if ref == "" {
					continue
				}
				candidate, err := h.media.KeyFromReference(ref)
				if err == nil && candidate != "" {
					key = candidate
					break
				}
			}
		}
		if key != "" {
			signed, err := h.media.SignedURL(ctx, key)
			if err != nil {
				return nil, err
			}
			record[field.url] = signed
		}
	}
	variants := []map[string]any{}
	if fileURL, _ := record["file_url"].(string); fileURL != "" {
		platforms := []string{"instagram", "facebook", "linkedin", "youtube"}
		if containsBadge, _ := record["contains_platform_badge"].(bool); !containsBadge {
			platforms = append(platforms, "tiktok")
		}
		variants = append(variants, map[string]any{
			"id": "primary", "name": "Universal Social", "url": fileURL,
			"resolution": record["resolution"], "aspectRatio": record["aspect_ratio"],
			"platforms": platforms, "status": "ready",
		})
	}
	if key, _ := record["tiktok_file_storage_key"].(string); key != "" {
		signed, err := h.media.SignedURL(ctx, key)
		if err != nil {
			return nil, err
		}
		record["tiktok_file_url"] = signed
		variants = append(variants, map[string]any{
			"id": "platform-clean", "name": "Platform clean", "url": signed,
			"resolution": record["resolution"], "aspectRatio": record["aspect_ratio"],
			"platforms": []string{"tiktok"}, "status": "ready",
		})
	}
	record["variants"] = variants
	if !camel {
		return record, nil
	}
	out := make(map[string]any, len(record))
	for key, val := range record {
		parts := strings.Split(key, "_")
		for i := 1; i < len(parts); i++ {
			parts[i] = strings.ToUpper(parts[i][:1]) + parts[i][1:]
		}
		out[strings.Join(parts, "")] = val
	}
	return out, nil
}
func (h *Handler) readOne(ctx context.Context, userID, id string) (map[string]any, error) {
	var raw []byte
	err := h.db.QueryRowContext(ctx, `SELECT `+clipSelect+clipJoin+`WHERE c.id=$1 AND c.user_id=$2`, id, userID).Scan(&raw)
	if err != nil {
		return nil, err
	}
	return h.resolve(ctx, raw, false)
}
func (h *Handler) readList(ctx context.Context, userID string, review bool) ([]map[string]any, error) {
	query := `SELECT ` + clipSelect + clipJoin + `WHERE c.user_id=$1 ORDER BY c.created_at DESC,c.id DESC LIMIT 200`
	if review {
		query = `SELECT ` + clipSelect + ` || jsonb_build_object('job',jsonb_build_object('sourceUrl',j.source_url,'sourceFilePath',j.source_file_path,'status',j.status))` + clipJoin + `WHERE c.user_id=$1 ORDER BY c.viral_score DESC,c.created_at DESC,c.id DESC LIMIT 80`
	}
	rows, err := h.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return h.readRows(ctx, rows, review)
}
func (h *Handler) readRows(ctx context.Context, rows *sql.Rows, camel bool) ([]map[string]any, error) {
	result := []map[string]any{}
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			return nil, err
		}
		item, err := h.resolve(ctx, raw, camel)
		if err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}
func librarySQL(userID string, q LibraryQuery) (string, string, []any) {
	args := []any{userID}
	where := `c.user_id=$1`
	if q.Search != "" {
		args = append(args, q.Search)
		n := len(args)
		where += fmt.Sprintf(` AND (strpos(lower(c.title),lower($%d))>0 OR strpos(lower(COALESCE(c.hook_text,'')),lower($%d))>0)`, n, n)
	}
	switch q.Score {
	case "high":
		where += ` AND c.viral_score>=8`
	case "promising":
		where += ` AND c.viral_score>=5 AND c.viral_score<8`
	case "low":
		where += ` AND c.viral_score<5`
	}
	if q.Aspect != "all" {
		args = append(args, q.Aspect)
		where += fmt.Sprintf(` AND c.aspect_ratio=$%d`, len(args))
	}
	if q.Subtitles == "yes" {
		where += ` AND c.has_subtitles=true`
	} else if q.Subtitles == "no" {
		where += ` AND c.has_subtitles=false`
	}
	order := `c.created_at DESC,c.id DESC`
	switch q.Sort {
	case "oldest":
		order = `c.created_at ASC,c.id ASC`
	case "score":
		order = `c.viral_score DESC,c.created_at DESC,c.id DESC`
	case "duration":
		order = `c.duration DESC,c.created_at DESC,c.id DESC`
	}
	return where, order, args
}
func (h *Handler) readLibrary(ctx context.Context, userID string, q LibraryQuery) (map[string]any, error) {
	tx, err := h.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	where, order, args := librarySQL(userID, q)
	var total int
	if err = tx.QueryRowContext(ctx, `SELECT count(*) FROM clips c WHERE `+where, args...).Scan(&total); err != nil {
		return nil, err
	}
	pages := max(1, (total+23)/24)
	page := min(q.Page, pages)
	args = append(args, (page-1)*24)
	rows, err := tx.QueryContext(ctx, `SELECT `+clipSelect+clipJoin+`WHERE `+where+` ORDER BY `+order+fmt.Sprintf(` LIMIT 24 OFFSET $%d`, len(args)), args...)
	if err != nil {
		return nil, err
	}
	result, err := h.readRows(ctx, rows, true)
	rows.Close()
	if err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return map[string]any{"clips": result, "total": total, "currentPage": page, "totalPages": pages}, nil
}

// Recent returns fresh signed URLs for dashboard cards using the clip reader.
func (h *Handler) Recent(ctx context.Context, userID string, limit int) ([]map[string]any, error) {
	limit = max(1, min(24, limit))
	rows, err := h.db.QueryContext(ctx, `SELECT `+clipSelect+clipJoin+`WHERE c.user_id=$1 ORDER BY c.created_at DESC,c.id DESC LIMIT $2`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return h.readRows(ctx, rows, true)
}
