package errorlog

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"sneepcut/backend-go/internal/httpx"
)

const capturedBodyLimit = 2048

// Middleware records every 5xx response with its route and error message.
// The readiness probe's 503 is expected during start-up and is ignored.
func (r *Recorder) Middleware(next http.Handler) http.Handler {
	if r == nil {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		started := time.Now()
		writer := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(writer, req)
		if writer.status < 500 || req.URL.Path == "/api/ready" {
			return
		}
		route := NormalizeRoute(req.URL.Path)
		r.Record(Event{
			Source:  SourceAPI,
			Kind:    KindHTTP,
			Message: fmt.Sprintf("%s %s → %d %s", req.Method, route, writer.status, responseMessage(writer.body.Bytes())),
			Route:   req.Method + " " + route,
			Context: map[string]string{"status": fmt.Sprint(writer.status), "durationMs": fmt.Sprint(time.Since(started).Milliseconds())},
			At:      started,
		})
	})
}

type statusWriter struct {
	http.ResponseWriter
	status      int
	wroteHeader bool
	body        bytes.Buffer
}

func (w *statusWriter) WriteHeader(status int) {
	if !w.wroteHeader {
		w.status, w.wroteHeader = status, true
	}
	w.ResponseWriter.WriteHeader(status)
}

func (w *statusWriter) Write(data []byte) (int, error) {
	if !w.wroteHeader {
		w.wroteHeader = true
	}
	if w.status >= 500 && w.body.Len() < capturedBodyLimit {
		w.body.Write(data[:min(len(data), capturedBodyLimit-w.body.Len())])
	}
	return w.ResponseWriter.Write(data)
}

// Unwrap lets http.ResponseController reach deadlines and flushing.
func (w *statusWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func responseMessage(body []byte) string {
	var payload struct {
		Error  string `json:"error"`
		Detail string `json:"detail"`
	}
	if json.Unmarshal(body, &payload) == nil {
		if payload.Error != "" {
			return payload.Error
		}
		return payload.Detail
	}
	return strings.TrimSpace(string(body))
}

type clientReport struct {
	Source  string `json:"source"`
	Message string `json:"message"`
	Stack   string `json:"stack"`
	Page    string `json:"page"`
	Release string `json:"release"`
}

// ClientHandler accepts error reports from the web app and the admin console.
// Only the page path is kept (no query string) to avoid storing tokens.
func (r *Recorder) ClientHandler(w http.ResponseWriter, req *http.Request) {
	var report clientReport
	if !httpx.Read(w, req, &report, 16<<10) {
		return
	}
	if report.Source != SourceWeb && report.Source != SourceAdmin {
		httpx.Error(w, http.StatusBadRequest, "Invalid error source")
		return
	}
	if strings.TrimSpace(report.Message) == "" {
		httpx.Error(w, http.StatusBadRequest, "Error message is required")
		return
	}
	page := ""
	if parsed, err := url.Parse(report.Page); err == nil {
		page = parsed.Path
	}
	context := map[string]string{"page": truncate(page, maxRoute), "userAgent": truncate(req.UserAgent(), 200)}
	if report.Release != "" {
		context["release"] = truncate(report.Release, 64)
	}
	r.Record(Event{Source: report.Source, Kind: KindClient, Message: report.Message, Route: NormalizeRoute(page), Detail: report.Stack, Context: context})
	w.WriteHeader(http.StatusNoContent)
}
