package stories

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/studiocomposition"
)

func TestRunnerLogsOnlyScopedRenderFailureDiagnostic(t *testing.T) {
	const owner = "11111111-1111-4111-8111-111111111111"
	const storyID = "22222222-2222-4222-8222-222222222222"
	artifact := studiocomposition.Identity(owner, storyID, nil)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(studiocomposition.Result{ArtifactID: artifact, Status: "failed", Error: "FFmpeg exited 137\nAuthorization: Bearer private-token"})
	}))
	defer server.Close()
	client, err := studiocomposition.New(server.URL, strings.Repeat("s", 32))
	if err != nil {
		t.Fatal(err)
	}
	_, renderErr := client.Render(context.Background(), owner, artifact, nil)
	if renderErr == nil {
		t.Fatal("expected terminal render error")
	}
	for _, tc := range []struct {
		name string
		err  error
		want bool
	}{
		{"render", fmt.Errorf("wrapper-secret: %w", renderErr), true},
		{"generic", errors.New("transport url with generic-secret"), false},
		{"success", nil, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var output bytes.Buffer
			runner := Runner{Logger: slog.New(slog.NewJSONHandler(&output, nil))}
			runner.logRunFailure(storyID, tc.err)
			if tc.err == nil {
				if output.Len() != 0 {
					t.Fatalf("success logged as failure: %s", output.String())
				}
				return
			}
			var entry map[string]any
			if err := json.Unmarshal(output.Bytes(), &entry); err != nil {
				t.Fatal(err)
			}
			if entry["story_id"] != storyID || entry["msg"] != "Story execution did not complete" || entry["level"] != "WARN" {
				t.Fatalf("existing log scope changed: %v", entry)
			}
			if tc.want {
				if entry["studio_artifact_id"] != artifact || entry["studio_render_status"] != "failed" || entry["studio_render_cause"] != "FFmpeg exited 137 [credential]" {
					t.Fatalf("missing structured render diagnostic: %v", entry)
				}
			} else if _, exists := entry["studio_artifact_id"]; exists {
				t.Fatalf("generic error attributed to Studio: %v", entry)
			}
			for _, sensitive := range []string{"private-token", "wrapper-secret", "generic-secret"} {
				if strings.Contains(output.String(), sensitive) {
					t.Fatalf("unsafe error logged: %s", output.String())
				}
			}
		})
	}
	// An optional logger must not alter execution failure handling.
	(&Runner{}).logRunFailure(storyID, renderErr)
}
