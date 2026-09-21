package dashboard

import (
	"context"
	"database/sql"
	"github.com/julienschmidt/httprouter"
	"log/slog"
	"math"
	"net/http"
	"sneepcut/backend-go/internal/httpx"
	"sneepcut/backend-go/internal/identity"
	"time"
)

type ClipReader interface {
	Recent(context.Context, string, int) ([]map[string]any, error)
}
type Handler struct {
	db    *sql.DB
	auth  *identity.Handler
	clips ClipReader
	now   func() time.Time
}

func New(db *sql.DB, auth *identity.Handler, clips ClipReader) *Handler {
	return &Handler{db, auth, clips, time.Now}
}
func (h *Handler) Register(r *httprouter.Router) {
	r.Handler("GET", "/api/dashboard", h.auth.Require(h.dashboard))
	r.Handler("GET", "/api/dashboard/analytics", h.auth.Require(h.analytics))
}

type ActivityDay struct {
	Date     string `json:"date"`
	Clips    int    `json:"clips"`
	Projects int    `json:"projects"`
}

func Status(s string) string {
	switch s {
	case "completed", "failed", "cancelled":
		return s
	case "pending", "downloading", "transcribing", "analyzing", "clipping", "rendering", "detecting", "generating", "processing":
		return "active"
	}
	return "other"
}
func (h *Handler) dashboard(w http.ResponseWriter, r *http.Request) {
	user := identity.Current(r).User
	ctx := r.Context()
	now := h.now().UTC()
	end := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, time.UTC)
	start := end.AddDate(0, 0, -90)
	activity := make([]ActivityDay, 90)
	for i := range activity {
		activity[i].Date = start.AddDate(0, 0, i).Format("2006-01-02")
	}
	rows, err := h.db.QueryContext(ctx, `SELECT day::text,COUNT(*) FILTER(WHERE kind='clip'),COUNT(*) FILTER(WHERE kind='project') FROM (SELECT (created_at AT TIME ZONE 'UTC')::date AS day,'clip' AS kind FROM clips WHERE user_id=$1 AND created_at>=$2 AND created_at<$3 UNION ALL SELECT (created_at AT TIME ZONE 'UTC')::date AS day,'project' AS kind FROM jobs WHERE user_id=$1 AND created_at>=$2 AND created_at<$3) activity GROUP BY day ORDER BY day`, user.ID, start, end)
	if err != nil {
		h.fail(w, err)
		return
	}
	for rows.Next() {
		var day ActivityDay
		if err = rows.Scan(&day.Date, &day.Clips, &day.Projects); err != nil {
			break
		}
		parsed, e := time.Parse("2006-01-02", day.Date)
		if e != nil {
			err = e
			break
		}
		i := int(parsed.Sub(start).Hours() / 24)
		if i >= 0 && i < 90 {
			activity[i] = day
		}
	}
	if err == nil {
		err = rows.Err()
	}
	rows.Close()
	if err != nil {
		h.fail(w, err)
		return
	}
	statuses := map[string]int{"completed": 0, "active": 0, "failed": 0, "cancelled": 0, "other": 0}
	jobCount := 0
	rows, err = h.db.QueryContext(ctx, `SELECT status,count(*) FROM jobs WHERE user_id=$1 GROUP BY status`, user.ID)
	if err != nil {
		h.fail(w, err)
		return
	}
	for rows.Next() {
		var state string
		var n int
		if err = rows.Scan(&state, &n); err != nil {
			break
		}
		statuses[Status(state)] += n
		jobCount += n
	}
	if err == nil {
		err = rows.Err()
	}
	rows.Close()
	if err != nil {
		h.fail(w, err)
		return
	}
	var count int
	var duration float64
	if err = h.db.QueryRowContext(ctx, `SELECT count(*),COALESCE(sum(duration),0) FROM clips WHERE user_id=$1`, user.ID).Scan(&count, &duration); err != nil {
		h.fail(w, err)
		return
	}
	recent, err := h.clips.Recent(ctx, user.ID, 6)
	if err != nil {
		h.fail(w, err)
		return
	}
	httpx.JSON(w, 200, map[string]any{"metrics": map[string]any{"activity": activity, "statuses": statuses, "jobCount": jobCount, "clipCount": count, "durationMinutes": int(math.Round(duration / 60)), "credits": user.Credits, "plan": user.Plan}, "recentClips": recent})
}
func (h *Handler) fail(w http.ResponseWriter, err error) {
	slog.Error("dashboard query failed", "error", err)
	httpx.Error(w, 500, "Dashboard could not be loaded")
}
func (h *Handler) analytics(w http.ResponseWriter, r *http.Request) {
	user := identity.Current(r).User.ID
	jobs := []map[string]any{}
	clips := []map[string]any{}
	rows, err := h.db.QueryContext(r.Context(), `SELECT id,status,created_at FROM jobs WHERE user_id=$1 ORDER BY created_at DESC,id DESC`, user)
	if err != nil {
		h.fail(w, err)
		return
	}
	for rows.Next() {
		var id, status string
		var at time.Time
		if err = rows.Scan(&id, &status, &at); err != nil {
			break
		}
		jobs = append(jobs, map[string]any{"id": id, "status": status, "createdAt": at})
	}
	if err == nil {
		err = rows.Err()
	}
	rows.Close()
	if err != nil {
		h.fail(w, err)
		return
	}
	rows, err = h.db.QueryContext(r.Context(), `SELECT id,duration,viral_score,created_at FROM clips WHERE user_id=$1 ORDER BY created_at DESC,id DESC`, user)
	if err != nil {
		h.fail(w, err)
		return
	}
	for rows.Next() {
		var id string
		var duration float64
		var score sql.NullFloat64
		var at time.Time
		if err = rows.Scan(&id, &duration, &score, &at); err != nil {
			break
		}
		var viral any
		if score.Valid {
			viral = score.Float64
		}
		clips = append(clips, map[string]any{"id": id, "duration": duration, "viralScore": viral, "createdAt": at})
	}
	if err == nil {
		err = rows.Err()
	}
	rows.Close()
	if err != nil {
		h.fail(w, err)
		return
	}
	httpx.JSON(w, 200, map[string]any{"jobs": jobs, "clips": clips})
}
