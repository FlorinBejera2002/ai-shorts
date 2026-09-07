package main

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)


type API struct {
	db             *sql.DB
	key, mediaRoot string
}
type problem struct {
	status int
	detail string
}

func (p *problem) Error() string           { return p.detail }
func fail(status int, detail string) error { return &problem{status, detail} }
func reply(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func report(w http.ResponseWriter, err error) {
	var p *problem
	if errors.As(err, &p) {
		reply(w, p.status, map[string]string{"detail": p.detail})
		return
	}
	reply(w, 503, map[string]string{"detail": "Service temporarily unavailable"})
}

var uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

func newID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(err)
	}
	b[6] = (b[6] & 15) | 64
	b[8] = (b[8] & 63) | 128
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[:4], b[4:6], b[6:8], b[8:10], b[10:])
}

func (a *API) handler(target *url.URL) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()
		if err := a.db.PingContext(ctx); err != nil {
			report(w, err)
			return
		}
		reply(w, 200, map[string]string{"status": "ok", "service": "sneepcut-backend", "version": "0.1.0"})
	})
	mux.HandleFunc("GET /api/jobs", a.native(a.list))
	mux.HandleFunc("GET /api/jobs/{id}", a.native(a.get))
	mux.HandleFunc("POST /api/jobs", a.native(a.create))
	mux.HandleFunc("POST /api/jobs/{id}/cancel", a.native(a.cancel))
	// Explicit compatibility boundary; remaining Python routes are not claimed native.
	proxy := &httputil.ReverseProxy{Rewrite: func(r *httputil.ProxyRequest) { r.SetURL(target); r.SetXForwarded() },
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) { report(w, err) }}
	mux.Handle("/", proxy)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		mux.ServeHTTP(w, r)
	})
}
func (a *API) native(fn func(http.ResponseWriter, *http.Request, string) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Backend-Implementation", "go")
		if a.key == "" || subtle.ConstantTimeCompare([]byte(r.Header.Get("X-Internal-API-Key")), []byte(a.key)) != 1 {
			report(w, fail(403, "Invalid internal API key"))
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
		defer cancel()
		r = r.WithContext(ctx)
		id := r.Header.Get("X-User-Id")
		var exists, deleting bool
		var role string
		if !uuidPattern.MatchString(id) {
			report(w, fail(401, "Authentication required"))
			return
		}
		err := a.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE id=$1), EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=$1), COALESCE((SELECT access_role FROM users WHERE id=$1),'')`, id).Scan(&exists, &deleting, &role)
		if err != nil {
			report(w, err)
			return
		}
		if !exists {
			report(w, fail(401, "Authenticated user no longer exists"))
			return
		}
		if deleting {
			report(w, fail(409, "Account deletion is pending"))
			return
		}
		if (role != "member" && role != "viewer") || (role == "viewer" && r.Method != "GET" && r.Method != "HEAD") {
			report(w, fail(403, "Content modification is not allowed for this role"))
			return
		}
		if err := fn(w, r, id); err != nil {
			report(w, err)
		}
	}
}

const jobColumns = `id,user_id,source_type,source_url,source_file_path,status,progress,progress_message,num_clips_requested,aspect_ratio,language,subtitle_style,include_brand,user_instructions,credits_charged,error_message,celery_task_id,processing_active,active_edit_tasks,started_at,completed_at,created_at,updated_at`

func (a *API) list(w http.ResponseWriter, r *http.Request, user string) error {
	rows, err := a.db.QueryContext(r.Context(), `SELECT row_to_json(j) FROM (SELECT `+jobColumns+` FROM jobs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100) j`, user)
	if err != nil {
		return err
	}
	defer rows.Close()
	result := []json.RawMessage{}
	for rows.Next() {
		var raw json.RawMessage
		if err := rows.Scan(&raw); err != nil {
			return err
		}
		result = append(result, raw)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	reply(w, 200, map[string]any{"jobs": result})
	return nil
}
func (a *API) read(ctx context.Context, id, user string) (json.RawMessage, error) {
	if !uuidPattern.MatchString(id) {
		return nil, fail(422, "Invalid job ID")
	}
	var raw json.RawMessage
	err := a.db.QueryRowContext(ctx, `SELECT row_to_json(j) FROM (SELECT `+jobColumns+` FROM jobs WHERE id=$1 AND user_id=$2) j`, id, user).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, fail(404, "Job not found")
	}
	return raw, err
}
func (a *API) get(w http.ResponseWriter, r *http.Request, user string) error {
	raw, err := a.read(r.Context(), r.PathValue("id"), user)
	if err != nil {
		return err
	}
	reply(w, 200, map[string]any{"job": raw, "celery_state": nil, "celery_meta": nil})
	return nil
}
func (a *API) cancel(w http.ResponseWriter, r *http.Request, user string) error {
	id := r.PathValue("id")
	if !uuidPattern.MatchString(id) {
		return fail(422, "Invalid job ID")
	}
	tx, err := a.db.BeginTx(r.Context(), nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var status string
	var credits int
	err = tx.QueryRowContext(r.Context(), `SELECT status,credits_charged FROM jobs WHERE id=$1 AND user_id=$2 FOR UPDATE`, id, user).Scan(&status, &credits)
	if errors.Is(err, sql.ErrNoRows) {
		return fail(404, "Job not found")
	}
	if err != nil {
		return err
	}
	if status != "completed" && status != "failed" && status != "cancelled" {
		if _, err = tx.ExecContext(r.Context(), `UPDATE jobs SET status='cancelled',progress_message='Cancelled',completed_at=now(),updated_at=now() WHERE id=$1`, id); err != nil {
			return err
		}
		if _, err = tx.ExecContext(r.Context(), `UPDATE users SET credits=credits+$1,updated_at=now() WHERE id=$2`, credits, user); err != nil {
			return err
		}
	}
	if err = tx.Commit(); err != nil {
		return err
	}
	raw, err := a.read(r.Context(), id, user)
	if err != nil {
		return err
	}
	reply(w, 200, raw)
	return nil
}

type jobCreate struct {
	SourceType    string  `json:"source_type"`
	SourceURL     *string `json:"source_url"`
	SourceFile    *string `json:"source_file_path"`
	SourceKey     *string `json:"source_storage_key"`
	Count         int     `json:"num_clips_requested"`
	Ratio         string  `json:"aspect_ratio"`
	Language      *string `json:"language"`
	SubtitleStyle string  `json:"subtitle_style"`
	IncludeBrand  bool    `json:"include_brand"`
	BurnSubtitles bool    `json:"burn_subtitles"`
	SmartCrop     bool    `json:"smart_crop"`
	Instructions  *string `json:"user_instructions"`
}

func defaults() jobCreate {
	return jobCreate{Count: 5, Ratio: "9:16", SubtitleStyle: "default", BurnSubtitles: true, SmartCrop: true}
}
func decode(w http.ResponseWriter, r *http.Request, value any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 65536)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(value); err != nil {
		return fail(422, "Invalid request body")
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return fail(422, "Expected one JSON object")
	}
	return nil
}
func (a *API) validate(ctx context.Context, p jobCreate, user string) error {
	if p.Count < 1 || p.Count > 15 || (p.Ratio != "9:16" && p.Ratio != "1:1" && p.Ratio != "16:9") || len(p.SubtitleStyle) > 50 {
		return fail(422, "Invalid creation settings")
	}
	for _, pair := range []struct {
		v   *string
		max int
	}{{p.SourceURL, 2048}, {p.SourceFile, 2048}, {p.SourceKey, 2048}, {p.Language, 50}, {p.Instructions, 4000}} {
		if pair.v != nil && len([]rune(*pair.v)) > pair.max {
			return fail(422, "Creation field too long")
		}
	}
	if p.SourceURL != nil && *p.SourceURL != "" && p.SourceFile != nil && *p.SourceFile != "" {
		return fail(422, "Provide exactly one source")
	}
	switch p.SourceType {
	case "youtube", "url":
		if p.SourceURL == nil || *p.SourceURL == "" {
			return fail(422, "source_url is required")
		}
		parsed, err := url.Parse(*p.SourceURL)
		if err != nil || parsed.Hostname() == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.User != nil {
			return fail(400, "Invalid source URL")
		}
		host := strings.ToLower(parsed.Hostname())
		if p.SourceType == "youtube" && host != "youtube.com" && host != "www.youtube.com" && host != "m.youtube.com" && host != "youtu.be" && host != "www.youtu.be" {
			return fail(400, "Only YouTube URLs are allowed for YouTube jobs")
		}
		addresses, err := net.DefaultResolver.LookupIPAddr(ctx, host)
		if err != nil || len(addresses) == 0 {
			return fail(400, "Source URL host could not be resolved")
		}
		for _, address := range addresses {
			ip := address.IP
			if !ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() {
				return fail(400, "Private network URLs are not allowed")
			}
		}
	case "upload", "local":
		if p.SourceFile == nil || *p.SourceFile == "" {
			return fail(422, "source_file_path is required")
		}
		path, err := filepath.EvalSymlinks(*p.SourceFile)
		if err != nil {
			return fail(400, "Uploaded file was not found")
		}
		root, err := filepath.EvalSymlinks(filepath.Join(a.mediaRoot, "uploads", user))
		if err != nil {
			return fail(400, "Invalid uploaded file path")
		}
		ext := strings.ToLower(filepath.Ext(path))
		if filepath.Dir(path) != root || strings.HasPrefix(filepath.Base(path), ".") || (ext != ".mp4" && ext != ".mov" && ext != ".avi" && ext != ".mkv" && ext != ".webm") {
			return fail(400, "Invalid uploaded file path")
		}
		info, err := os.Stat(path)
		if err != nil || !info.Mode().IsRegular() {
			return fail(400, "Uploaded file was not found")
		}
	default:
		return fail(422, "Invalid source_type")
	}
	return nil
}

func (a *API) create(w http.ResponseWriter, r *http.Request, user string) error {
	p := defaults()
	if err := decode(w, r, &p); err != nil {
		return err
	}
	if err := a.validate(r.Context(), p, user); err != nil {
		return err
	}
	tx, err := a.db.BeginTx(r.Context(), nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var credits int
	if err = tx.QueryRowContext(r.Context(), `SELECT credits FROM users WHERE id=$1 FOR UPDATE`, user).Scan(&credits); err != nil {
		return err
	}
	var deleting bool
	if err = tx.QueryRowContext(r.Context(), `SELECT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=$1)`, user).Scan(&deleting); err != nil {
		return err
	}
	if deleting {
		return fail(409, "Account deletion is pending")
	}
	cost := p.Count * 10
	if credits < cost {
		return fail(402, "Insufficient credits")
	}
	var recent int
	if err = tx.QueryRowContext(r.Context(), `SELECT count(*) FROM jobs WHERE user_id=$1 AND created_at>now()-interval '1 hour'`, user).Scan(&recent); err != nil {
		return err
	}
	if recent >= 30 {
		return fail(429, "Job creation limit reached")
	}
	id, taskID := newID(), newID()
	_, err = tx.ExecContext(r.Context(), `INSERT INTO jobs(id,user_id,source_type,source_url,source_file_path,status,progress,progress_message,num_clips_requested,aspect_ratio,language,subtitle_style,include_brand,user_instructions,credits_charged,celery_task_id) VALUES($1,$2,$3,$4,$5,'pending',0,'Queued',$6,$7,$8,$9,$10,$11,$12,$13)`, id, user, p.SourceType, p.SourceURL, p.SourceFile, p.Count, p.Ratio, p.Language, p.SubtitleStyle, p.IncludeBrand, p.Instructions, cost, taskID)
	if err != nil {
		return err
	}
	source := p.SourceURL
	if source == nil || *source == "" {
		source = p.SourceFile
	}
	sourceType := "auto"
	if p.SourceType == "youtube" {
		sourceType = "youtube"
	}
	payload, err := json.Marshal(map[string]any{"job_id": id, "source": source, "source_type": sourceType, "requested_clips": p.Count, "aspect_ratio": p.Ratio, "burn_subtitles": p.BurnSubtitles, "smart_crop": p.SmartCrop, "user_instructions": p.Instructions})
	if err != nil {
		return err
	}
	if _, err = tx.ExecContext(r.Context(), `INSERT INTO job_deliveries(job_id,payload) VALUES($1,$2)`, id, payload); err != nil {
		return err
	}
	if _, err = tx.ExecContext(r.Context(), `UPDATE users SET credits=credits-$1,updated_at=now() WHERE id=$2`, cost, user); err != nil {
		return err
	}
	if err = tx.Commit(); err != nil {
		return err
	}
	// The existing durable dispatcher publishes this transaction's outbox entry.
	raw, err := a.read(r.Context(), id, user)
	if err != nil {
		return err
	}
	reply(w, 201, raw)
	return nil
}
