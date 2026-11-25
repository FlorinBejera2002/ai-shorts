package admin

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/julienschmidt/httprouter"

	"sneepcut/backend-go/internal/httpx"
)

// Platform errors recorded by internal/errorlog (API, worker, web app, admin).

var errorSources = map[string]bool{"api": true, "worker": true, "web": true, "admin": true}

func (h *Handler) registerErrors(router *httprouter.Router) {
	router.Handler(http.MethodGet, "/api/admin/errors", h.auth.RequireAdmin(h.listErrors))
	router.Handler(http.MethodGet, "/api/admin/errors/:id", h.auth.RequireAdmin(h.errorDetail))
	router.Handler(http.MethodPatch, "/api/admin/errors/:id", h.auth.RequireAdmin(h.updateError))
}

type errorGroup struct {
	ID          int64      `json:"id"`
	Source      string     `json:"source"`
	Kind        string     `json:"kind"`
	Message     string     `json:"message"`
	Route       string     `json:"route"`
	Occurrences int64      `json:"occurrences"`
	LastDay     int64      `json:"lastDay"`
	FirstSeenAt time.Time  `json:"firstSeenAt"`
	LastSeenAt  time.Time  `json:"lastSeenAt"`
	ResolvedAt  *time.Time `json:"resolvedAt"`
}

type errorSummary struct {
	Open          int64            `json:"open"`
	LastDay       int64            `json:"lastDay"`
	NewLastDay    int64            `json:"newLastDay"`
	SourceLastDay map[string]int64 `json:"sourceLastDay"`
}

type errorEvent struct {
	ID          int64             `json:"id"`
	OccurredAt  time.Time         `json:"occurredAt"`
	Occurrences int               `json:"occurrences"`
	Detail      string            `json:"detail"`
	Context     map[string]string `json:"context"`
}

const errorGroupColumns = `g.id, g.source, g.kind, g.message, g.route, g.occurrences,
	COALESCE((SELECT sum(e.occurrences) FROM platform_error_events e WHERE e.group_id=g.id AND e.occurred_at >= now()-interval '24 hours'), 0),
	g.first_seen_at, g.last_seen_at, g.resolved_at`

func scanErrorGroup(row interface{ Scan(...any) error }) (errorGroup, error) {
	var g errorGroup
	err := row.Scan(&g.ID, &g.Source, &g.Kind, &g.Message, &g.Route, &g.Occurrences, &g.LastDay, &g.FirstSeenAt, &g.LastSeenAt, &g.ResolvedAt)
	return g, err
}

func (h *Handler) listErrors(w http.ResponseWriter, r *http.Request) {
	values := r.URL.Query()
	query := strings.TrimSpace(values.Get("q"))
	if len(query) > 120 {
		httpx.Error(w, http.StatusBadRequest, "Search is too long")
		return
	}
	source := values.Get("source")
	if source != "" && !errorSources[source] {
		httpx.Error(w, http.StatusBadRequest, "Invalid error source")
		return
	}
	state := values.Get("state")
	if state == "" {
		state = "open"
	}
	if state != "open" && state != "resolved" && state != "all" {
		httpx.Error(w, http.StatusBadRequest, "Invalid error state")
		return
	}
	page := boundedInt(values.Get("page"), 1, 1, 100000)
	pageSize := boundedInt(values.Get("pageSize"), 25, 1, 100)

	where := []string{"1=1"}
	args := make([]any, 0, 4)
	add := func(clause string, value any) {
		args = append(args, value)
		where = append(where, fmt.Sprintf(clause, len(args)))
	}
	if query != "" {
		add(`(g.message ILIKE '%%' || $%[1]d || '%%' ESCAPE '\' OR g.route ILIKE '%%' || $%[1]d || '%%' ESCAPE '\')`, escapeLike(query))
	}
	if source != "" {
		add("g.source = $%d", source)
	}
	switch state {
	case "open":
		where = append(where, "g.resolved_at IS NULL")
	case "resolved":
		where = append(where, "g.resolved_at IS NOT NULL")
	}
	filter := strings.Join(where, " AND ")

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	var total int64
	if err := h.db.QueryRowContext(ctx, "SELECT count(*) FROM platform_error_groups g WHERE "+filter, args...).Scan(&total); err != nil {
		h.fail(w, "count platform errors", err)
		return
	}
	listArgs := append(args, pageSize, (page-1)*pageSize)
	rows, err := h.db.QueryContext(ctx, fmt.Sprintf("SELECT %s FROM platform_error_groups g WHERE %s ORDER BY g.last_seen_at DESC, g.id DESC LIMIT $%d OFFSET $%d", errorGroupColumns, filter, len(args)+1, len(args)+2), listArgs...)
	if err != nil {
		h.fail(w, "list platform errors", err)
		return
	}
	defer rows.Close()
	items := []errorGroup{}
	for rows.Next() {
		group, err := scanErrorGroup(rows)
		if err != nil {
			h.fail(w, "read platform errors", err)
			return
		}
		items = append(items, group)
	}
	if err := rows.Err(); err != nil {
		h.fail(w, "read platform errors", err)
		return
	}
	summary, err := h.errorSummary(ctx)
	if err != nil {
		h.fail(w, "summarize platform errors", err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"items": items, "total": total, "summary": summary})
}

func (h *Handler) errorSummary(ctx context.Context) (errorSummary, error) {
	summary := errorSummary{SourceLastDay: map[string]int64{"api": 0, "worker": 0, "web": 0, "admin": 0}}
	err := h.db.QueryRowContext(ctx, `SELECT
		count(*) FILTER (WHERE resolved_at IS NULL),
		count(*) FILTER (WHERE first_seen_at >= now()-interval '24 hours')
		FROM platform_error_groups`).Scan(&summary.Open, &summary.NewLastDay)
	if err != nil {
		return summary, err
	}
	rows, err := h.db.QueryContext(ctx, `SELECT g.source, COALESCE(sum(e.occurrences), 0)
		FROM platform_error_events e JOIN platform_error_groups g ON g.id=e.group_id
		WHERE e.occurred_at >= now()-interval '24 hours' GROUP BY g.source`)
	if err != nil {
		return summary, err
	}
	defer rows.Close()
	for rows.Next() {
		var source string
		var count int64
		if err := rows.Scan(&source, &count); err != nil {
			return summary, err
		}
		summary.SourceLastDay[source] = count
		summary.LastDay += count
	}
	return summary, rows.Err()
}

func errorID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(httprouter.ParamsFromContext(r.Context()).ByName("id"), 10, 64)
	if err != nil || id < 1 {
		httpx.Error(w, http.StatusNotFound, "Error group not found")
		return 0, false
	}
	return id, true
}

func (h *Handler) errorDetail(w http.ResponseWriter, r *http.Request) {
	id, ok := errorID(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	group, err := scanErrorGroup(h.db.QueryRowContext(ctx, "SELECT "+errorGroupColumns+" FROM platform_error_groups g WHERE g.id=$1", id))
	if errors.Is(err, sql.ErrNoRows) {
		httpx.Error(w, http.StatusNotFound, "Error group not found")
		return
	}
	if err != nil {
		h.fail(w, "load platform error", err)
		return
	}
	rows, err := h.db.QueryContext(ctx, `SELECT id, occurred_at, occurrences, detail, context FROM platform_error_events WHERE group_id=$1 ORDER BY occurred_at DESC, id DESC LIMIT 20`, id)
	if err != nil {
		h.fail(w, "load platform error events", err)
		return
	}
	defer rows.Close()
	events := []errorEvent{}
	for rows.Next() {
		var event errorEvent
		var raw []byte
		if err := rows.Scan(&event.ID, &event.OccurredAt, &event.Occurrences, &event.Detail, &raw); err != nil {
			h.fail(w, "read platform error events", err)
			return
		}
		event.Context = map[string]string{}
		_ = json.Unmarshal(raw, &event.Context)
		events = append(events, event)
	}
	if err := rows.Err(); err != nil {
		h.fail(w, "read platform error events", err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"group": group, "events": events})
}

func (h *Handler) updateError(w http.ResponseWriter, r *http.Request) {
	id, ok := errorID(w, r)
	if !ok {
		return
	}
	var request struct {
		Resolved *bool `json:"resolved"`
	}
	if !httpx.Read(w, r, &request, 1<<10) {
		return
	}
	if request.Resolved == nil {
		httpx.Error(w, http.StatusBadRequest, "resolved is required")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	result, err := h.db.ExecContext(ctx, `UPDATE platform_error_groups SET resolved_at=CASE WHEN $2::boolean THEN now() ELSE NULL END WHERE id=$1`, id, *request.Resolved)
	if err != nil {
		h.fail(w, "update platform error", err)
		return
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		httpx.Error(w, http.StatusNotFound, "Error group not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func escapeLike(value string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(value)
}
