package admin

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/julienschmidt/httprouter"
	"github.com/lib/pq"

	"sneepcut/backend-go/internal/feedback"
	"sneepcut/backend-go/internal/httpx"
)

// User feedback stored by internal/feedback: problem reports, ideas and clip ratings.

var feedbackKinds = map[string]bool{feedback.KindProblem: true, feedback.KindIdea: true, feedback.KindClip: true}

// FeedbackImageSigner turns a stored screenshot key into a short-lived URL.
type FeedbackImageSigner interface {
	SignedURL(ctx context.Context, key string) (string, error)
}

// WithFeedbackImages lets the feedback list link the screenshots users attached.
func (h *Handler) WithFeedbackImages(signer FeedbackImageSigner) *Handler {
	h.feedbackImages = signer
	return h
}

func (h *Handler) registerFeedback(router *httprouter.Router) {
	router.Handler(http.MethodGet, "/api/admin/feedback", h.auth.RequireAdmin(h.listFeedback))
	router.Handler(http.MethodPatch, "/api/admin/feedback/:id", h.auth.RequireAdmin(h.updateFeedback))
}

type feedbackRow struct {
	ID        int64     `json:"id"`
	UserID    string    `json:"userId"`
	UserEmail string    `json:"userEmail"`
	UserName  *string   `json:"userName"`
	Kind      string    `json:"kind"`
	Category  string    `json:"category"`
	Rating    *int      `json:"rating"`
	Message   string    `json:"message"`
	JobID     *string   `json:"jobId"`
	Page      string    `json:"page"`
	UserAgent string    `json:"userAgent"`
	Images    []string  `json:"images"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type feedbackSummary struct {
	Open           int64 `json:"open"`
	LastWeek       int64 `json:"lastWeek"`
	RatingsMonth   int64 `json:"ratingsMonth"`
	GoodShareMonth int64 `json:"goodShareMonth"` // percent of last-30-day ratings that were 3
	BadShareMonth  int64 `json:"badShareMonth"`  // percent of last-30-day ratings that were 1
}

func (h *Handler) listFeedback(w http.ResponseWriter, r *http.Request) {
	values := r.URL.Query()
	query := strings.TrimSpace(values.Get("q"))
	if len(query) > 120 {
		httpx.Error(w, http.StatusBadRequest, "Search is too long")
		return
	}
	kind := values.Get("kind")
	if kind != "" && !feedbackKinds[kind] {
		httpx.Error(w, http.StatusBadRequest, "Invalid feedback kind")
		return
	}
	status := values.Get("status")
	if status == "" {
		status = "open"
	}
	if status != "open" && status != "all" && !feedback.Statuses[status] {
		httpx.Error(w, http.StatusBadRequest, "Invalid feedback status")
		return
	}
	page := boundedInt(values.Get("page"), 1, 1, 100000)
	pageSize := boundedInt(values.Get("pageSize"), 25, 1, 100)

	where := []string{"1=1"}
	args := make([]any, 0, 5)
	add := func(clause string, value any) {
		args = append(args, value)
		where = append(where, fmt.Sprintf(clause, len(args)))
	}
	if query != "" {
		add(`(f.message ILIKE '%%' || $%[1]d || '%%' ESCAPE '\' OR u.email ILIKE '%%' || $%[1]d || '%%' ESCAPE '\')`, escapeLike(query))
	}
	if kind != "" {
		add("f.kind = $%d", kind)
	}
	switch status {
	case "open":
		// A bare rating without a comment needs no triage.
		where = append(where, "f.status <> 'resolved' AND (f.kind <> 'clip' OR f.message <> '')")
	case "all":
	default:
		add("f.status = $%d", status)
	}
	filter := strings.Join(where, " AND ")
	args = append(args, pageSize, (page-1)*pageSize)

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	rows, err := h.db.QueryContext(ctx, fmt.Sprintf(`SELECT f.id,f.user_id,u.email,u.name,f.kind,f.category,f.rating,f.message,f.job_id,f.page,f.user_agent,f.image_keys,f.status,f.created_at,f.updated_at,count(*) OVER()
		FROM user_feedback f JOIN users u ON u.id=f.user_id WHERE %s
		ORDER BY f.created_at DESC, f.id DESC LIMIT $%d OFFSET $%d`, filter, len(args)-1, len(args)), args...)
	if err != nil {
		h.fail(w, "list feedback", err)
		return
	}
	defer rows.Close()
	items := []feedbackRow{}
	var total int64
	for rows.Next() {
		var item feedbackRow
		var keys []string
		if err = rows.Scan(&item.ID, &item.UserID, &item.UserEmail, &item.UserName, &item.Kind, &item.Category, &item.Rating, &item.Message, &item.JobID, &item.Page, &item.UserAgent, pq.Array(&keys), &item.Status, &item.CreatedAt, &item.UpdatedAt, &total); err != nil {
			break
		}
		item.Images = h.signFeedbackImages(ctx, keys)
		items = append(items, item)
	}
	if err == nil {
		err = rows.Err()
	}
	if err != nil {
		h.fail(w, "read feedback", err)
		return
	}
	var summary feedbackSummary
	var good, bad int64
	if err = h.db.QueryRowContext(ctx, `SELECT
		count(*) FILTER (WHERE status <> 'resolved' AND (kind <> 'clip' OR message <> '')),
		count(*) FILTER (WHERE created_at >= now()-interval '7 days'),
		count(*) FILTER (WHERE kind='clip' AND created_at >= now()-interval '30 days'),
		count(*) FILTER (WHERE kind='clip' AND rating=3 AND created_at >= now()-interval '30 days'),
		count(*) FILTER (WHERE kind='clip' AND rating=1 AND created_at >= now()-interval '30 days')
		FROM user_feedback`).Scan(&summary.Open, &summary.LastWeek, &summary.RatingsMonth, &good, &bad); err != nil {
		h.fail(w, "summarize feedback", err)
		return
	}
	if summary.RatingsMonth > 0 {
		summary.GoodShareMonth = good * 100 / summary.RatingsMonth
		summary.BadShareMonth = bad * 100 / summary.RatingsMonth
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"items": items, "total": total, "summary": summary})
}

func (h *Handler) updateFeedback(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(httprouter.ParamsFromContext(r.Context()).ByName("id"), 10, 64)
	if err != nil || id < 1 {
		httpx.Error(w, http.StatusNotFound, "Feedback not found")
		return
	}
	var request struct {
		Status string `json:"status"`
	}
	if !httpx.Read(w, r, &request, 1<<10) {
		return
	}
	if !feedback.Statuses[request.Status] {
		httpx.Error(w, http.StatusBadRequest, "Invalid feedback status")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	result, err := h.db.ExecContext(ctx, `UPDATE user_feedback SET status=$2, updated_at=now() WHERE id=$1`, id, request.Status)
	if err != nil {
		h.fail(w, "update feedback", err)
		return
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		httpx.Error(w, http.StatusNotFound, "Feedback not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// signFeedbackImages returns a URL per screenshot; one that cannot be signed is skipped.
func (h *Handler) signFeedbackImages(ctx context.Context, keys []string) []string {
	urls := make([]string, 0, len(keys))
	if h.feedbackImages == nil {
		return urls
	}
	for _, key := range keys {
		url, err := h.feedbackImages.SignedURL(ctx, key)
		if err != nil {
			slog.Warn("sign feedback image", "error", err)
			continue
		}
		urls = append(urls, url)
	}
	return urls
}
