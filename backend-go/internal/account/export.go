package account

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
)

// Each export projection is an allowlist. Passwords, sessions, provider tokens,
// worker fencing identities are never selected.
func projection(columns string) string {
	parts := strings.Split(columns, ",")
	for i, col := range parts {
		name := strings.Split(col, "_")
		for j := 1; j < len(name); j++ {
			name[j] = strings.ToUpper(name[j][:1]) + name[j][1:]
		}
		alias := strings.Join(name, "")
		if col == "avatar_url" {
			alias = "image"
		}
		parts[i] = col + ` AS "` + alias + `"`
	}
	return strings.Join(parts, ",")
}
func (h *Handler) exportData(ctx context.Context, userID string) (map[string]any, error) {
	tx, err := h.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var raw []byte
	err = tx.QueryRowContext(ctx, `SELECT row_to_json(row) FROM (SELECT `+projection("id,email,name,avatar_url,provider,email_verified,credits,plan,created_at,updated_at")+` FROM users WHERE id=$1) row`, userID).Scan(&raw)
	if err != nil {
		return nil, err
	}
	var data map[string]any
	if err = json.Unmarshal(raw, &data); err != nil {
		return nil, err
	}
	collections := []struct{ name, table, columns, order string }{
		{"jobs", "jobs", "id,source_type,source_url,source_video_url,status,progress,progress_message,num_clips_requested,aspect_ratio,language,subtitle_style,include_brand,user_instructions,transcript_segments,credits_charged,error_message,started_at,completed_at,created_at,updated_at", "created_at DESC,id DESC"},
		{"clips", "clips", "id,job_id,title,hook_text,viral_score,score_reason,start_time,end_time,duration,segments,file_url,thumbnail_url,file_size,resolution,aspect_ratio,has_subtitles,transcript_text,caption_tiktok,caption_instagram,caption_youtube,suggested_hashtags,published_to,created_at", "created_at DESC,id DESC"},
		{"scheduledPosts", "scheduled_posts", "id,clip_id,title,caption,notes,platforms,status,scheduled_at,created_at,updated_at", "scheduled_at ASC,id ASC"},
		{"assistantMessages", "chat_messages", "id,clip_id,context,role,content,actions,created_at", "created_at ASC,id ASC"},
	}
	for _, c := range collections {
		rows, err := tx.QueryContext(ctx, `SELECT row_to_json(row) FROM (SELECT `+projection(c.columns)+` FROM `+c.table+` WHERE user_id=$1 ORDER BY `+c.order+`) row`, userID)
		if err != nil {
			return nil, err
		}
		items := []json.RawMessage{}
		for rows.Next() {
			var raw json.RawMessage
			if err = rows.Scan(&raw); err != nil {
				rows.Close()
				return nil, err
			}
			items = append(items, raw)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return nil, err
		}
		data[c.name] = items
	}
	brand := projection("logo_path,logo_url,primary_color,secondary_color,font_family,subtitle_font,subtitle_color,subtitle_bg_color,subtitle_bg_opacity,subtitle_position,watermark_position,watermark_opacity,hide_platform_badge,created_at,updated_at")
	var brandJSON []byte
	err = tx.QueryRowContext(ctx, `SELECT row_to_json(row) FROM (SELECT `+brand+` FROM brand_kits WHERE user_id=$1) row`, userID).Scan(&brandJSON)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}
	if err == sql.ErrNoRows {
		data["brandKit"] = nil
	} else {
		data["brandKit"] = json.RawMessage(brandJSON)
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return data, nil
}
