package studiocomposition

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
	"unicode"
	"unicode/utf8"
)

func TestRenderFailureRetainsRequestedIdentityAndSafeCause(t *testing.T) {
	for _, status := range []string{"failed", "cancelled"} {
		t.Run(status, func(t *testing.T) {
			id := Identity(testOwner, status, nil)
			var cancels atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var request struct {
					Operation string `json:"operation"`
				}
				_ = json.NewDecoder(r.Body).Decode(&request)
				state := Result{ArtifactID: id, Status: "rendering"}
				switch request.Operation {
				case "composition.status":
					state.Status, state.Error = status, "FFmpeg exited with code 137\nworker stopped"
				case "composition.cancel":
					cancels.Add(1)
					// Cleanup failure must not replace the exact render failure.
					w.WriteHeader(http.StatusInternalServerError)
					return
				}
				_ = json.NewEncoder(w).Encode(state)
			}))
			defer server.Close()
			client, _ := New(server.URL, strings.Repeat("s", 32))
			client.poll = time.Millisecond
			result, err := client.Render(context.Background(), testOwner, id, nil)
			var failure *RenderFailure
			if !errors.As(err, &failure) || failure.ArtifactID != id || failure.Status != status || failure.DiagnosticCause() != "FFmpeg exited with code 137 worker stopped" {
				t.Fatalf("terminal diagnostic lost: result=%+v error=%v failure=%+v", result, err, failure)
			}
			if result.ArtifactID != id || result.Status != status || cancels.Load() != 1 {
				t.Fatalf("render/cancellation contract changed: %+v, cancels=%d", result, cancels.Load())
			}
			if err.Error() != "Studio composition rendering did not complete" {
				t.Fatalf("public error exposed operational details: %s", err)
			}
		})
	}
}

func TestRenderFailureRejectsForeignIdentityBeforeExposingDiagnostics(t *testing.T) {
	for _, atPoll := range []bool{false, true} {
		t.Run(map[bool]string{false: "initial", true: "poll"}[atPoll], func(t *testing.T) {
			id := Identity(testOwner, "requested", nil)
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var request struct {
					Operation string `json:"operation"`
				}
				_ = json.NewDecoder(r.Body).Decode(&request)
				state := Result{ArtifactID: Identity(testOwner, "foreign", nil), Status: "failed", Error: "foreign-secret"}
				if atPoll && request.Operation == "composition.render" {
					state = Result{ArtifactID: id, Status: "rendering"}
				}
				_ = json.NewEncoder(w).Encode(state)
			}))
			defer server.Close()
			client, _ := New(server.URL, strings.Repeat("s", 32))
			client.poll = time.Millisecond
			result, err := client.Render(context.Background(), testOwner, id, nil)
			var failure *RenderFailure
			if err == nil || errors.As(err, &failure) || result.ArtifactID != "" || strings.Contains(err.Error(), "foreign-secret") {
				t.Fatalf("foreign receipt trusted: %+v, %v", result, err)
			}
		})
	}
}

func TestRenderDiagnosticIsBoundedAndRedactsCredentials(t *testing.T) {
	secret := strings.Repeat("service-secret", 3)
	raw := "Chromium failed\r\n\t\x00\x1b\u202e" + secret + " https://user:password@example.test/file?token=url-secret Authorization: Bearer bearer-secret token=token-secret \"api_key\":\"key-secret\" SECRET_KEY='secret value' Bearer loose-secret " + strings.Repeat("ș", 600)
	cause := renderDiagnostic(raw, secret)
	if !strings.HasPrefix(cause, "Chromium failed") || !strings.HasSuffix(cause, "...") || len(cause) > maxDiagnosticBytes || !utf8.ValidString(cause) {
		t.Fatalf("invalid bounded diagnostic: %q (%d bytes)", cause, len(cause))
	}
	for _, sensitive := range []string{secret, "example.test", "password", "url-secret", "bearer-secret", "token-secret", "key-secret", "secret value", "loose-secret"} {
		if strings.Contains(cause, sensitive) {
			t.Fatalf("diagnostic retained %q: %q", sensitive, cause)
		}
	}
	for _, r := range cause {
		if unicode.IsControl(r) || unicode.Is(unicode.Cf, r) {
			t.Fatalf("unsafe diagnostic character: %q", cause)
		}
	}
	if renderDiagnostic("\r\n\x00", secret) != "" {
		t.Fatal("empty service diagnostic became misleading text")
	}
}

func TestRenderFailurePreservesContextAndProjectConflictErrors(t *testing.T) {
	for _, kind := range []string{"context", "project", "legacy"} {
		t.Run(kind, func(t *testing.T) {
			id := Identity(testOwner, kind, nil)
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			var cancels atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var request struct {
					Operation string `json:"operation"`
				}
				_ = json.NewDecoder(r.Body).Decode(&request)
				if request.Operation == "composition.cancel" {
					cancels.Add(1)
					_ = json.NewEncoder(w).Encode(Result{ArtifactID: id, Status: "cancelled"})
					return
				}
				if kind == "context" {
					_ = json.NewEncoder(w).Encode(Result{ArtifactID: id, Status: "rendering"})
					cancel()
					return
				}
				w.WriteHeader(http.StatusConflict)
				_ = json.NewEncoder(w).Encode(map[string]string{"code": map[bool]string{true: "legacy_project_requires_studio", false: "project_changed"}[kind == "legacy"]})
			}))
			defer server.Close()
			client, _ := New(server.URL, strings.Repeat("s", 32))
			_, err := client.Render(ctx, testOwner, id, nil)
			want := map[string]error{"context": context.Canceled, "project": ErrProjectChanged, "legacy": ErrLegacyProject}[kind]
			var failure *RenderFailure
			if !errors.Is(err, want) || errors.As(err, &failure) {
				t.Fatalf("error semantics changed: %v", err)
			}
			wantCancels := int32(0)
			if kind == "context" {
				wantCancels = 1
			}
			if cancels.Load() != wantCancels {
				t.Fatalf("cleanup changed: %d, want %d", cancels.Load(), wantCancels)
			}
		})
	}
}
