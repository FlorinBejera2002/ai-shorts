package studiocomposition

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCommitRequiresVerifiedPublicationAndPreservesConflict(t *testing.T) {
	id := Identity(testOwner, "candidate", nil)
	project := Identity(testOwner, "project", nil)
	for _, tc := range []struct {
		name      string
		status    int
		result    Result
		wantError bool
	}{
		{"committed", 200, Result{ArtifactID: id, ProjectID: project, Committed: true, CommittedRevision: "revision"}, false},
		{"not committed", 200, Result{ArtifactID: id, ProjectID: project}, true},
		{"missing revision", 200, Result{ArtifactID: id, ProjectID: project, Committed: true}, true},
		{"newer manual edit", 409, Result{}, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			calls := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				var body struct {
					Operation string `json:"operation"`
					RequestID string `json:"request_id"`
					Input     struct {
						ArtifactID string `json:"artifact_id"`
					} `json:"input"`
				}
				if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
					t.Error(err)
				}
				if body.Operation != "composition.commit" || body.RequestID != id || body.Input.ArtifactID != id {
					t.Errorf("wrong commit contract: %+v", body)
				}
				w.WriteHeader(tc.status)
				_ = json.NewEncoder(w).Encode(tc.result)
			}))
			defer server.Close()
			client, _ := New(server.URL, strings.Repeat("s", 32))
			err := client.Commit(context.Background(), testOwner, id)
			if (err != nil) != tc.wantError {
				t.Fatal(err)
			}
			if tc.status == 409 && !errors.Is(err, ErrProjectChanged) {
				t.Fatal("lost workspace conflict", err)
			}
			if calls != 1 {
				t.Fatal("commit retried or cancelled the preserved workspace", calls)
			}
		})
	}
}

func TestLegacyWorkspaceConflictDoesNotCancelOrForkSavedEdits(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.WriteHeader(http.StatusConflict)
		_ = json.NewEncoder(w).Encode(map[string]string{"code": "legacy_project_requires_studio"})
	}))
	defer server.Close()
	client, _ := New(server.URL, strings.Repeat("s", 32))
	_, err := client.Render(context.Background(), testOwner, Identity(testOwner, "legacy", nil), nil)
	if !errors.Is(err, ErrLegacyProject) || calls != 1 {
		t.Fatal("legacy edits were not preserved with explicit instruction", calls, err)
	}
}
