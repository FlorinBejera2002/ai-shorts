package workspaceagent

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestStudioClientBindsGrantToExactBodyAndUser(t *testing.T) {
	secret := strings.Repeat("s", 32)
	user := "11111111-1111-4111-8111-111111111111"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/sneepcut/agent" || r.Method != "POST" {
			t.Errorf("untyped request: %s %s", r.Method, r.URL.Path)
		}
		raw, _ := io.ReadAll(r.Body)
		parts := strings.Split(r.Header.Get("X-Studio-Agent-Grant"), ":")
		if len(parts) != 3 || parts[0] != user {
			t.Fatal("missing scoped grant")
		}
		digest := sha256.Sum256(raw)
		signature := hmac.New(sha256.New, []byte(secret))
		signature.Write([]byte(user + "\n" + parts[1] + "\n" + hex.EncodeToString(digest[:])))
		if parts[2] != hex.EncodeToString(signature.Sum(nil)) {
			t.Error("body signature mismatch")
		}
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{"projects":[]}`)
	}))
	defer server.Close()
	client, err := NewStudioClient(server.URL, secret)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = client.call(context.Background(), user, "", Action{Name: "studio.list", Input: json.RawMessage(`{}`)}); err != nil {
		t.Fatal(err)
	}
}
func TestStudioClientRejectsConfigurationAndRedirects(t *testing.T) {
	for _, origin := range []string{"file:///tmp", "http://name:password@localhost", "http://localhost/arbitrary", "http://localhost?secret=x"} {
		if _, err := NewStudioClient(origin, strings.Repeat("s", 32)); err == nil {
			t.Fatalf("unsafe config accepted: %s", origin)
		}
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, "http://private.invalid", 302) }))
	defer server.Close()
	client, _ := NewStudioClient(server.URL, strings.Repeat("s", 32))
	if _, err := client.call(context.Background(), "11111111-1111-4111-8111-111111111111", "", Action{Name: "studio.list", Input: json.RawMessage(`{}`)}); err == nil {
		t.Fatal("redirect accepted")
	}
}
func TestStudioRenderReceiptAndArtifactVerification(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		io.WriteString(w, `{"status":"complete","verified":false,"bytes":0}`)
	}))
	defer server.Close()
	client, _ := NewStudioClient(server.URL, strings.Repeat("s", 32))
	e := &PlatformExecutor{studio: client}
	previous := ActionResult{Pending: true, Data: json.RawMessage(`{"id":"11111111-1111-4111-8111-111111111111","job_id":"11111111-1111-4111-8111-111111111111_job","expected_version":"version"}`)}
	if _, err := e.studioPoll(context.Background(), "11111111-1111-4111-8111-111111111111", previous); err == nil {
		t.Fatal("unverified empty render accepted")
	}
	if _, err := studioRenderAction(ActionResult{}, "studio.render_cancel"); err == nil {
		t.Fatal("missing receipt accepted")
	}
}
