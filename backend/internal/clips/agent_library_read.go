package clips

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/url"
)

// AgentLibrary applies the manual library filters but never signs media or returns storage paths to the model.
func (h *Handler) AgentLibrary(ctx context.Context, user string, values url.Values) (map[string]any, error) {
	q := ParseLibraryQuery(values)
	where, order, args := librarySQL(user, q)
	tx, err := h.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var total int
	if err = tx.QueryRowContext(ctx, `SELECT count(*) FROM clips c WHERE `+where, args...).Scan(&total); err != nil {
		return nil, err
	}
	pages := max(1, (total+23)/24)
	page := min(q.Page, pages)
	args = append(args, (page-1)*24)
	rows, err := tx.QueryContext(ctx, `SELECT jsonb_build_object('id',c.id,'title',c.title,'job_id',c.job_id,'duration',c.duration,'aspect_ratio',c.aspect_ratio,'has_subtitles',c.has_subtitles,'viral_score',c.viral_score,'created_at',c.created_at) FROM clips c WHERE `+where+` ORDER BY `+order+fmt.Sprintf(` LIMIT 24 OFFSET $%d`, len(args)), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []json.RawMessage{}
	for rows.Next() {
		var item json.RawMessage
		if err = rows.Scan(&item); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}
	return map[string]any{"clips": items, "total": total, "current_page": page, "total_pages": pages}, nil
}
