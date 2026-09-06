package clips

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/julienschmidt/httprouter"
)

func TestRecutValidationRetainsPlaybackOrderAndRejectsOverlap(t *testing.T) {
	p := RecutInput{[]Segment{{10, 12, 0}, {0, 2, 1}}}
	if err := p.Validate(); err != nil {
		t.Fatal(err)
	}
	if p.Segments[0].Start != 10 {
		t.Fatal("validation reordered user playback sequence")
	}
	for _, p := range []RecutInput{{}, {[]Segment{{0, 2, 0}}}, {[]Segment{{0, 3, 0}, {2, 4, 1}}}, {[]Segment{{-1, 4, 0}}}, {[]Segment{{0, .1, 0}, {1, 5, 1}}}} {
		if p.Validate() == nil {
			t.Fatal("invalid segments accepted", p)
		}
	}
	var missing RecutInput
	if json.Unmarshal([]byte(`{"segments":[{"end":5,"order":0}]}`), &missing) == nil {
		t.Fatal("missing required segment time accepted")
	}
}
func TestLibraryFiltersAreBoundedAndParameterized(t *testing.T) {
	q := ParseLibraryQuery(url.Values{"page": {"999999"}, "search": {"  x%_' OR true;  "}, "score": {"promising"}, "sort": {"DROP TABLE clips"}})
	if q.Page != 10000 || q.Search != "x%_' OR true;" || q.Sort != "newest" {
		t.Fatal(q)
	}
	where, order, args := librarySQL("owner", q)
	if strings.Contains(where, q.Search) || strings.Contains(order, "DROP") || len(args) != 2 || args[1] != q.Search {
		t.Fatal(where, order, args)
	}
}

type fakeAuth struct{ member bool }

func (a fakeAuth) Require(h http.HandlerFunc) http.Handler { return h }
func (a fakeAuth) RequireMember(h http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !a.member {
			w.WriteHeader(403)
			return
		}
		h(w, r)
	})
}
func (a fakeAuth) Limit(h http.HandlerFunc, _ string, _ int, _ time.Duration) http.HandlerFunc {
	return h
}

type fakeMedia struct {
	fail           bool
	keys, prefixes []string
}

func (m *fakeMedia) KeyFromReference(ref string) (string, error) {
	if strings.HasPrefix(ref, "/") {
		return "", errors.New("unrecognized")
	}
	return ref, nil
}
func (m *fakeMedia) SignedURL(_ context.Context, key string) (string, error) {
	return "https://media.example.invalid/" + key + "?fresh=true", nil
}
func (m *fakeMedia) Delete(_ context.Context, key string) error {
	if m.fail {
		return errors.New("storage down")
	}
	m.keys = append(m.keys, key)
	return nil
}
func (m *fakeMedia) DeletePrefix(_ context.Context, prefix string) error {
	if m.fail {
		return errors.New("storage down")
	}
	m.prefixes = append(m.prefixes, prefix)
	return nil
}
func TestHTTPClipMutationsRejectViewerAndMalformedInput(t *testing.T) {
	id := newID()
	for _, route := range []struct{ method, path, body string }{{"PATCH", "/api/clips/" + id, `{"title":"new"}`}, {"DELETE", "/api/clips/" + id, ""}, {"POST", "/api/clips/" + id + "/trim", `{"start_time":0,"end_time":4}`}, {"POST", "/api/clips/" + id + "/recut", `{"segments":[{"start":0,"end":4,"order":0}]}`}} {
		r := httprouter.New()
		New(nil, fakeAuth{}, &fakeMedia{}, Config{}).Register(r)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(route.method, route.path, strings.NewReader(route.body)))
		if w.Code != 403 {
			t.Fatalf("viewer %s: %d", route.path, w.Code)
		}
	}
	r := httprouter.New()
	New(nil, fakeAuth{true}, &fakeMedia{}, Config{}).Register(r)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("POST", "/api/clips/"+id+"/trim", strings.NewReader(`{"end_time":5}`)))
	if w.Code != 400 {
		t.Fatal(w.Code)
	}
	w = httptest.NewRecorder()
	req := httptest.NewRequest("PATCH", "/api/clips/"+id, strings.NewReader(`{"title":"ok","user_id":"other"}`))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	if w.Code != 400 {
		t.Fatal(w.Code)
	}
}
func TestReadRenewsStableMediaAndPreservesNulls(t *testing.T) {
	h := New(nil, fakeAuth{}, &fakeMedia{}, Config{})
	raw := []byte(`{"file_storage_key":"clips/job/f.mp4","file_url":"https://expired.invalid/f.mp4","thumbnail_storage_key":null,"thumbnail_path":null,"thumbnail_url":null,"source_storage_key":"sources/job/source.mp4","source_video_url":null,"caption_tiktok":"hello"}`)
	got, err := h.resolve(context.Background(), raw, false)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(got["file_url"].(string), "fresh=true") || got["thumbnail_url"] != nil || got["caption_tiktok"] != "hello" {
		t.Fatal(got)
	}
}
