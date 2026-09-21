package assistant

import (
	"context"
	"database/sql"
	_ "embed"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/julienschmidt/httprouter"
	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/gemini"
	"sneepcut/backend-go/internal/httpx"
	"sneepcut/backend-go/internal/identity"
)

//go:embed prompts/create.txt
var createPrompt string

//go:embed prompts/editor.txt
var editorPrompt string

type Handler struct {
	db        *sql.DB
	auth      *identity.Handler
	generator gemini.Generator
}

func New(db *sql.DB, auth *identity.Handler, generator gemini.Generator) *Handler {
	return &Handler{db, auth, generator}
}
func (h *Handler) Register(r *httprouter.Router) {
	r.Handler("POST", "/api/assistant/chat", h.auth.RequireMember(h.auth.Limit(h.chat, "assistant", 60, time.Hour)))
	r.Handler("GET", "/api/assistant/history", h.auth.Require(h.history))
	r.Handler("DELETE", "/api/assistant/history", h.auth.RequireMember(h.clear))
}

type Request struct {
	Context     string         `json:"context"`
	ClipID      *string        `json:"clip_id"`
	Message     string         `json:"message"`
	CreateState map[string]any `json:"create_state"`
	EditorState map[string]any `json:"editor_state"`
}
type Message struct {
	ID        string          `json:"id"`
	Role      string          `json:"role"`
	Content   string          `json:"content"`
	Actions   json.RawMessage `json:"actions"`
	CreatedAt time.Time       `json:"created_at"`
}

func validScope(context string, clip *string) bool {
	return (context == "create" && clip == nil) || (context == "editor" && clip != nil && data.ValidUUID(*clip))
}
func (h *Handler) scope(w http.ResponseWriter, r *http.Request) (string, *string, bool) {
	c := r.URL.Query().Get("context")
	var id *string
	if v := r.URL.Query().Get("clip_id"); v != "" {
		id = &v
	}
	if !validScope(c, id) {
		httpx.Error(w, 422, "Assistant context is invalid")
		return "", nil, false
	}
	if id != nil {
		var yes bool
		err := h.db.QueryRowContext(r.Context(), `SELECT EXISTS(SELECT 1 FROM clips WHERE id=$1 AND user_id=$2)`, *id, identity.Current(r).User.ID).Scan(&yes)
		if err != nil {
			httpx.Error(w, 500, "Assistant history could not be loaded")
			return "", nil, false
		}
		if !yes {
			httpx.Error(w, 404, "Clip not found")
			return "", nil, false
		}
	}
	return c, id, true
}
func (h *Handler) messages(ctx context.Context, user, c string, id *string, limit int) ([]Message, error) {
	rows, err := h.db.QueryContext(ctx, `SELECT id,role,content,actions,created_at FROM chat_messages WHERE user_id=$1 AND context=$2 AND clip_id IS NOT DISTINCT FROM $3::uuid ORDER BY created_at DESC,id DESC LIMIT $4`, user, c, id, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Message{}
	for rows.Next() {
		var m Message
		var actions []byte
		if err = rows.Scan(&m.ID, &m.Role, &m.Content, &actions, &m.CreatedAt); err != nil {
			return nil, err
		}
		m.Actions = json.RawMessage(actions)
		out = append(out, m)
	}
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return out, rows.Err()
}
func (h *Handler) history(w http.ResponseWriter, r *http.Request) {
	c, id, ok := h.scope(w, r)
	if !ok {
		return
	}
	messages, err := h.messages(r.Context(), identity.Current(r).User.ID, c, id, 50)
	if err != nil {
		httpx.Error(w, 500, "Assistant history could not be loaded")
		return
	}
	httpx.JSON(w, 200, map[string]any{"messages": messages})
}
func (h *Handler) clear(w http.ResponseWriter, r *http.Request) {
	c, id, ok := h.scope(w, r)
	if !ok {
		return
	}
	_, err := h.db.ExecContext(r.Context(), `DELETE FROM chat_messages WHERE user_id=$1 AND context=$2 AND clip_id IS NOT DISTINCT FROM $3::uuid`, identity.Current(r).User.ID, c, id)
	if err != nil {
		httpx.Error(w, 500, "Assistant history could not be cleared")
		return
	}
	w.WriteHeader(204)
}
func (h *Handler) chat(w http.ResponseWriter, r *http.Request) {
	var in Request
	if !httpx.Read(w, r, &in, 64*1024) {
		return
	}
	if in.Context == "create" {
		in.ClipID = nil
	}
	if !validScope(in.Context, in.ClipID) || utf8.RuneCountInString(in.Message) < 1 || utf8.RuneCountInString(in.Message) > 2000 {
		httpx.Error(w, 422, "Assistant request is invalid")
		return
	}
	var valid bool
	in.CreateState, valid = normalizeCreateState(in.CreateState)
	if !valid {
		httpx.Error(w, 422, "Create page state is invalid")
		return
	}
	in.EditorState, valid = normalizeEditorState(in.EditorState)
	if !valid {
		httpx.Error(w, 422, "Editor page state is invalid")
		return
	}
	user := identity.Current(r).User.ID
	duration := 0.0
	transcript := ""
	if in.EditorState != nil {
		if d, ok := number(in.EditorState["video_duration"]); ok && d >= 0 {
			duration = d
		} else if _, set := in.EditorState["video_duration"]; set {
			httpx.Error(w, 422, "Video duration is invalid")
			return
		}
	}
	if in.ClipID != nil {
		var raw []byte
		var text sql.NullString
		err := h.db.QueryRowContext(r.Context(), `SELECT j.transcript_segments,c.transcript_text FROM clips c JOIN jobs j ON j.id=c.job_id AND j.user_id=c.user_id WHERE c.id=$1 AND c.user_id=$2`, *in.ClipID, user).Scan(&raw, &text)
		if errors.Is(err, sql.ErrNoRows) {
			httpx.Error(w, 404, "Clip not found")
			return
		}
		if err != nil {
			httpx.Error(w, 500, "Clip context could not be loaded")
			return
		}
		transcript = string(raw)
		if len(raw) == 0 || string(raw) == "null" || string(raw) == "[]" {
			fallback, _ := json.Marshal([]any{map[string]any{"s": nil, "e": nil, "text": clipped(text.String, 20000)}})
			transcript = string(fallback)
		}
	}
	history, err := h.messages(r.Context(), user, in.Context, in.ClipID, 20)
	if err != nil {
		httpx.Error(w, 500, "Assistant history could not be loaded")
		return
	}
	prompt := createPrompt
	state := in.CreateState
	if in.Context == "editor" {
		prompt = editorPrompt
		state = in.EditorState
	}
	if state != nil {
		raw, _ := json.Marshal(state)
		prompt += "\n\nCURRENT_STATE:\n" + string(raw)
	}
	if transcript != "" {
		prompt += "\n\nTRANSCRIPT_CHUNKS:\n" + clipped(transcript, 60000)
	}
	if len(history) > 0 {
		prompt += "\n\nCONVERSATION_SO_FAR:\n"
		for _, m := range history {
			prompt += strings.ToUpper(m.Role) + ": " + m.Content + "\n"
		}
	}
	prompt += "\n\nUSER: " + in.Message
	raw, err := h.generator.Generate(r.Context(), prompt)
	if errors.Is(err, gemini.ErrNotConfigured) {
		httpx.Error(w, 503, err.Error())
		return
	}
	if err != nil {
		httpx.Error(w, 502, "Assistant is temporarily unavailable")
		return
	}
	reply := strings.TrimSpace(raw)
	if reply == "" {
		reply = "…"
	}
	actions := []map[string]any{}
	if parsed, err := gemini.ExtractJSON(raw); err == nil {
		if v, ok := parsed["reply"].(string); ok && strings.TrimSpace(v) != "" {
			reply = strings.TrimSpace(v)
		}
		if list, ok := parsed["actions"].([]any); ok {
			actions = Actions(in.Context, list, duration)
		}
	}
	reply = clipped(reply, 20000)
	if err = h.persist(r.Context(), user, in, reply, actions); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpx.Error(w, 409, "Account or clip is no longer available")
		} else {
			httpx.Error(w, 500, "Assistant conversation could not be saved")
		}
		return
	}
	httpx.JSON(w, 200, map[string]any{"reply": reply, "actions": actions})
}
func (h *Handler) persist(ctx context.Context, user string, in Request, reply string, actions []map[string]any) error {
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var id string
	if err = tx.QueryRowContext(ctx, `SELECT id FROM users WHERE id=$1 AND access_role='member' AND NOT email_activation_required FOR UPDATE`, user).Scan(&id); err != nil {
		return err
	}
	// A fresh statement after the user lock observes a deletion marker committed
	// while this request was waiting, rather than the pre-lock statement snapshot.
	var deleting bool
	if err = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=$1)`, user).Scan(&deleting); err != nil {
		return err
	}
	if deleting {
		return sql.ErrNoRows
	}
	if in.ClipID != nil {
		if err = tx.QueryRowContext(ctx, `SELECT id FROM clips WHERE id=$1 AND user_id=$2 FOR KEY SHARE`, *in.ClipID, user).Scan(&id); err != nil {
			return err
		}
	}
	encoded, _ := json.Marshal(actions)
	for i, content := range []string{in.Message, reply} {
		id, err = data.NewUUID()
		if err != nil {
			return err
		}
		role := "user"
		var a any
		if i == 1 {
			role = "assistant"
			if len(actions) > 0 {
				a = string(encoded)
			}
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO chat_messages(id,user_id,clip_id,context,role,content,actions,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,clock_timestamp())`, id, user, in.ClipID, in.Context, role, content, a)
		if err != nil {
			return err
		}
	}
	return tx.Commit()
}
