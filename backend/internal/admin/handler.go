// Package admin exposes the server-authorized API for the separate Sneep Cut
// operations console. Every route is protected by the identity admin guard.
package admin

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/julienschmidt/httprouter"

	"sneepcut/backend-go/internal/httpx"
	"sneepcut/backend-go/internal/identity"
)

var userIDPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

type Handler struct {
	db        *sql.DB
	auth      *identity.Handler
	aiRouting aiRoutingService
}

func New(db *sql.DB, auth *identity.Handler) *Handler { return &Handler{db: db, auth: auth} }

func (h *Handler) Register(router *httprouter.Router) {
	h.registerAIRouting(router)
	router.Handler(http.MethodGet, "/api/admin/overview", h.auth.RequireAdmin(h.overview))
	router.Handler(http.MethodGet, "/api/admin/users", h.auth.RequireAdmin(h.users))
	router.Handler(http.MethodPatch, "/api/admin/users/:id", h.auth.RequireRecentAdmin(h.updateUser))
	router.Handler(http.MethodGet, "/api/admin/audit", h.auth.RequireAdmin(h.audit))
}

type overviewResponse struct {
	UsersTotal         int64 `json:"usersTotal"`
	UsersActive        int64 `json:"usersActive"`
	UsersSuspended     int64 `json:"usersSuspended"`
	NewUsersSevenDays  int64 `json:"newUsersSevenDays"`
	JobsTotal          int64 `json:"jobsTotal"`
	JobsActive         int64 `json:"jobsActive"`
	JobsFailed         int64 `json:"jobsFailed"`
	ClipsTotal         int64 `json:"clipsTotal"`
	CreditsOutstanding int64 `json:"creditsOutstanding"`
}

func (h *Handler) overview(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 4*time.Second)
	defer cancel()
	var response overviewResponse
	err := h.db.QueryRowContext(ctx, `SELECT
		count(*),
		count(*) FILTER (WHERE account_status='active'),
		count(*) FILTER (WHERE account_status='suspended'),
		count(*) FILTER (WHERE created_at >= now()-interval '7 days'),
		coalesce(sum(credits),0)
		FROM users`).Scan(&response.UsersTotal, &response.UsersActive, &response.UsersSuspended, &response.NewUsersSevenDays, &response.CreditsOutstanding)
	if err == nil {
		err = h.db.QueryRowContext(ctx, `SELECT count(*),
			count(*) FILTER (WHERE status IN ('pending','downloading','transcribing','analyzing','clipping','rendering','detecting','generating','processing')),
			count(*) FILTER (WHERE status='failed') FROM jobs`).Scan(&response.JobsTotal, &response.JobsActive, &response.JobsFailed)
	}
	if err == nil {
		err = h.db.QueryRowContext(ctx, `SELECT count(*) FROM clips`).Scan(&response.ClipsTotal)
	}
	if err != nil {
		h.fail(w, "load admin overview", err)
		return
	}
	httpx.JSON(w, http.StatusOK, response)
}

type userRow struct {
	ID            string     `json:"id"`
	Email         string     `json:"email"`
	Name          *string    `json:"name"`
	Plan          string     `json:"plan"`
	Credits       int        `json:"credits"`
	AccessRole    string     `json:"accessRole"`
	AccountStatus string     `json:"accountStatus"`
	CreatedAt     time.Time  `json:"createdAt"`
	LastSeenAt    *time.Time `json:"lastSeenAt"`
	JobsCount     int        `json:"jobsCount"`
	ClipsCount    int        `json:"clipsCount"`
}

func (h *Handler) users(w http.ResponseWriter, r *http.Request) {
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if len(query) > 120 {
		httpx.Error(w, http.StatusBadRequest, "Search is too long")
		return
	}
	status := r.URL.Query().Get("status")
	if status != "" && status != "active" && status != "suspended" {
		httpx.Error(w, http.StatusBadRequest, "Invalid account status")
		return
	}
	role := r.URL.Query().Get("role")
	if role != "" && role != "member" && role != "viewer" && role != "admin" {
		httpx.Error(w, http.StatusBadRequest, "Invalid access role")
		return
	}
	page := boundedInt(r.URL.Query().Get("page"), 1, 1, 100000)
	pageSize := boundedInt(r.URL.Query().Get("pageSize"), 25, 1, 100)

	where := []string{"1=1"}
	args := make([]any, 0, 5)
	add := func(clause string, value any) {
		args = append(args, value)
		where = append(where, fmt.Sprintf(clause, len(args)))
	}
	if query != "" {
		add("(u.email ILIKE '%%' || $%[1]d || '%%' OR COALESCE(u.name,'') ILIKE '%%' || $%[1]d || '%%')", query)
	}
	if status != "" {
		add("u.account_status=$%d", status)
	}
	if role != "" {
		add("u.access_role=$%d", role)
	}
	args = append(args, pageSize, (page-1)*pageSize)
	limitAt, offsetAt := len(args)-1, len(args)
	sqlQuery := fmt.Sprintf(`SELECT u.id,u.email,u.name,u.plan,u.credits,u.access_role,u.account_status,u.created_at,
		(SELECT max(s.last_seen_at) FROM sessions s WHERE s.user_id=u.id),
		(SELECT count(*) FROM jobs j WHERE j.user_id=u.id),
		(SELECT count(*) FROM clips c WHERE c.user_id=u.id),count(*) OVER()
		FROM users u WHERE %s ORDER BY u.created_at DESC,u.id DESC LIMIT $%d OFFSET $%d`, strings.Join(where, " AND "), limitAt, offsetAt)
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	rows, err := h.db.QueryContext(ctx, sqlQuery, args...)
	if err != nil {
		h.fail(w, "list admin users", err)
		return
	}
	defer rows.Close()
	items := make([]userRow, 0, pageSize)
	var total int64
	for rows.Next() {
		var item userRow
		if err = rows.Scan(&item.ID, &item.Email, &item.Name, &item.Plan, &item.Credits, &item.AccessRole, &item.AccountStatus, &item.CreatedAt, &item.LastSeenAt, &item.JobsCount, &item.ClipsCount, &total); err != nil {
			break
		}
		items = append(items, item)
	}
	if err == nil {
		err = rows.Err()
	}
	if err != nil {
		h.fail(w, "scan admin users", err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"items": items, "total": total, "page": page, "pageSize": pageSize})
}

type updateUserInput struct {
	Action string `json:"action"`
	Role   string `json:"role,omitempty"`
	Status string `json:"status,omitempty"`
	Amount int    `json:"amount,omitempty"`
	Reason string `json:"reason"`
}

type userState struct {
	AccessRole    string `json:"accessRole"`
	AccountStatus string `json:"accountStatus"`
	Credits       int    `json:"credits"`
}

func (h *Handler) updateUser(w http.ResponseWriter, r *http.Request) {
	targetID := httprouter.ParamsFromContext(r.Context()).ByName("id")
	if !userIDPattern.MatchString(targetID) {
		httpx.Error(w, http.StatusBadRequest, "Invalid user ID")
		return
	}
	var input updateUserInput
	if !httpx.Read(w, r, &input, 4096) {
		return
	}
	input.Reason = strings.TrimSpace(input.Reason)
	if len(input.Reason) < 5 || len(input.Reason) > 500 {
		httpx.Error(w, http.StatusBadRequest, "A reason between 5 and 500 characters is required")
		return
	}
	actor := identity.Current(r).User
	if targetID == actor.ID && (input.Action == "set_status" || (input.Action == "set_role" && input.Role != "admin")) {
		httpx.Error(w, http.StatusConflict, "Administrators cannot remove their own console access")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		h.fail(w, "start admin mutation", err)
		return
	}
	defer tx.Rollback()
	var before userState
	if err = tx.QueryRowContext(ctx, `SELECT access_role,account_status,credits FROM users WHERE id=$1 FOR UPDATE`, targetID).Scan(&before.AccessRole, &before.AccountStatus, &before.Credits); errors.Is(err, sql.ErrNoRows) {
		httpx.Error(w, http.StatusNotFound, "User not found")
		return
	} else if err != nil {
		h.fail(w, "load admin target", err)
		return
	}
	after := before
	invalidateSessions := false
	switch input.Action {
	case "set_role":
		if input.Role != "member" && input.Role != "viewer" && input.Role != "admin" {
			httpx.Error(w, http.StatusBadRequest, "Invalid access role")
			return
		}
		after.AccessRole = input.Role
		invalidateSessions = before.AccessRole != after.AccessRole
	case "set_status":
		if input.Status != "active" && input.Status != "suspended" {
			httpx.Error(w, http.StatusBadRequest, "Invalid account status")
			return
		}
		after.AccountStatus = input.Status
		invalidateSessions = before.AccountStatus != after.AccountStatus
	case "adjust_credits":
		if input.Amount == 0 || input.Amount < -1_000_000 || input.Amount > 1_000_000 || before.Credits+input.Amount < 0 {
			httpx.Error(w, http.StatusBadRequest, "Credit adjustment is invalid")
			return
		}
		after.Credits = before.Credits + input.Amount
	default:
		httpx.Error(w, http.StatusBadRequest, "Unsupported admin action")
		return
	}
	if before == after {
		httpx.Error(w, http.StatusConflict, "The requested value is already set")
		return
	}
	if invalidateSessions {
		_, err = tx.ExecContext(ctx, `UPDATE users SET access_role=$2,account_status=$3,credits=$4,session_version=session_version+1,updated_at=now() WHERE id=$1`, targetID, after.AccessRole, after.AccountStatus, after.Credits)
		if err == nil {
			_, err = tx.ExecContext(ctx, `DELETE FROM sessions WHERE user_id=$1`, targetID)
		}
	} else {
		_, err = tx.ExecContext(ctx, `UPDATE users SET credits=$2,updated_at=now() WHERE id=$1`, targetID, after.Credits)
	}
	if err != nil {
		h.fail(w, "apply admin mutation", err)
		return
	}
	beforeJSON, _ := json.Marshal(before)
	afterJSON, _ := json.Marshal(after)
	_, err = tx.ExecContext(ctx, `INSERT INTO admin_audit_events(actor_user_id,target_user_id,action,reason,before_state,after_state) VALUES($1,$2,$3,$4,$5,$6)`, actor.ID, targetID, input.Action, input.Reason, beforeJSON, afterJSON)
	if err != nil {
		h.fail(w, "record admin audit", err)
		return
	}
	if err = tx.Commit(); err != nil {
		h.fail(w, "commit admin mutation", err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"userId": targetID, "state": after})
}

type auditRow struct {
	ID          int64           `json:"id"`
	ActorEmail  string          `json:"actorEmail"`
	TargetEmail *string         `json:"targetEmail"`
	Action      string          `json:"action"`
	Reason      string          `json:"reason"`
	Before      json.RawMessage `json:"before"`
	After       json.RawMessage `json:"after"`
	CreatedAt   time.Time       `json:"createdAt"`
}

func (h *Handler) audit(w http.ResponseWriter, r *http.Request) {
	limit := boundedInt(r.URL.Query().Get("limit"), 50, 1, 100)
	rows, err := h.db.QueryContext(r.Context(), `SELECT e.id,a.email,t.email,e.action,e.reason,e.before_state,e.after_state,e.created_at
		FROM admin_audit_events e JOIN users a ON a.id=e.actor_user_id LEFT JOIN users t ON t.id=e.target_user_id
		ORDER BY e.created_at DESC,e.id DESC LIMIT $1`, limit)
	if err != nil {
		h.fail(w, "list admin audit", err)
		return
	}
	defer rows.Close()
	items := make([]auditRow, 0, limit)
	for rows.Next() {
		var item auditRow
		if err = rows.Scan(&item.ID, &item.ActorEmail, &item.TargetEmail, &item.Action, &item.Reason, &item.Before, &item.After, &item.CreatedAt); err != nil {
			break
		}
		items = append(items, item)
	}
	if err == nil {
		err = rows.Err()
	}
	if err != nil {
		h.fail(w, "scan admin audit", err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"items": items})
}

func boundedInt(raw string, fallback, minValue, maxValue int) int {
	value, err := strconv.Atoi(raw)
	if err != nil || value < minValue || value > maxValue {
		return fallback
	}
	return value
}

func (h *Handler) fail(w http.ResponseWriter, operation string, err error) {
	slog.Error(operation, "error", err)
	httpx.Error(w, http.StatusInternalServerError, "The admin operation could not be completed")
}
