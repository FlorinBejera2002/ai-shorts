// Package feedback stores what users tell Sneep Cut: problem reports and ideas
// from the Feedback page, and the rating shown after a clip job finishes.
// Administrators triage the rows through internal/admin.
package feedback

import (
	"context"
	"database/sql"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/julienschmidt/httprouter"
	"github.com/lib/pq"

	"sneepcut/backend-go/internal/httpx"
	"sneepcut/backend-go/internal/identity"
)

const (
	KindProblem = "problem"
	KindIdea    = "idea"
	KindClip    = "clip"

	MaxMessage = 4000
	MaxImages  = 3
	maxPayload = 32 << 10
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

// ImageStore keeps the screenshots attached to problem reports and ideas.
type ImageStore interface {
	StoreFeedbackImage(ctx context.Context, userID, filename, contentType string, body io.Reader) (string, error)
	RemoveFeedbackImage(ctx context.Context, userID, key string) error
}

type Handler struct {
	db     *sql.DB
	auth   Authenticator
	images ImageStore
}

func New(db *sql.DB, auth Authenticator, images ImageStore) *Handler {
	return &Handler{db: db, auth: auth, images: images}
}

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

// create accepts JSON, or multipart (a "payload" JSON part followed by up to
// MaxImages "image" parts) when a problem report or idea carries screenshots.
func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	userID := identity.Current(r).User.ID
	var input Input
	var images []string
	if isMultipart(r) {
		var ok bool
		if input, images, ok = h.readWithImages(w, r, userID); !ok {
			return
		}
	} else {
		if !httpx.Read(w, r, &input, maxPayload) {
			return
		}
		if message := input.Validate(); message != "" {
			httpx.Error(w, http.StatusBadRequest, message)
			return
		}
	}
	id, err := h.save(r.Context(), userID, truncate(r.UserAgent(), maxAgent), input, images)
	if errors.Is(err, errJobNotFound) {
		h.discardImages(r.Context(), userID, images)
		httpx.Error(w, http.StatusNotFound, "Job not found")
		return
	}
	if err != nil {
		h.discardImages(r.Context(), userID, images)
		h.fail(w, "save feedback", err)
		return
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"id": id})
}

var errJobNotFound = errors.New("job not found")

func (h *Handler) save(parent context.Context, userID, agent string, input Input, images []string) (int64, error) {
	ctx, cancel := context.WithTimeout(parent, 5*time.Second)
	defer cancel()
	var id int64
	if input.Kind == KindClip {
		var owned bool
		if err := h.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM jobs WHERE id=$1 AND user_id=$2)`, input.JobID, userID).Scan(&owned); err != nil {
			return 0, err
		}
		if !owned {
			return 0, errJobNotFound
		}
		err := h.db.QueryRowContext(ctx, `INSERT INTO user_feedback(user_id,kind,rating,message,job_id,page,user_agent)
			VALUES($1,'clip',$2,$3,$4,$5,$6)
			ON CONFLICT (user_id, job_id) WHERE kind='clip'
			DO UPDATE SET rating=EXCLUDED.rating,
				message=CASE WHEN EXCLUDED.message<>'' THEN EXCLUDED.message ELSE user_feedback.message END,
				status=CASE WHEN EXCLUDED.message<>'' THEN 'new' ELSE user_feedback.status END,
				updated_at=now()
			RETURNING id`, userID, input.Rating, input.Message, input.JobID, input.Page, agent).Scan(&id)
		return id, err
	}
	if images == nil {
		images = []string{}
	}
	err := h.db.QueryRowContext(ctx, `INSERT INTO user_feedback(user_id,kind,category,message,page,user_agent,image_keys)
		VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`, userID, input.Kind, input.Category, input.Message, input.Page, agent, pq.Array(images)).Scan(&id)
	return id, err
}

// Report is one of the signed-in user's own problem reports or ideas.
type Report struct {
	ID        int64     `json:"id"`
	Kind      string    `json:"kind"`
	Category  string    `json:"category"`
	Message   string    `json:"message"`
	Status    string    `json:"status"`
	Images    int       `json:"images"`
	CreatedAt time.Time `json:"createdAt"`
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	rows, err := h.db.QueryContext(ctx, `SELECT id,kind,category,message,status,cardinality(image_keys),created_at FROM user_feedback
		WHERE user_id=$1 AND kind<>'clip' ORDER BY created_at DESC, id DESC LIMIT 20`, identity.Current(r).User.ID)
	if err != nil {
		h.fail(w, "list feedback", err)
		return
	}
	defer rows.Close()
	items := []Report{}
	for rows.Next() {
		var item Report
		if err = rows.Scan(&item.ID, &item.Kind, &item.Category, &item.Message, &item.Status, &item.Images, &item.CreatedAt); err != nil {
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
