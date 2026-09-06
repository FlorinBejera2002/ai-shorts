package assistant

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/julienschmidt/httprouter"
	"golang.org/x/crypto/bcrypt"
	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/gemini"
	"sneepcut/backend-go/internal/identity"
	"sneepcut/backend-go/internal/testdb"
)

type generatorFunc func(context.Context, string) (string, error)

func (f generatorFunc) Generate(ctx context.Context, prompt string) (string, error) {
	return f(ctx, prompt)
}

type chatFixture struct {
	db                                              *sql.DB
	handler                                         *Handler
	router                                          *httprouter.Router
	user, clip, other, otherClip, token, otherToken string
}

func newChatFixture(t *testing.T) *chatFixture {
	t.Helper()
	db := testdb.Open(t)
	hash, e := bcrypt.GenerateFromPassword([]byte("assistant-test-password"), bcrypt.MinCost)
	if e != nil {
		t.Fatal(e)
	}
	tokens, e := identity.NewTokens(identity.TokenConfig{Secret: strings.Repeat("a", 32), Issuer: "test", Audience: "test", AccessLifetime: time.Minute, RefreshLifetime: time.Hour})
	if e != nil {
		t.Fatal(e)
	}
	authService := identity.NewService(identity.NewPostgres(db), tokens)
	seed := func() (string, string, string) {
		t.Helper()
		user, _ := data.NewUUID()
		job, _ := data.NewUUID()
		clip, _ := data.NewUUID()
		queries := []struct {
			query string
			args  []any
		}{
			{`INSERT INTO users(id,email,provider,password_hash,credits,plan) VALUES($1,$2,'credentials',$3,100,'free')`, []any{user, user + "@example.invalid", string(hash)}},
			{`INSERT INTO jobs(id,user_id,source_type,status,progress,num_clips_requested,aspect_ratio,subtitle_style,include_brand,credits_charged,transcript_segments) VALUES($1,$2,'upload','completed',100,5,'9:16','default',false,50,'[{"s":0,"e":10,"text":"Synthetic transcript context"}]')`, []any{job, user}},
			{`INSERT INTO clips(id,user_id,job_id,title,start_time,end_time,duration,file_path,viral_score,file_size,resolution,aspect_ratio,has_subtitles,transcript_text) VALUES($1,$2,$3,'Fixture',0,10,10,'clips/fixture/video.mp4',8,1024,'1080x1920','9:16',false,'Legacy clip context')`, []any{clip, user, job}},
		}
		for _, q := range queries {
			if _, e := db.Exec(q.query, q.args...); e != nil {
				t.Fatal(e)
			}
		}
		session, _, _, e := authService.Login(context.Background(), user+"@example.invalid", "assistant-test-password")
		if e != nil {
			t.Fatal(e)
		}
		return user, clip, session.AccessToken
	}
	f := &chatFixture{db: db}
	f.user, f.clip, f.token = seed()
	f.other, f.otherClip, f.otherToken = seed()
	auth := identity.NewHandler(authService, identity.HTTPConfig{}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	f.handler = New(db, auth, generatorFunc(func(context.Context, string) (string, error) {
		return `{"reply":"Updated the captions.","actions":[{"type":"update_settings","settings":{"subtitle_style":"bold","plan":"agency"}},{"type":"delete_account"}]}`, nil
	}))
	f.router = httprouter.New()
	f.handler.Register(f.router)
	return f
}
func (f *chatFixture) call(method, path, token, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	f.router.ServeHTTP(w, r)
	return w
}
func (f *chatFixture) count(t *testing.T, user string) int {
	t.Helper()
	var count int
	if e := f.db.QueryRow(`SELECT count(*) FROM chat_messages WHERE user_id=$1`, user).Scan(&count); e != nil {
		t.Fatal(e)
	}
	return count
}
func TestPostgresChatAuthenticationPersistenceOwnershipAndProviderFailure(t *testing.T) {
	f := newChatFixture(t)
	body := `{"context":"create","message":"Make the subtitles bold","create_state":{"clips":5,"subtitle_style":"clean"}}`
	w := f.call("POST", "/api/assistant/chat", "", body)
	if w.Code != 401 {
		t.Fatalf("anonymous chat %d", w.Code)
	}
	w = f.call("POST", "/api/assistant/chat", f.token, body)
	if w.Code != 200 || f.count(t, f.user) != 2 {
		t.Fatalf("chat %d %s", w.Code, w.Body.String())
	}
	var reply struct {
		Reply   string           `json:"reply"`
		Actions []map[string]any `json:"actions"`
	}
	if e := json.Unmarshal(w.Body.Bytes(), &reply); e != nil {
		t.Fatal(e)
	}
	if len(reply.Actions) != 1 || reply.Actions[0]["type"] != "update_settings" {
		t.Fatalf("unsafe actions %+v", reply.Actions)
	}
	messages, e := f.handler.messages(context.Background(), f.user, "create", nil, 50)
	if e != nil || len(messages) != 2 || messages[0].Role != "user" || messages[1].Role != "assistant" || messages[0].Actions != nil || !strings.Contains(string(messages[1].Actions), "subtitle_style") {
		t.Fatalf("history lost: %+v %v", messages, e)
	}
	w = f.call("GET", "/api/assistant/history?context=create", f.otherToken, "")
	if w.Code != 200 || strings.TrimSpace(w.Body.String()) != `{"messages":[]}` {
		t.Fatalf("foreign history %d %s", w.Code, w.Body.String())
	}
	for _, providerErr := range []error{gemini.ErrNotConfigured, errors.New("sensitive provider details")} {
		f.handler.generator = generatorFunc(func(context.Context, string) (string, error) { return "", providerErr })
		w = f.call("POST", "/api/assistant/chat", f.token, body)
		expected := 502
		if errors.Is(providerErr, gemini.ErrNotConfigured) {
			expected = 503
		}
		if w.Code != expected || f.count(t, f.user) != 2 || strings.Contains(w.Body.String(), "sensitive") {
			t.Fatalf("failed provider changed data %d %s", w.Code, w.Body.String())
		}
	}
	f.handler.generator = generatorFunc(func(context.Context, string) (string, error) {
		t.Fatal("provider called for foreign clip")
		return "", nil
	})
	editorBody := fmt.Sprintf(`{"context":"editor","clip_id":%q,"message":"Find the hook"}`, f.otherClip)
	w = f.call("POST", "/api/assistant/chat", f.token, editorBody)
	if w.Code != 404 {
		t.Fatalf("foreign clip chat %d", w.Code)
	}
	w = f.call("GET", "/api/assistant/history?context=editor&clip_id="+f.otherClip, f.token, "")
	if w.Code != 404 {
		t.Fatalf("foreign clip history %d", w.Code)
	}
	if _, e = f.db.Exec(`UPDATE users SET access_role='viewer' WHERE id=$1`, f.user); e != nil {
		t.Fatal(e)
	}
	w = f.call("POST", "/api/assistant/chat", f.token, body)
	if w.Code != 403 {
		t.Fatalf("viewer chat %d", w.Code)
	}
	w = f.call("DELETE", "/api/assistant/history?context=create", f.token, "")
	if w.Code != 403 {
		t.Fatalf("viewer clear %d", w.Code)
	}
	w = f.call("GET", "/api/assistant/history?context=create", f.token, "")
	if w.Code != 200 {
		t.Fatalf("viewer read %d", w.Code)
	}
}
func TestPostgresEditorPromptAndScopedHistoryClear(t *testing.T) {
	f := newChatFixture(t)
	var prompt string
	f.handler.generator = generatorFunc(func(ctx context.Context, p string) (string, error) {
		prompt = p
		return `{"reply":"Keep these moments.","actions":[{"type":"apply_segments","segments":[{"start":7,"end":10},{"start":0,"end":3}]},{"type":"seek","time":100}]}`, nil
	})
	body := fmt.Sprintf(`{"context":"editor","clip_id":%q,"message":"Find the hook","editor_state":{"video_duration":10,"current_time":0,"segments":[{"start":0,"end":10}]}}`, f.clip)
	w := f.call("POST", "/api/assistant/chat", f.token, body)
	if w.Code != 200 {
		t.Fatalf("editor %d %s", w.Code, w.Body.String())
	}
	if !strings.Contains(prompt, "TRANSCRIPT_CHUNKS:") || !strings.Contains(prompt, "Synthetic transcript context") || !strings.Contains(prompt, `"video_duration":10`) {
		t.Fatalf("missing editor context: %s", prompt)
	}
	w = f.call("POST", "/api/assistant/chat", f.token, body)
	if w.Code != 200 || !strings.Contains(prompt, "CONVERSATION_SO_FAR:\nUSER: Find the hook\nASSISTANT: Keep these moments.") {
		t.Fatalf("history missing %d", w.Code)
	}
	if _, e := f.db.Exec(`UPDATE jobs SET transcript_segments=NULL WHERE id=(SELECT job_id FROM clips WHERE id=$1)`, f.clip); e != nil {
		t.Fatal(e)
	}
	w = f.call("POST", "/api/assistant/chat", f.token, body)
	if w.Code != 200 || !strings.Contains(prompt, "Legacy clip context") {
		t.Fatal("legacy transcript fallback missing")
	}
	f.handler.generator = generatorFunc(func(context.Context, string) (string, error) { return "Plain reply", nil })
	w = f.call("POST", "/api/assistant/chat", f.token, `{"context":"create","message":"hello"}`)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	w = f.call("POST", "/api/assistant/chat", f.otherToken, `{"context":"create","message":"other user"}`)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	w = f.call("DELETE", "/api/assistant/history?context=create", f.token, "")
	if w.Code != 204 || f.count(t, f.user) != 6 || f.count(t, f.other) != 2 {
		t.Fatalf("clear affected other scope/user %d", w.Code)
	}
	w = f.call("DELETE", "/api/assistant/history?context=editor&clip_id="+f.clip, f.token, "")
	if w.Code != 204 || f.count(t, f.user) != 0 {
		t.Fatalf("editor clear %d", w.Code)
	}
}
func TestPostgresChatPersistenceIsAtomicAndRechecksUserAfterAI(t *testing.T) {
	for _, change := range []string{"deleting", "viewer", "activation", "clip-deleted", "insert-failure"} {
		t.Run(change, func(t *testing.T) {
			f := newChatFixture(t)
			expected := 409
			body := `{"context":"create","message":"hello"}`
			if change == "clip-deleted" {
				body = fmt.Sprintf(`{"context":"editor","clip_id":%q,"message":"hello"}`, f.clip)
			}
			if change == "insert-failure" {
				expected = 500
				if _, e := f.db.Exec(`CREATE FUNCTION reject_assistant_reply() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.role='assistant' THEN RAISE EXCEPTION 'synthetic insert failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_reply BEFORE INSERT ON chat_messages FOR EACH ROW EXECUTE FUNCTION reject_assistant_reply()`); e != nil {
					t.Fatal(e)
				}
			}
			f.handler.generator = generatorFunc(func(context.Context, string) (string, error) {
				var e error
				switch change {
				case "deleting":
					_, e = f.db.Exec(`INSERT INTO account_deletion_requests(user_id) VALUES($1)`, f.user)
				case "viewer":
					_, e = f.db.Exec(`UPDATE users SET access_role='viewer' WHERE id=$1`, f.user)
				case "activation":
					_, e = f.db.Exec(`UPDATE users SET email_activation_required=true WHERE id=$1`, f.user)
				case "clip-deleted":
					_, e = f.db.Exec(`DELETE FROM clips WHERE id=$1`, f.clip)
				}
				if e != nil {
					t.Fatal(e)
				}
				return `{"reply":"reply","actions":[]}`, nil
			})
			w := f.call("POST", "/api/assistant/chat", f.token, body)
			if w.Code != expected || f.count(t, f.user) != 0 {
				t.Fatalf("partial/late conversation persisted %d %s", w.Code, w.Body.String())
			}
		})
	}
}
func TestPostgresHistoryIsChronologicalAndBounded(t *testing.T) {
	f := newChatFixture(t)
	if _, e := f.db.Exec(`INSERT INTO chat_messages(id,user_id,context,role,content,created_at) SELECT gen_random_uuid(),$1,'create','user','Message '||i,now()-interval '100 seconds'+i*interval '1 second' FROM generate_series(1,61) i`, f.user); e != nil {
		t.Fatal(e)
	}
	for limit, first := range map[int]string{20: "Message 42", 50: "Message 12"} {
		messages, e := f.handler.messages(context.Background(), f.user, "create", nil, limit)
		if e != nil || len(messages) != limit || messages[0].Content != first || messages[len(messages)-1].Content != "Message 61" {
			t.Fatalf("bounded history limit=%d messages=%+v err=%v", limit, messages, e)
		}
	}
}
