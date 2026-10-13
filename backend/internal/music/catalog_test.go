package music

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/julienschmidt/httprouter"
)

const testPieces = `[
 {"title":"Quiet &amp; Calm","filename":"Quiet Calm.mp3","length":"00:02:15","genre":"22","bpm":"90","feel":"Calming, Relaxed","isrc":"USUAN2600001","description":"Acoustic piano","instruments":"Piano"},
 {"title":"Dance","filename":"Dance.mp3","length":"03:01","genre":7,"bpm":120,"feel":"Driving, Grooving","isrc":"USUAN2600002"},
 {"title":"Undated","filename":"Undated.mp3","length":"00:00:30","genre":null,"bpm":null,"feel":""}
]`
const testGenres = `[{"id":22,"genre":"Soundtrack"},{"id":7,"genre":"Electronica"}]`

type transportFunc func(*http.Request) (*http.Response, error)

func (f transportFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func response(body, contentType string) *http.Response {
	return &http.Response{StatusCode: http.StatusOK, Header: http.Header{"Content-Type": []string{contentType}}, Body: io.NopCloser(strings.NewReader(body)), ContentLength: int64(len(body))}
}

func testCatalog() *Catalog {
	c := NewCatalog()
	c.client.Transport = transportFunc(func(r *http.Request) (*http.Response, error) {
		switch r.URL.Path {
		case "/music/royalty-free/pieces.json":
			return response(testPieces, "application/json"), nil
		case "/music/royalty-free/genre.json":
			return response(testGenres, "application/json"), nil
		default:
			return response("ID3test-audio", "audio/mpeg"), nil
		}
	})
	return c
}

func TestSearchParsesLiveProviderSchemaAndPreservesCredits(t *testing.T) {
	c := testCatalog()
	result, err := c.Search(context.Background(), "calming piano", 1, 24)
	if err != nil || result.Total != 1 || len(result.Tracks) != 1 {
		t.Fatalf("search=%+v error=%v", result, err)
	}
	track := result.Tracks[0]
	if track.ID != "incompetech:USUAN2600001" || track.Title != "Quiet & Calm" || track.DurationSeconds != 135 || track.BPM != 90 || track.Genres[0] != "Soundtrack" {
		t.Fatalf("track=%+v", track)
	}
	if !strings.HasSuffix(track.PreviewURL, "Quiet%20Calm.mp3") {
		t.Fatalf("unsafe filename URL: %s", track.PreviewURL)
	}
	for _, required := range []string{track.Title, track.Artist, track.SourceURL, track.LicenseURL, "Adapted"} {
		if !strings.Contains(track.Attribution, required) {
			t.Errorf("missing credit %q", required)
		}
	}
	track.Genres[0] = "Mutated"
	again, err := c.Get(context.Background(), track.ID)
	if err != nil || again.Genres[0] != "Soundtrack" {
		t.Fatalf("callers can mutate cache: %+v %v", again, err)
	}
	first, _ := c.Search(context.Background(), "", 1, 2)
	last, _ := c.Search(context.Background(), "", 2, 2)
	if first.Total != 3 || !first.HasMore || len(last.Tracks) != 1 || last.HasMore {
		t.Fatalf("invalid pagination %+v %+v", first, last)
	}
	if !validID(last.Tracks[0].ID) {
		t.Errorf("missing-ISRC fallback invalid: %s", last.Tracks[0].ID)
	}
	missing, _ := c.Search(context.Background(), "", 100000, 50)
	if len(missing.Tracks) != 0 || missing.HasMore {
		t.Fatalf("invalid empty page: %+v", missing)
	}
}

func TestCatalogRejectsInvalidInputBeforeNetwork(t *testing.T) {
	c := NewCatalog()
	c.client.Transport = transportFunc(func(*http.Request) (*http.Response, error) { t.Fatal("unexpected network request"); return nil, nil })
	for _, id := range []string{"https://example.com/track.mp3", "incompetech:../file", "incompetech:abc?x", "incompetech:"} {
		if _, err := c.Get(context.Background(), id); !errors.Is(err, ErrInvalid) {
			t.Errorf("id=%q error=%v", id, err)
		}
	}
	for _, params := range [][2]int{{-1, 24}, {1, 51}, {100001, 24}} {
		if _, err := c.Search(context.Background(), "", params[0], params[1]); !errors.Is(err, ErrInvalid) {
			t.Errorf("params=%v error=%v", params, err)
		}
	}
}

func TestCatalogueRefreshCoalescesConcurrentReaders(t *testing.T) {
	c := testCatalog()
	base := c.client.Transport
	var calls atomic.Int32
	c.client.Transport = transportFunc(func(r *http.Request) (*http.Response, error) {
		calls.Add(1)
		time.Sleep(5 * time.Millisecond)
		return base.RoundTrip(r)
	})
	var wg sync.WaitGroup
	for range 30 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			result, err := c.Search(context.Background(), "", 1, 24)
			if err != nil || result.Total != 3 {
				t.Errorf("search=%+v %v", result, err)
			}
		}()
	}
	wg.Wait()
	if calls.Load() != 2 {
		t.Fatalf("expected one pair of metadata requests, got %d", calls.Load())
	}
	if _, err := c.Get(context.Background(), "incompetech:unknown"); !errors.Is(err, ErrNotFound) {
		t.Errorf("missing error: %v", err)
	}
}

func TestFailedRefreshUsesRecentCacheAndBacksOff(t *testing.T) {
	c := testCatalog()
	now := time.Now()
	c.now = func() time.Time { return now }
	if _, err := c.Search(context.Background(), "", 1, 24); err != nil {
		t.Fatal(err)
	}
	var calls int
	c.client.Transport = transportFunc(func(*http.Request) (*http.Response, error) { calls++; return nil, errors.New("offline") })
	now = now.Add(7 * time.Hour)
	for range 2 {
		result, err := c.Search(context.Background(), "", 1, 24)
		if err != nil || result.Total != 3 {
			t.Fatalf("recent cache unavailable %+v %v", result, err)
		}
	}
	if calls != 1 {
		t.Fatalf("outage retry hammered provider %d", calls)
	}
	now = now.Add(18 * time.Hour)
	if _, err := c.Search(context.Background(), "", 1, 24); err == nil {
		t.Fatal("served indefinitely stale catalogue")
	}
}

func TestWaitingReaderRespectsCancellation(t *testing.T) {
	c := testCatalog()
	c.loading = make(chan struct{})
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := c.Search(ctx, "", 1, 24); !errors.Is(err, context.Canceled) {
		t.Fatalf("got %v", err)
	}
}

func TestMalformedMetadataAndPathInjection(t *testing.T) {
	for _, body := range []string{`[]`, `{}`, `[{"title":false}]`, testPieces + `{}`, `[{"title":"Bad","filename":"../private.mp3","length":"00:01:00","isrc":"BAD"}]`} {
		t.Run(body[:min(len(body), 20)], func(t *testing.T) {
			c := testCatalog()
			c.client.Transport = transportFunc(func(*http.Request) (*http.Response, error) { return response(body, "application/json"), nil })
			if _, err := c.Search(context.Background(), "", 1, 24); err == nil {
				t.Fatal("accepted malformed metadata")
			}
		})
	}
	for _, filename := range []string{"../track.mp3", "C:\\track.mp3", "%2ftrack.mp3", "song.mp3?download=1", "song\n.mp3", "file.wav"} {
		if _, ok := makeTrack(providerPiece{Title: "Track", Filename: filename, Length: "00:01:00"}, nil); ok {
			t.Errorf("accepted filename %q", filename)
		}
	}
	c := testCatalog()
	c.metadataLimit = 10
	if _, err := c.Search(context.Background(), "", 1, 24); err == nil {
		t.Fatal("accepted oversized metadata")
	}
}

func TestDownloadOnlySelectedTrackAndCleanup(t *testing.T) {
	c := testCatalog()
	directory := t.TempDir()
	destination := filepath.Join(directory, "selected.mp3")
	track, err := c.Download(context.Background(), "incompetech:USUAN2600001", destination)
	if err != nil || track.ID != "incompetech:USUAN2600001" {
		t.Fatalf("download %+v %v", track, err)
	}
	data, err := os.ReadFile(destination)
	if err != nil || string(data) != "ID3test-audio" {
		t.Fatalf("unexpected file %q %v", data, err)
	}
	for _, test := range []struct {
		name, body, kind string
		limit            int64
	}{
		{"html", "<html>Oops</html>", "text/html", 100},
		{"fake mp3", "<html>Oops</html>", "audio/mpeg", 100},
		{"oversized", "ID3toolarge", "audio/mpeg", 5},
		{"truncated", "I", "audio/mpeg", 100},
	} {
		t.Run(test.name, func(t *testing.T) {
			c.audioLimit = test.limit
			c.client.Transport = transportFunc(func(*http.Request) (*http.Response, error) {
				r := response(test.body, test.kind)
				r.ContentLength = -1
				return r, nil
			})
			if _, err := c.Download(context.Background(), track.ID, filepath.Join(directory, "bad.mp3")); err == nil {
				t.Fatal("download should fail")
			}
			files, _ := os.ReadDir(directory)
			if len(files) != 1 {
				t.Fatalf("partial downloads left behind: %v", files)
			}
		})
	}
}

func TestRedirectRejectsUnapprovedHostsAndSchemes(t *testing.T) {
	for _, target := range []string{"http://incompetech.com/music/royalty-free/pieces.json", "https://127.0.0.1/music/royalty-free/pieces.json", "https://evil.example/music/royalty-free/pieces.json", "https://incompetech.com:443/music/royalty-free/pieces.json", "https://incompetech.com/private"} {
		t.Run(target, func(t *testing.T) {
			c := NewCatalog()
			var calls int
			c.client.Transport = transportFunc(func(*http.Request) (*http.Response, error) {
				calls++
				r := response("", "text/plain")
				r.StatusCode = http.StatusFound
				r.Header.Set("Location", target)
				return r, nil
			})
			if _, err := c.Search(context.Background(), "", 1, 24); err == nil {
				t.Fatal("accepted redirect")
			}
			if calls != 1 {
				t.Fatalf("followed forbidden redirect %d", calls)
			}
		})
	}
}

type testAuthorizer struct{ allowed bool }

func (a testAuthorizer) Require(next http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !a.allowed {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		next(w, r)
	})
}
func (a testAuthorizer) Limit(next http.HandlerFunc, _ string, _ int, _ time.Duration) http.HandlerFunc {
	return next
}

func TestMusicHTTPContracts(t *testing.T) {
	for _, test := range []struct {
		path     string
		allowed  bool
		status   int
		contains string
	}{
		{"/api/music", false, 401, ""},
		{"/api/music?query=calming&page=1&limit=24", true, 200, `"total":1`},
		{"/api/music?limit=51", true, 400, ""},
		{"/api/music?page=no", true, 400, ""},
		{"/api/music?page=0", true, 400, ""},
		{"/api/music/incompetech:USUAN2600002", true, 200, `"title":"Dance"`},
		{"/api/music/incompetech:absent", true, 404, ""},
		{"/api/music/external:abc", true, 400, ""},
	} {
		t.Run(test.path, func(t *testing.T) {
			router := httprouter.New()
			NewHandler(testCatalog(), testAuthorizer{test.allowed}).Register(router)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, test.path, nil))
			if w.Code != test.status || !strings.Contains(w.Body.String(), test.contains) {
				t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
			}
		})
	}
}
