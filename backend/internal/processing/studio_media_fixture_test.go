package processing

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/hex"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/story"
)

const studioMediaTestOwner = "c532c914-382d-4388-b03c-c6d71c99b563"

var studioMediaFixtures sync.Map

// Real media assertions use the actual Studio producer. They are an explicit
// integration lane because rendering now requires Bun and a browser as well as
// FFmpeg. No synthetic transport result can satisfy these pixel/audio checks.
func studioMediaFixture(t *testing.T, p *Processor) {
	t.Helper()
	if _, ok := studioMediaFixtures.Load(p); ok {
		return
	}
	if os.Getenv("SNEEPCUT_TEST_STUDIO_RENDER") != "1" {
		t.Skip("requires the real Studio integration lane: SNEEPCUT_TEST_STUDIO_RENDER=1, Bun, FFmpeg and Chrome")
	}
	root, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	const fixturePath = "editor/packages/sneepcut-server/verification/backend-render-fixture.ts"
	for {
		if _, err := os.Stat(filepath.Join(root, fixturePath)); err == nil {
			break
		}
		parent := filepath.Dir(root)
		if parent == root {
			t.Fatal("Studio fixture source was not found above the test working directory")
		}
		root = parent
	}
	bun := os.Getenv("SNEEPCUT_TEST_BUN")
	if bun == "" {
		bun = "bun"
	}
	if _, err := exec.LookPath(bun); err != nil {
		t.Fatalf("Studio integration was requested but Bun is unavailable: %v", err)
	}
	scratchRoot := filepath.Join(root, ".cache", "tmp")
	if err := os.MkdirAll(scratchRoot, 0700); err != nil {
		t.Fatal(err)
	}
	scratch, err := os.MkdirTemp(scratchRoot, "studio-media-test-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(scratch) })
	mediaServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || !strings.HasPrefix(r.URL.Path, "/media/") {
			http.NotFound(w, r)
			return
		}
		key := strings.TrimPrefix(r.URL.Path, "/media/")
		transfer, err := os.MkdirTemp(scratch, "asset-")
		if err != nil {
			http.Error(w, "fixture storage unavailable", http.StatusInternalServerError)
			return
		}
		defer os.RemoveAll(transfer)
		filename := filepath.Join(transfer, "source")
		if err := p.materialize(r.Context(), key, filename); err != nil {
			http.NotFound(w, r)
			return
		}
		http.ServeFile(w, r, filename)
	}))
	t.Cleanup(mediaServer.Close)
	var token [32]byte
	if _, err := rand.Read(token[:]); err != nil {
		t.Fatal(err)
	}
	secret := hex.EncodeToString(token[:])
	command := exec.Command(bun, filepath.Join(root, fixturePath))
	command.Dir = root
	command.Env = append(os.Environ(), "SNEEPCUT_TRUSTED_RENDER_FIXTURE=1", "STUDIO_FIXTURE_ROOT="+filepath.Join(scratch, "projects"), "STUDIO_FIXTURE_MEDIA_ORIGIN="+mediaServer.URL, "STUDIO_FIXTURE_SECRET="+secret, "HYPERFRAMES_NO_TELEMETRY=1", "TEMP="+scratch, "TMP="+scratch, "TMPDIR="+scratch)
	output, err := command.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	command.Stderr = os.Stderr
	if err := command.Start(); err != nil {
		t.Fatal(err)
	}
	finished := make(chan error, 1)
	go func() { finished <- command.Wait() }()
	var fixtureAddress string
	t.Cleanup(func() {
		defer studioMediaFixtures.Delete(p)
		if fixtureAddress != "" {
			ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
			defer cancel()
			request, err := http.NewRequestWithContext(ctx, http.MethodPost, fixtureAddress+"/__fixture/shutdown", nil)
			if err == nil {
				request.Header.Set("X-Studio-Fixture-Secret", secret)
				response, requestErr := http.DefaultClient.Do(request)
				err = requestErr
				if response != nil {
					_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
					_ = response.Body.Close()
					if response.StatusCode != http.StatusOK {
						t.Errorf("Studio fixture shutdown failed: HTTP %d", response.StatusCode)
					}
				}
			}
			if err != nil {
				t.Errorf("Studio fixture graceful shutdown failed: %v", err)
			}
		}
		select {
		case err := <-finished:
			if fixtureAddress != "" && err != nil {
				t.Errorf("Studio fixture exited unsuccessfully: %v", err)
			}
		case <-time.After(5 * time.Second):
			_ = command.Process.Kill()
			select {
			case <-finished:
			case <-time.After(5 * time.Second):
				t.Error("Studio fixture did not exit after forced cleanup")
			}
			if fixtureAddress != "" {
				t.Error("Studio fixture required forced termination after graceful shutdown")
			}
		}
	})
	ready := make(chan string, 1)
	go func() {
		defer close(ready)
		scanner := bufio.NewScanner(output)
		for scanner.Scan() {
			if address, ok := strings.CutPrefix(scanner.Text(), "STUDIO_FIXTURE_URL "); ok {
				ready <- address
			}
		}
	}()
	select {
	case address, ok := <-ready:
		if !ok {
			t.Fatal("Studio fixture exited before starting")
		}
		p.cfg.StudioURL, p.cfg.StudioSecret = address, secret
		fixtureAddress = address
		p.cfg.MediaOrigin, p.cfg.MediaSigningSecret = mediaServer.URL, secret
		studioMediaFixtures.Store(p, true)
	case <-time.After(30 * time.Second):
		t.Fatal("Studio fixture did not start")
	}
}

func renderStoryForTest(t *testing.T, p *Processor, ctx context.Context, request story.Request, version story.Version) (story.Output, error) {
	t.Helper()
	studioMediaFixture(t, p)
	if !data.ValidUUID(request.UserID) {
		request.UserID = studioMediaTestOwner
	}
	return p.RenderStory(ctx, request, version)
}

func renderClipForTest(t *testing.T, p *Processor, ctx context.Context, input RenderInput) (Clip, error) {
	t.Helper()
	studioMediaFixture(t, p)
	if !data.ValidUUID(input.UserID) {
		input.UserID = studioMediaTestOwner
	}
	return p.Render(ctx, input)
}
