package media

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// Test-only wire diagnostics. Never record query strings, credentials, headers
// other than SDK attempt counters, or response bodies.
type s3Trace struct {
	file *os.File
	next http.RoundTripper
	mu   sync.Mutex
	err  error
}

type s3TraceEvent struct {
	Time       string `json:"time"`
	Phase      string `json:"phase"`
	Method     string `json:"method"`
	Path       string `json:"path"`
	Invocation string `json:"invocation,omitempty"`
	Attempt    string `json:"attempt,omitempty"`
	Status     int    `json:"status"`
	RequestID  string `json:"request_id,omitempty"`
	ElapsedMS  int64  `json:"elapsed_ms"`
	Bytes      int64  `json:"bytes"`
	Error      string `json:"error,omitempty"`
}

func newS3Trace(path string, next http.RoundTripper) (*s3Trace, error) {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		return nil, err
	}
	if next == nil {
		next = http.DefaultTransport
	}
	return &s3Trace{file: file, next: next}, nil
}

func (trace *s3Trace) record(event s3TraceEvent) {
	trace.mu.Lock()
	defer trace.mu.Unlock()
	if err := json.NewEncoder(trace.file).Encode(event); err != nil && trace.err == nil {
		trace.err = err
	}
}

func (trace *s3Trace) close() error {
	trace.mu.Lock()
	defer trace.mu.Unlock()
	return errors.Join(trace.err, trace.file.Close())
}

func traceError(err error) string {
	if err == nil || errors.Is(err, io.EOF) {
		return ""
	}
	if errors.Is(err, context.Canceled) {
		return "canceled"
	}
	var timeout net.Error
	if errors.Is(err, context.DeadlineExceeded) || (errors.As(err, &timeout) && timeout.Timeout()) {
		return "timeout"
	}
	return "io_error"
}

func (trace *s3Trace) RoundTrip(request *http.Request) (*http.Response, error) {
	started := time.Now()
	event := s3TraceEvent{Time: started.UTC().Format(time.RFC3339Nano), Phase: "headers",
		Method: request.Method, Path: request.URL.EscapedPath(),
		Invocation: request.Header.Get("Amz-Sdk-Invocation-Id"), Attempt: request.Header.Get("Amz-Sdk-Request")}
	response, err := trace.next.RoundTrip(request)
	event.ElapsedMS = time.Since(started).Milliseconds()
	event.Error = traceError(err)
	if response != nil {
		event.Status = response.StatusCode
		event.RequestID = response.Header.Get("X-Amz-Request-Id")
	}
	trace.record(event)
	if response != nil && response.Body != nil {
		response.Body = &s3TraceBody{ReadCloser: response.Body, finish: func(bytes int64, err error) {
			event.Phase = "body"
			event.ElapsedMS = time.Since(started).Milliseconds()
			event.Bytes, event.Error = bytes, traceError(err)
			trace.record(event)
		}}
	}
	return response, err
}

type s3TraceBody struct {
	io.ReadCloser
	bytes  atomic.Int64
	once   sync.Once
	finish func(int64, error)
}

func (body *s3TraceBody) Read(buffer []byte) (int, error) {
	n, err := body.ReadCloser.Read(buffer)
	body.bytes.Add(int64(n))
	if err != nil {
		body.once.Do(func() { body.finish(body.bytes.Load(), err) })
	}
	return n, err
}

func (body *s3TraceBody) Close() error {
	err := body.ReadCloser.Close()
	body.once.Do(func() { body.finish(body.bytes.Load(), err) })
	return err
}

type traceRoundTripper func(*http.Request) (*http.Response, error)

func (roundTrip traceRoundTripper) RoundTrip(request *http.Request) (*http.Response, error) {
	return roundTrip(request)
}

type traceErrorReader struct{}

func (traceErrorReader) Read([]byte) (int, error) { return 0, context.DeadlineExceeded }

func TestS3TraceRedactsSecretsAndRecordsResponseBodyTimeout(t *testing.T) {
	path := filepath.Join(t.TempDir(), "trace.jsonl")
	trace, err := newS3Trace(path, traceRoundTripper(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Header: http.Header{"X-Amz-Request-Id": {"synthetic-id"}},
			Body: io.NopCloser(io.MultiReader(strings.NewReader("abc"), traceErrorReader{}))}, nil
	}))
	if err != nil {
		t.Fatal(err)
	}
	request, _ := http.NewRequest(http.MethodGet, "https://example.invalid/synthetic/key?X-Amz-Credential=SECRET&X-Amz-Signature=SECRET", nil)
	request.Header.Set("Authorization", "SECRET")
	request.Header.Set("Amz-Sdk-Request", "attempt=2; max=3")
	response, err := trace.RoundTrip(request)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := io.ReadAll(response.Body); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected body timeout, got %v", err)
	}
	response.Body.Close()
	if err := trace.close(); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(path)
	if strings.Contains(string(data), "SECRET") || strings.Contains(string(data), "X-Amz-Signature") {
		t.Fatal("trace leaked request credentials")
	}
	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	if len(lines) != 2 {
		t.Fatalf("expected headers and body events, got %d", len(lines))
	}
	var event s3TraceEvent
	if err := json.Unmarshal([]byte(lines[1]), &event); err != nil {
		t.Fatal(err)
	}
	if event.Status != 200 || event.Error != "timeout" || event.Bytes != 3 || event.Attempt != "attempt=2; max=3" || event.RequestID != "synthetic-id" {
		t.Fatalf("incorrect body event: %+v", event)
	}
}
