package admin

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"time"

	"github.com/julienschmidt/httprouter"

	"sneepcut/backend-go/internal/httpx"
)

// userActivitySQL merges what each feature already records into one
// timeline. Rows carry a machine kind plus a short non-personal detail
// (source type, provider, plan); captions, messages and URLs never leave
// their tables.
const userActivitySQL = `WITH events(kind, detail, at) AS (
	SELECT 'account_created', '', created_at FROM users WHERE id=$1
	UNION ALL SELECT 'security_' || event_type, '', created_at FROM account_security_events WHERE user_id=$1
	UNION ALL SELECT kind, detail, created_at FROM user_activity_events WHERE user_id=$1
	UNION ALL SELECT 'job_created', source_type, created_at FROM jobs WHERE user_id=$1
	UNION ALL SELECT 'job_' || status, source_type, completed_at FROM jobs
		WHERE user_id=$1 AND status IN ('completed','failed') AND completed_at IS NOT NULL
	UNION ALL SELECT 'youtube_import_started', '', created_at FROM youtube_imports WHERE user_id=$1
	UNION ALL SELECT 'youtube_import_' || status, '', updated_at FROM youtube_imports
		WHERE user_id=$1 AND status IN ('ready','failed')
	UNION ALL SELECT 'post_created', provider, created_at FROM social_posts WHERE user_id=$1
	UNION ALL SELECT 'post_' || status, provider, updated_at FROM social_posts
		WHERE user_id=$1 AND status IN ('published','failed')
	UNION ALL SELECT 'feedback_' || kind, '', created_at FROM user_feedback WHERE user_id=$1
	UNION ALL SELECT 'admin_' || action, '', created_at FROM admin_audit_events WHERE target_user_id=$1
)
SELECT kind, detail, at, count(*) OVER() FROM events ORDER BY at DESC, kind LIMIT $2 OFFSET $3`

type activityItem struct {
	Kind   string    `json:"kind"`
	Detail string    `json:"detail"`
	At     time.Time `json:"at"`
}

type activityPage struct {
	Items        []activityItem `json:"items"`
	Total        int64          `json:"total"`
	Page         int            `json:"page"`
	PageSize     int            `json:"pageSize"`
	LastActiveAt *time.Time     `json:"lastActiveAt"`
}

func (h *Handler) registerActivity(router *httprouter.Router) {
	router.Handler(http.MethodGet, "/api/admin/users/:id/activity", h.auth.RequireAdmin(h.userActivity))
}

func (h *Handler) userActivity(w http.ResponseWriter, r *http.Request) {
	userID := httprouter.ParamsFromContext(r.Context()).ByName("id")
	if !userIDPattern.MatchString(userID) {
		httpx.Error(w, http.StatusBadRequest, "Invalid user ID")
		return
	}
	page := boundedInt(r.URL.Query().Get("page"), 1, 1, 10000)
	pageSize := boundedInt(r.URL.Query().Get("pageSize"), 20, 1, 50)
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	response := activityPage{Items: make([]activityItem, 0, pageSize), Page: page, PageSize: pageSize}
	err := h.db.QueryRowContext(ctx, `SELECT `+lastActiveSQL+` FROM users u WHERE u.id=$1`, userID).Scan(&response.LastActiveAt)
	if errors.Is(err, sql.ErrNoRows) {
		httpx.Error(w, http.StatusNotFound, "User not found")
		return
	}
	if err != nil {
		h.fail(w, "load user last activity", err)
		return
	}
	if err = h.scanActivity(ctx, userID, page, pageSize, &response); err != nil {
		h.fail(w, "list user activity", err)
		return
	}
	httpx.JSON(w, http.StatusOK, response)
}

func (h *Handler) scanActivity(ctx context.Context, userID string, page, pageSize int, response *activityPage) error {
	rows, err := h.db.QueryContext(ctx, userActivitySQL, userID, pageSize, (page-1)*pageSize)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var item activityItem
		if err = rows.Scan(&item.Kind, &item.Detail, &item.At, &response.Total); err != nil {
			return err
		}
		response.Items = append(response.Items, item)
	}
	return rows.Err()
}

// lastActiveSQL is the most recent moment a user used the app: the durable
// column, or a live session seen after it (GREATEST ignores NULLs).
const lastActiveSQL = `GREATEST(u.last_active_at,(SELECT max(s.last_seen_at) FROM sessions s WHERE s.user_id=u.id))`
