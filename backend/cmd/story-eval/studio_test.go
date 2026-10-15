package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/media"
	"sneepcut/backend-go/internal/processing"
)

func TestEvaluationMediaRequiresExactSignedLocalReference(t *testing.T) {
	dir := t.TempDir()
	storage, err := media.NewLocalStorage(filepath.Join(dir, "media"))
	if err != nil {
		t.Fatal(err)
	}
	defer storage.Close()
	source := filepath.Join(dir, "source.mp4")
	if err = os.WriteFile(source, []byte("evaluation fixture"), 0600); err != nil {
		t.Fatal(err)
	}
	if err = storage.Save(context.Background(), source, "sources/fixture.mp4", "video/mp4"); err != nil {
		t.Fatal(err)
	}
	secret := strings.Repeat("s", 32)
	expires := time.Now().Add(time.Minute).Unix()
	path := "/media/sources/fixture.mp4"
	signature := media.SignMediaPath(secret, path, expires)
	handler := evaluationMedia(storage, secret)
	for _, test := range []struct {
		path, sig string
		status    int
	}{{path, signature, 200}, {path, "invalid", 403}, {"/media/../source.mp4", signature, 403}, {"/media/sources/other.mp4", signature, 403}} {
		request := httptest.NewRequest(http.MethodGet, test.path+"?expires="+strconv.FormatInt(expires, 10)+"&sig="+test.sig, nil)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != test.status {
			t.Fatal(test, response.Code)
		}
	}
	if !data.ValidUUID(evaluationOwner) {
		t.Fatal("evaluation owner is not a Studio identity")
	}
}

func TestEvaluationRequiresStudioAndFixedLoopbackMediaListener(t *testing.T) {
	for _, address := range []string{"", "0.0.0.0:19000", "127.0.0.1:0", "127.0.0.1:00", "127.0.0.1:http", "192.0.2.1:19000"} {
		cfg := processing.Config{StudioURL: "http://localhost:5191", StudioSecret: strings.Repeat("s", 32), MediaSigningSecret: strings.Repeat("m", 32)}
		if stop, err := evaluationStudio(context.Background(), nil, cfg, func(string) string { return address }); err == nil {
			stop()
			t.Fatal("unsafe or unstable evaluation listener accepted", address)
		}
	}
}

func evaluationStudioTestEnvironment(t *testing.T) func(string) string {
	t.Helper()
	if os.Getenv("SNEEPCUT_TEST_STUDIO_EVALUATION") != "1" {
		t.Skip("requires a separate real Studio evaluation service: SNEEPCUT_TEST_STUDIO_EVALUATION=1 and STORY_EVAL_MEDIA_LISTEN")
	}
	for _, name := range []string{"STUDIO_AGENT_URL", "STUDIO_AGENT_SECRET", "STORY_EVAL_MEDIA_LISTEN", "INTERNAL_API_KEY"} {
		if os.Getenv(name) == "" {
			t.Fatalf("requested Studio evaluation fixture lacks %s", name)
		}
	}
	return func(name string) string {
		if strings.Contains(name, "GEMINI") || strings.Contains(name, "OPENROUTER") || name == "AI_PROVIDER" {
			return ""
		}
		return os.Getenv(name)
	}
}
