package studiocomposition

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const testOwner = "11111111-1111-4111-8111-111111111111"

func TestCompositionClientSignsExactBodyPollsAndDownloads(t *testing.T) {
	secret := strings.Repeat("s", 32)
	id := Identity(testOwner, "clip", map[string]int{"version": 1})
	calls := []string{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		parts := strings.Split(r.Header.Get("X-Studio-Composition-Grant"), ":")
		if len(parts) != 3 || parts[0] != testOwner {
			t.Error("missing owner grant")
			w.WriteHeader(401)
			return
		}
		digest := sha256.Sum256(raw)
		mac := hmac.New(sha256.New, []byte(secret))
		_, _ = io.WriteString(mac, "composition\n"+testOwner+"\n"+parts[1]+"\n"+hex.EncodeToString(digest[:]))
		if parts[2] != hex.EncodeToString(mac.Sum(nil)) {
			t.Error("body was not authenticated")
		}
		var input struct {
			Operation string `json:"operation"`
			RequestID string `json:"request_id"`
		}
		if json.Unmarshal(raw, &input) != nil || input.RequestID != id || r.URL.Path != "/sneepcut/composition" {
			t.Error("wrong request contract")
		}
		calls = append(calls, input.Operation)
		if input.Operation == "composition.output" {
			_, _ = w.Write([]byte("video"))
			return
		}
		status := "rendering"
		if input.Operation == "composition.status" {
			status = "completed"
		}
		_ = json.NewEncoder(w).Encode(Result{ArtifactID: id, Status: status, Duration: 2, Width: 1920, Height: 1080, Size: 5})
	}))
	defer server.Close()
	c, err := New(server.URL, secret)
	if err != nil {
		t.Fatal(err)
	}
	c.poll = time.Millisecond
	result, err := c.Render(context.Background(), testOwner, id, map[string]any{"plan": map[string]int{"schema_version": 1}})
	if err != nil || result.Status != "completed" {
		t.Fatal(result, err)
	}
	file := filepath.Join(t.TempDir(), "output.mp4")
	if err = c.Download(context.Background(), testOwner, id, "video", file); err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(file)
	if string(raw) != "video" || strings.Join(calls, ",") != "composition.render,composition.status,composition.output" {
		t.Fatal(calls, string(raw))
	}
}

func TestCompositionClientRejectsRedirectIdentityAndUnverifiedOutput(t *testing.T) {
	for _, origin := range []string{"file:///tmp/studio", "https://user@studio", "https://studio/path", "https://studio?x=1"} {
		if _, err := New(origin, strings.Repeat("s", 32)); err == nil {
			t.Fatal(origin)
		}
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, "http://127.0.0.1/foreign", 302) }))
	defer server.Close()
	c, _ := New(server.URL, strings.Repeat("s", 32))
	if _, err := c.Render(context.Background(), testOwner, Identity(testOwner, "x", nil), nil); err == nil {
		t.Fatal("redirect allowed")
	}
	if _, err := c.Render(context.Background(), "foreign", Identity(testOwner, "x", nil), nil); err == nil {
		t.Fatal("invalid owner")
	}
}

func TestCompositionIdentityIsStableAndOwnerScoped(t *testing.T) {
	a := Identity(testOwner, "story/version/2", map[string]int{"cut": 3})
	if a != Identity(testOwner, "story/version/2", map[string]int{"cut": 3}) || a == Identity(testOwner, "story/version/3", map[string]int{"cut": 3}) || a == Identity("22222222-2222-4222-8222-222222222222", "story/version/2", map[string]int{"cut": 3}) {
		t.Fatal("composition replay identity collision")
	}
}
