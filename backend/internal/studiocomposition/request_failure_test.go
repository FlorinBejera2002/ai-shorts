package studiocomposition

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRequestFailureRetainsOnlyScopedSanitizedJSONDiagnostic(t *testing.T) {
	secret := strings.Repeat("private-signing-key", 3)
	id := Identity(testOwner, "rejected-plan", nil)
	for _, tc := range []struct {
		name, body, want string
	}{
		{"validation", `{"error":"Invalid scene duration"}`, "Invalid scene duration"},
		{"redaction", fmt.Sprintf(`{"error":"Invalid audio URL https://private.example/source?token=private-url Authorization: Bearer private-token secret=%s"}`, secret), "Invalid audio URL [url] [credential] [credential]"},
		{"foreign", `{"artifact_id":"33333333-3333-4333-8333-333333333333","error":"foreign-private-message"}`, ""},
		{"proxy", "<html>private-proxy-body</html>", ""},
		{"malformed", `{"error":`, ""},
		{"oversized", `{"error":"` + strings.Repeat("private", 700) + `"}`, ""},
		{"unrelated fields", `{"message":"private-message","request":{"token":"private-token"}}`, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var body struct {
					Operation string `json:"operation"`
				}
				_ = json.NewDecoder(r.Body).Decode(&body)
				if body.Operation == "composition.cancel" {
					_ = json.NewEncoder(w).Encode(Result{ArtifactID: id, Status: "cancelled"})
					return
				}
				w.WriteHeader(http.StatusUnprocessableEntity)
				_, _ = w.Write([]byte(tc.body))
			}))
			defer server.Close()
			client, err := New(server.URL, secret)
			if err != nil {
				t.Fatal(err)
			}
			_, err = client.Render(context.Background(), testOwner, id, nil)
			var failure *RequestFailure
			if !errors.As(err, &failure) || failure.ArtifactID != id || failure.StatusCode != 422 || failure.DiagnosticCause() != tc.want {
				t.Fatalf("rejection diagnostics changed: %v %+v", err, failure)
			}
			if err.Error() != "Studio composition request failed (HTTP 422)" {
				t.Fatalf("service diagnostic reached public error: %v", err)
			}
		})
	}
}
