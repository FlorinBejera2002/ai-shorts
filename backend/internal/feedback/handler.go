// Package feedback stores what users tell Sneep Cut: problem reports and ideas
// from the Feedback page, and the rating shown after a clip job finishes.
// Administrators triage the rows through internal/admin.
package feedback

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/julienschmidt/httprouter"

	"sneepcut/backend-go/internal/httpx"
	"sneepcut/backend-go/internal/identity"
)

const (
	KindProblem = "problem"
	KindIdea    = "idea"
	KindClip    = "clip"

	MaxMessage = 4000
	maxPage    = 300
	maxAgent   = 200
)

// Categories a problem or idea can be filed under. Clip ratings have none.
var Categories = map[string]bool{"clips": true, "publishing": true, "billing": true, "account": true, "other": true}

// Statuses an administrator moves a report through.
var Statuses = map[string]bool{"new": true, "in_progress": true, "resolved": true}

var uuidPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

type Authenticator interface {
	Require(http.HandlerFunc) http.Handler
	Limit(http.HandlerFunc, string, int, time.Duration) http.HandlerFunc
}

type Handler struct {
	db   *sql.DB
	auth Authenticator
}

func New(db *sql.DB, auth Authenticator) *Handler { return &Handler{db: db, auth: auth} }

func (h *Handler) Register(router *httprouter.Router) {
	router.Handler(http.MethodPost, "/api/feedback", h.auth.Require(h.auth.Limit(h.create, "feedback", 20, time.Hour)))
	router.Handler(http.MethodGet, "/api/feedback", h.auth.Require(h.list))
}

// Input is the body of POST /api/feedback.
type Input struct {
	Kind     string `json:"kind"`
	Category string `json:"category,omitempty"`
	Rating   int    `json:"rating,omitempty"`
	Message  string `json:"message,omitempty"`
	JobID    string `json:"jobId,omitempty"`
	Page     string `json:"page,omitempty"`
}

// Validate normalizes the input and returns the message for a rejected one.
func (in *Input) Validate() string {
	in.Message = strings.TrimSpace(in.Message)
	if utf8.RuneCountInString(in.Message) > MaxMessage {
		return "Message is too long"
	}
	if parsed, err := url.Parse(in.Page); err == nil {
		// Only the path is kept, never a query string that may hold tokens.
		in.Page = truncate(parsed.Path, maxPage)
	} else {
		in.Page = ""
	}
	switch in.Kind {
	case KindProblem, KindIdea:
		if !Categories[in.Category] {
			return "Choose a category"
		}
		if in.Message == "" {
			return "Message is required"
		}
		in.Rating, in.JobID = 0, ""
	case KindClip:
		if in.Rating < 1 || in.Rating > 3 {
			return "Rating must be between 1 and 3"
		}
		if !uuidPattern.MatchString(in.JobID) {
			return "A job is required"
		}
		in.Category = ""
	default:
		return "Invalid feedback kind"
	}
	return ""
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	var input Input
	if !httpx.Read(w, r, &input, 32<<10) {
		return
	}
	if message := input.Validate(); message != "" {
		httpx.Error(w, http.StatusBadRequest, message)
		return
	}
	userID := identity.Current(r).User.ID
	agent := truncate(r.UserAgent(), maxAgent)
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	var id int64
	var err error
	if input.Kind == KindClip {
		var owned bool
		if err = h.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM jobs WHERE id=$1 AND user_id=$2)`, input.JobID, userID).Scan(&owned); err == nil && !owned {
			httpx.Error(w, http.StatusNotFound, "Job not found")
			return
		}
		if err == nil {
			err = h.db.QueryRowContext(ctx, `INSERT INTO user_feedback(user_id,kind,rating,message,job_id,page,user_agent)
				VALUES($1,'clip',$2,$3,$4,$5,$6)
				ON CONFLICT (user_id, job_id) WHERE kind='clip'
				DO UPDATE SET rating=EXCLUDED.rating,
					message=CASE WHEN EXCLUDED.message<>'' THEN EXCLUDED.message ELSE user_feedback.message END,
					status=CASE WHEN EXCLUDED.message<>'' THEN 'new' ELSE user_feedback.status END,
					updated_at=now()
				RETURNING id`, userID, input.Rating, input.Message, input.JobID, input.Page, agent).Scan(&id)
		}
	} else {
		err = h.db.QueryRowContext(ctx, `INSERT INTO user_feedback(user_id,kind,category,message,page,user_agent)
			VALUES($1,$2,$3,$4,$5,$6) RETURNING id`, userID, input.Kind, input.Category, input.Message, input.Page, agent).Scan(&id)
	}
	if err != nil {
		h.fail(w, "save feedback", err)
		return
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"id": id})
}

// Report is one of the signed-in user's own problem reports or ideas.
type Report struct {
	ID        int64     `json:"id"`
	Kind      string    `json:"kind"`
	Category  string    `json:"category"`
	Message   string    `json:"message"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"createdAt"`
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	rows, err := h.db.QueryContext(ctx, `SELECT id,kind,category,message,status,created_at FROM user_feedback
		WHERE user_id=$1 AND kind<>'clip' ORDER BY created_at DESC, id DESC LIMIT 20`, identity.Current(r).User.ID)
	if err != nil {
		h.fail(w, "list feedback", err)
		return
	}
	defer rows.Close()
	items := []Report{}
	for rows.Next() {
		var item Report
		if err = rows.Scan(&item.ID, &item.Kind, &item.Category, &item.Message, &item.Status, &item.CreatedAt); err != nil {
			break
		}
		items = append(items, item)
	}
	if err == nil {
		err = rows.Err()
	}
	if err != nil {
		h.fail(w, "read feedback", err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *Handler) fail(w http.ResponseWriter, operation string, err error) {
	if !errors.Is(err, context.Canceled) {
		slog.Error(operation, "error", err)
	}
	httpx.Error(w, http.StatusInternalServerError, "Feedback is unavailable right now")
}

func truncate(value string, limit int) string {
	if utf8.RuneCountInString(value) <= limit {
		return value
	}
	return string([]rune(value)[:limit])
}
