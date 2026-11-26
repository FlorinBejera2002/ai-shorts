package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/julienschmidt/httprouter"
)

func TestInvalidAndAmbiguousLinkImportsAreRejectedBeforeDatabase(t *testing.T) {
	link := "https://youtube.com/watch?v=test"
	upload := "uploads/user/test.mp4"
	for _, in := range []CreateInput{
		{Options: DefaultOptions(), SourceType: "youtube", SourceURL: &link},
		{Options: DefaultOptions(), SourceType: "url", SourceURL: &link},
		{Options: DefaultOptions(), SourceType: "youtube"},
		{Options: DefaultOptions(), SourceType: "upload", SourceURL: &link, SourceStorageKey: &upload},
	} {
		if err := in.Validate(); err == nil {
			t.Fatalf("link source accepted: %+v", in)
		}
	}
	in := CreateInput{Options: DefaultOptions(), SourceType: "youtube"}
	if err := in.Validate(); err == nil {
		t.Fatal("missing YouTube URL was accepted")
	}
}

func TestYouTubePreparationCanonicalizesWithoutUploadScanner(t *testing.T) {
	link := "https://youtu.be/aqz-KE-bpKQ?si=tracking"
	in := CreateInput{Options: DefaultOptions(), SourceType: "youtube", SourceURL: &link}
	prepared, err := (&Handler{}).prepare(context.Background(), "owner", in)
	if err != nil || value(prepared.Input.SourceURL) != "https://www.youtube.com/watch?v=aqz-KE-bpKQ" || prepared.Input.SourceStorageKey != nil || prepared.WorkerSource != "" {
		t.Fatalf("unexpected YouTube preparation: %+v %v", prepared, err)
	}
	key := "uploads/owner/source.mp4"
	in.SourceStorageKey = &key
	if in.Validate() == nil {
		t.Fatal("mixed YouTube/upload source was accepted")
	}
}

func TestDefaultsAndExplicitRenderingFlags(t *testing.T) {
	in := CreateInput{Options: DefaultOptions()}
	if err := json.Unmarshal([]byte(`{"source_type":"upload","source_storage_key":"uploads/user/test.mp4","burn_subtitles":false,"smart_crop":false}`), &in); err != nil {
		t.Fatal(err)
	}
	if err := in.Validate(); err != nil {
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
		h := New(nil, testAuth{member}, testMedia{})
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
	New(nil, testAuth{true}, testMedia{}).Register(r)
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

func TestBatchEndpointStaysRemovedAndInvalidYouTubeIsRejected(t *testing.T) {
	r := httprouter.New()
	New(nil, testAuth{true}, testMedia{}).Register(r)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("POST", "/api/jobs/batch", strings.NewReader(`{"source_urls":["https://youtube.com/watch?v=test"]}`)))
	if w.Code != 404 {
		t.Fatalf("batch endpoint answered %d, want 404", w.Code)
	}
	w = httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("POST", "/api/jobs", strings.NewReader(`{"source_type":"youtube","source_url":"https://youtube.com/watch?v=test"}`)))
	if w.Code != 422 || !strings.Contains(w.Body.String(), "valid YouTube") {
		t.Fatalf("link create answered %d: %s", w.Code, w.Body.String())
	}
}

func TestUploadFlowReachesOwnershipValidation(t *testing.T) {
	h := New(nil, nil, testMedia{})
	key := "uploads/user/original.mp4"
	_, err := h.prepare(context.Background(), "user", CreateInput{SourceType: "upload", SourceStorageKey: &key})
	if err == nil || err.Error() != "invalid owned upload" {
		t.Fatalf("upload did not reach ownership validation: %v", err)
	}
}
