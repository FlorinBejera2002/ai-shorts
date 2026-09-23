package workspaceagent

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/julienschmidt/httprouter"
	"sneepcut/backend-go/internal/aiprovider"
	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/httpx"
	"sneepcut/backend-go/internal/identity"
)

type Handler struct {
	db        *sql.DB
	auth      *identity.Handler
	generator aiprovider.Generator
	executor  Executor
	media     ResourceMedia
}

func New(db *sql.DB, auth *identity.Handler, generator aiprovider.Generator, executor Executor) *Handler {
	return &Handler{db: db, auth: auth, generator: generator, executor: executor}
}
func (h *Handler) Register(r *httprouter.Router) {
	r.Handler("GET", "/api/workspace-agent/preferences", h.auth.Require(h.preferences))
	r.Handler("POST", "/api/workspace-agent/preferences", h.auth.RequireMember(h.savePreferences))
	r.Handler("POST", "/api/workspace-agent/history/clear", h.auth.RequireMember(h.clearHistory))
	r.Handler("GET", "/api/workspace-agent/runs", h.auth.Require(h.history))
	r.Handler("GET", "/api/workspace-agent/runs/:id", h.auth.Require(h.read))
	r.Handler("POST", "/api/workspace-agent/runs", h.auth.RequireMember(h.auth.Limit(h.create, "workspace-agent", 60, time.Hour)))
	r.Handler("POST", "/api/workspace-agent/runs/:id/control", h.auth.RequireMember(h.control))
	r.Handler("GET", "/api/workspace-agent/suggestions", h.auth.Require(h.suggestions))
	r.Handler("POST", "/api/workspace-agent/suggestions/:id/dismiss", h.auth.RequireMember(h.dismiss))
	r.Handler("POST", "/api/workspace-agent/resources", h.auth.RequireMember(h.auth.Limit(h.attachResource, "agent-resources", 60, time.Hour)))
	r.Handler("POST", "/api/workspace-agent/suggestions/:id/revise", h.auth.RequireMember(h.auth.Limit(h.reviseSuggestion, "agent-proposals", 30, time.Hour)))
}
func failure(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, sql.ErrNoRows):
		httpx.Error(w, 404, "Operation not found")
	case errors.Is(err, ErrConflict):
		httpx.Error(w, 409, err.Error())
	default:
		httpx.Error(w, 503, "Workspace agent is temporarily unavailable")
	}
}
func pathID(r *http.Request) string { return httprouter.ParamsFromContext(r.Context()).ByName("id") }
func (h *Handler) read(w http.ResponseWriter, r *http.Request) {
	if !data.ValidUUID(pathID(r)) {
		httpx.Error(w, 422, "Invalid operation")
		return
	}
	run, err := h.get(r.Context(), identity.Current(r).User.ID, pathID(r))
	if err != nil {
		failure(w, err)
		return
	}
	httpx.JSON(w, 200, run)
}
func (h *Handler) history(w http.ResponseWriter, r *http.Request) {
	before := r.URL.Query().Get("before")
	stamp := time.Now().Add(time.Second)
	id := "ffffffff-ffff-ffff-ffff-ffffffffffff"
	if before != "" {
		parts := strings.Split(before, "|")
		if len(parts) != 2 || !data.ValidUUID(parts[1]) {
			httpx.Error(w, 422, "Invalid cursor")
			return
		}
		var err error
		stamp, err = time.Parse(time.RFC3339Nano, parts[0])
		if err != nil {
			httpx.Error(w, 422, "Invalid cursor")
			return
		}
		id = parts[1]
	}
	rows, err := h.db.QueryContext(r.Context(), `SELECT `+runColumns+` FROM workspace_agent_runs WHERE user_id=$1 AND history_cleared_at IS NULL AND (created_at,id)<($2,$3::uuid) ORDER BY created_at DESC,id DESC LIMIT 31`, identity.Current(r).User.ID, stamp, id)
	if err != nil {
		failure(w, err)
		return
	}
	defer rows.Close()
	runs := []Run{}
	for rows.Next() {
		run, e := scanRun(rows)
		if e != nil {
			failure(w, e)
			return
		}
		runs = append(runs, run)
	}
	if err = rows.Err(); err != nil {
		failure(w, err)
		return
	}
	more := len(runs) > 30
	if more {
		runs = runs[:30]
	}
	httpx.JSON(w, 200, map[string]any{"runs": runs, "has_more": more})
}

type createRequest struct {
	ResourceIDs  []string `json:"resource_ids,omitempty"`
	RequestID    string   `json:"request_id"`
	Message      string   `json:"message"`
	Context      Scope    `json:"context"`
	SuggestionID string   `json:"suggestion_id,omitempty"`
}

func validScope(s Scope) bool {
	if len(s.StudioSelection) > 20 || len(s.StudioSelection) > 0 && (strings.Split(s.Route, "?")[0] != "/dashboard/studio" || s.ProjectID == "") {
		return false
	}
	for _, id := range s.StudioSelection {
		if len(id) == 0 || len(id) > 200 || strings.ContainsAny(id, "\x00\r\n") {
			return false
		}
	}
	return strings.HasPrefix(s.Route, "/dashboard") && !strings.ContainsAny(s.Route, "\\\r\n") && len(s.Route) < 300 && (s.ProjectID == "" || data.ValidUUID(s.ProjectID)) && (s.ClipID == "" || data.ValidUUID(s.ClipID))
}
func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	var in createRequest
	if !httpx.Read(w, r, &in, 32*1024) {
		return
	}
	in.Message = strings.TrimSpace(in.Message)
	if !data.ValidUUID(in.RequestID) || !validScope(in.Context) || utf8.RuneCountInString(in.Message) > 4000 || (in.Message == "" && in.SuggestionID == "") || (in.SuggestionID != "" && !data.ValidUUID(in.SuggestionID)) {
		httpx.Error(w, 422, "Invalid agent request")
		return
	}
	principal := identity.Current(r)
	user := principal.User.ID
	if err := h.validateResources(r.Context(), user, in.ResourceIDs, in.Context.ProjectID); err != nil {
		httpx.Error(w, 422, "Invalid or unavailable resources")
		return
	}
	hash := digest(in)
	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		failure(w, err)
		return
	}
	defer tx.Rollback()
	// Serialize admissions by owner, bounding active work and double clicks across tabs.
	var owner string
	if err = tx.QueryRowContext(r.Context(), `SELECT id FROM users WHERE id=$1 FOR UPDATE`, user).Scan(&owner); err != nil {
		failure(w, err)
		return
	}
	var priorHash string
	err = tx.QueryRowContext(r.Context(), `SELECT request_hash FROM workspace_agent_runs WHERE id=$1 AND user_id=$2`, in.RequestID, user).Scan(&priorHash)
	if err == nil {
		if priorHash != hash {
			failure(w, ErrConflict)
			return
		}
		tx.Rollback()
		run, e := h.get(r.Context(), user, in.RequestID)
		if e != nil {
			failure(w, e)
			return
		}
		httpx.JSON(w, 200, run)
		return
	}
	if !errors.Is(err, sql.ErrNoRows) {
		failure(w, err)
		return
	}
	var active int
	if err = tx.QueryRowContext(r.Context(), `SELECT count(*) FROM workspace_agent_runs WHERE user_id=$1 AND status IN ('planning','running','cancel_requested')`, user).Scan(&active); err != nil {
		failure(w, err)
		return
	}
	if active >= 3 {
		httpx.Error(w, 429, "Wait for an active operation to finish or stop it first")
		return
	}
	var action any
	status := "planning"
	cost := 0
	continuePlan := false
	if in.SuggestionID != "" {
		var raw []byte
		var dismissed bool
		var runID sql.NullString
		err = tx.QueryRowContext(r.Context(), `SELECT content,dismissed,run_id FROM workspace_agent_suggestions WHERE id=$1 AND user_id=$2 FOR UPDATE`, in.SuggestionID, user).Scan(&raw, &dismissed, &runID)
		if err != nil {
			failure(w, err)
			return
		}
		if runID.Valid {
			tx.Rollback()
			run, e := h.get(r.Context(), user, runID.String)
			if e != nil {
				failure(w, e)
				return
			}
			httpx.JSON(w, 200, run)
			return
		}
		if dismissed {
			failure(w, ErrConflict)
			return
		}
		var s Suggestion
		if err = json.Unmarshal(raw, &s); err != nil {
			failure(w, err)
			return
		}
		in.Context = s.Context
		if err := h.validateResources(r.Context(), user, in.ResourceIDs, in.Context.ProjectID); err != nil {
			httpx.Error(w, 422, "Resources do not belong to the accepted proposal target")
			return
		}
		if in.Message == "" {
			in.Message = s.Title
		}
		action = encode(s.Action)
		continuePlan = s.Continue || s.Action.Name == "stories.create"
		if continuePlan {
			in.Message = s.Title + ". " + s.Description
		}
		cost = s.CostCredits
		status = "running"
		if cost > 0 {
			status = "waiting_for_confirmation"
		}
	}
	_, err = tx.ExecContext(r.Context(), `INSERT INTO workspace_agent_runs(id,user_id,session_id,request_hash,message,status,context,action,cost_credits) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, in.RequestID, user, principal.SessionID, hash, in.Message, status, encode(in.Context), action, cost)
	if err != nil {
		failure(w, err)
		return
	}
	if in.SuggestionID != "" {
		if _, err = tx.ExecContext(r.Context(), `UPDATE workspace_agent_suggestions SET run_id=$1 WHERE id=$2 AND user_id=$3`, in.RequestID, in.SuggestionID, user); err != nil {
			failure(w, err)
			return
		}
	}
	if _, err = tx.ExecContext(r.Context(), `UPDATE workspace_agent_runs SET resource_ids=$2,continue_plan=$3 WHERE id=$1`, in.RequestID, encode(in.ResourceIDs), continuePlan); err != nil {
		failure(w, err)
		return
	}
	if err = tx.Commit(); err != nil {
		failure(w, err)
		return
	}
	run, err := h.get(r.Context(), user, in.RequestID)
	if err != nil {
		failure(w, err)
		return
	}
	httpx.JSON(w, 202, run)
}
func (h *Handler) control(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Command     string   `json:"command"`
		Revision    int      `json:"revision"`
		ResourceIDs []string `json:"resource_ids,omitempty"`
	}
	if !httpx.Read(w, r, &in, 1024) {
		return
	}
	if !data.ValidUUID(pathID(r)) {
		httpx.Error(w, 422, "Invalid operation")
		return
	}
	run, err := h.get(r.Context(), identity.Current(r).User.ID, pathID(r))
	if err != nil {
		failure(w, err)
		return
	}
	if in.Revision != run.Revision {
		failure(w, ErrConflict)
		return
	}
	if in.Command == "undo" {
		h.undo(w, r, run)
		return
	}
	if in.Command == "resume" && run.Status == "waiting_for_resources" {
		// The composer sends its current attachment selection, including IDs
		// already bound to this run. Merge rather than rejecting those as duplicates.
		seen := make(map[string]bool, len(run.ResourceIDs)+len(in.ResourceIDs))
		for _, id := range run.ResourceIDs { seen[id] = true }
		for _, id := range in.ResourceIDs {
			if !seen[id] { run.ResourceIDs = append(run.ResourceIDs, id); seen[id] = true }
		}
		if err := h.resourcesReady(r.Context(), &run); err != nil {
			httpx.Error(w, 409, err.Error())
			return
		}
		run.Status = "planning"
		run.Action = nil
		run.MissingResources = nil
		if err := h.save(r.Context(), &run); err != nil {
			failure(w, err)
			return
		}
		httpx.JSON(w, 200, run)
		return
	}
	if err = transition(&run, in.Command); err != nil {
		failure(w, ErrConflict)
		return
	}
	if err = h.save(r.Context(), &run); err != nil {
		failure(w, err)
		return
	}
	httpx.JSON(w, 200, run)
}
