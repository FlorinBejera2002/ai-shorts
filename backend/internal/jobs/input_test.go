package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/julienschmidt/httprouter"
)

func TestSourceValidationBlocksPrivateAndAmbiguousSources(t *testing.T) {
	ctx := context.Background()
	for _, ip := range []string{"127.0.0.1", "10.2.3.4", "169.254.169.254", "::1", "fc00::1", "100.64.0.2", "224.0.0.1"} {
		t.Run(ip, func(t *testing.T) {
			lookup := func(context.Context, string, string) ([]net.IP, error) {
				return []net.IP{net.ParseIP("8.8.8.8"), net.ParseIP(ip)}, nil
			}
			if err := ValidateSourceURL(ctx, lookup, "url", "https://example.invalid/video"); err == nil {
				t.Fatal("private address accepted")
			}
		})
	}
	lookup := func(context.Context, string, string) ([]net.IP, error) { return []net.IP{net.ParseIP("8.8.8.8")}, nil }
	for _, source := range []string{"file:///etc/passwd", "https://user:password@youtube.com/watch", "https://youtube.com.evil.invalid/watch"} {
		if err := ValidateSourceURL(ctx, lookup, "youtube", source); err == nil {
			t.Fatalf("accepted %s", source)
		}
	}
	if err := ValidateSourceURL(ctx, lookup, "youtube", "https://youtube.com/watch?v=test"); err != nil {
		t.Fatal(err)
	}
	in := CreateInput{Options: DefaultOptions(), SourceType: "youtube"}
	if in.Validate() == nil {
		t.Fatal("missing source accepted")
	}
	u, p := "https://youtube.com/watch?v=test", "uploads/user/test.mp4"
	in.SourceURL = &u
	in.SourceFilePath = &p
	if in.Validate() == nil {
		t.Fatal("ambiguous sources accepted")
	}
}

func TestDefaultsAndExplicitRenderingFlags(t *testing.T) {
	in := CreateInput{Options: DefaultOptions()}
	if err := json.Unmarshal([]byte(`{"source_type":"youtube","source_url":"https://youtube.com/watch?v=test","burn_subtitles":false,"smart_crop":false}`), &in); err != nil {
		t.Fatal(err)
	}
	if in.BurnSubtitles || in.SmartCrop || in.NumClips != 5 || in.AspectRatio != "9:16" {
		t.Fatal("rendering flags/defaults changed")
	}
}

type testAuth struct{ member bool }

func (a testAuth) Require(h http.HandlerFunc) http.Handler { return h }
func (a testAuth) RequireMember(h http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !a.member {
			w.WriteHeader(403)
			return
		}
		h(w, r)
	})
}
func (a testAuth) Limit(h http.HandlerFunc, _ string, _ int, _ time.Duration) http.HandlerFunc {
	return h
}

type testMedia struct{}

func (testMedia) ValidateUploadSource(context.Context, string, string) (string, error) {
	return "", errors.New("invalid owned upload")
}
func (testMedia) WorkerSource(context.Context, string) (string, error) {
	return "", errors.New("unavailable")
}
func TestHTTPRejectsViewerAndInvalidInputBeforeDatabase(t *testing.T) {
	for _, member := range []bool{false, true} {
		h := New(nil, testAuth{member}, testMedia{}, Config{})
		r := httprouter.New()
		h.Register(r)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest("POST", "/api/jobs", strings.NewReader(`{"source_type":"local","source_file_path":"/etc/passwd"}`)))
		want := 403
		if member {
			want = 400
		}
		if w.Code != want {
			t.Fatalf("got %d: %s", w.Code, w.Body.String())
		}
	}
	r := httprouter.New()
	New(nil, testAuth{true}, testMedia{}, Config{}).Register(r)
	for _, path := range []string{"/api/jobs/not-a-uuid", "/api/jobs/not-a-uuid/cancel"} {
		w := httptest.NewRecorder()
		method := "GET"
		if strings.HasSuffix(path, "cancel") {
			method = "POST"
		}
		r.ServeHTTP(w, httptest.NewRequest(method, path, nil))
		if w.Code != 400 {
			t.Fatal(w.Code)
		}
	}
}
