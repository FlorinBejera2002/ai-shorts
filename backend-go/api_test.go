package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func TestBoundedStrictJSON(t *testing.T) {
	for _, body := range []string{`{"admin":true}`, `{} {}`, strings.Repeat(" ", 65537) + `{}`} {
		p := defaults()
		r := httptest.NewRequest("POST", "/api/jobs", strings.NewReader(body))
		if decode(httptest.NewRecorder(), r, &p) == nil {
			t.Fatalf("accepted invalid body")
		}
	}
}
func TestMissingKeyFailsBeforeDatabase(t *testing.T) {
	a := &API{key: "secret"}
	w := httptest.NewRecorder()
	a.native(func(http.ResponseWriter, *http.Request, string) error { t.Fatal("called handler"); return nil })(w, httptest.NewRequest("GET", "/api/jobs", nil))
	if w.Code != 403 {
		t.Fatalf("status %d", w.Code)
	}
}
func TestUniqueIDs(t *testing.T) {
	seen := map[string]bool{}
	for range 1000 {
		id := newID()
		if !uuidPattern.MatchString(id) || seen[id] {
			t.Fatal("invalid ID")
		}
		seen[id] = true
	}
}

// Copy only table definitions from the disposable, Alembic-migrated integration
// database. Each invocation owns a fresh random schema and never mutates public.
func integration(t *testing.T) (*API, string, string) {
	t.Helper()
	raw := os.Getenv("SNEEPCUT_TEST_DATABASE_URL")
	if raw == "" {
		t.Skip("local disposable PostgreSQL required")
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	if (parsed.Hostname() != "127.0.0.1" && parsed.Hostname() != "localhost") || parsed.Path != "/sneepcut_integration_test" {
		t.Fatal("unsafe integration database")
	}
	admin, err := sql.Open("pgx", raw)
	if err != nil {
		t.Fatal(err)
	}
	schema := "test_go_" + strings.ReplaceAll(newID(), "-", "")
	if _, err = admin.Exec("CREATE SCHEMA " + schema); err != nil {
		t.Fatal(err)
	}
	for _, table := range []string{"users", "jobs", "job_deliveries", "account_deletion_requests"} {
		if _, err = admin.Exec("CREATE TABLE " + schema + "." + table + " (LIKE public." + table + " INCLUDING ALL)"); err != nil {
			t.Fatal(err)
		}
	}
	query := parsed.Query()
	query.Set("search_path", schema)
	parsed.RawQuery = query.Encode()
	db, err := sql.Open("pgx", parsed.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		db.Close()
		_, err := admin.Exec("DROP SCHEMA " + schema + " CASCADE")
		admin.Close()
		if err != nil {
			t.Error(err)
		}
	})
	user, other := newID(), newID()
	for _, id := range []string{user, other} {
		if _, err = db.Exec(`INSERT INTO users(id,email,provider,credits,plan) VALUES($1,$2,'credentials',100,'free')`, id, id+"@example.invalid"); err != nil {
			t.Fatal(err)
		}
	}
	return &API{db: db, key: "integration-only", mediaRoot: t.TempDir()}, user, other
}
func request(a *API, user, method, path, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.Header.Set("X-Internal-API-Key", a.key)
	r.Header.Set("X-User-Id", user)
	w := httptest.NewRecorder()
	target, _ := url.Parse("http://127.0.0.1:1")
	a.handler(target).ServeHTTP(w, r)
	return w
}
func balance(t *testing.T, a *API, user string) int {
	t.Helper()
	var value int
	if err := a.db.QueryRow(`SELECT credits FROM users WHERE id=$1`, user).Scan(&value); err != nil {
		t.Fatal(err)
	}
	return value
}
func TestNativeJobsAtomicityOwnershipAndCancellation(t *testing.T) {
	a, user, other := integration(t)
	dir := filepath.Join(a.mediaRoot, "uploads", user)
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	source := filepath.Join(dir, "fixture.mp4")
	if err := os.WriteFile(source, []byte("synthetic"), 0600); err != nil {
		t.Fatal(err)
	}
	bodyBytes, _ := json.Marshal(map[string]any{"source_type": "upload", "source_file_path": source, "burn_subtitles": false, "smart_crop": false, "include_brand": true, "language": "ro"})
	body := string(bodyBytes)
	first := request(a, user, "POST", "/api/jobs", body)
	if first.Code != 201 {
		t.Fatalf("create %d: %s", first.Code, first.Body.String())
	}
	var job map[string]any
	if err := json.Unmarshal(first.Body.Bytes(), &job); err != nil {
		t.Fatal(err)
	}
	id := job["id"].(string)
	if balance(t, a, user) != 50 {
		t.Fatal("incorrect debit")
	}
	var payload []byte
	if err := a.db.QueryRow(`SELECT payload FROM job_deliveries WHERE job_id=$1`, id).Scan(&payload); err != nil {
		t.Fatal(err)
	}
	var delivery map[string]any
	_ = json.Unmarshal(payload, &delivery)
	if delivery["source_type"] != "auto" || delivery["burn_subtitles"] != false || delivery["smart_crop"] != false {
		t.Fatalf("worker payload %s", payload)
	}
	if request(a, other, "GET", "/api/jobs/"+id, "").Code != 404 {
		t.Fatal("cross-owner read")
	}
	if request(a, other, "POST", "/api/jobs/"+id+"/cancel", "").Code != 404 {
		t.Fatal("cross-owner cancel")
	}
	var group sync.WaitGroup
	for range 8 {
		group.Add(1)
		go func() {
			defer group.Done()
			response := request(a, user, "POST", "/api/jobs/"+id+"/cancel", "")
			if response.Code != 200 {
				t.Errorf("cancel %d", response.Code)
			}
		}()
	}
	group.Wait()
	if balance(t, a, user) != 100 {
		t.Fatal("duplicate refund")
	}
	codes := make(chan int, 3)
	for range 3 {
		group.Add(1)
		go func() { defer group.Done(); codes <- request(a, user, "POST", "/api/jobs", body).Code }()
	}
	group.Wait()
	close(codes)
	success := 0
	for code := range codes {
		if code == 201 {
			success++
		} else if code != 402 {
			t.Fatalf("unexpected create code %d", code)
		}
	}
	if success != 2 || balance(t, a, user) != 0 {
		t.Fatal("overspent concurrent credits")
	}
	var count int
	if err := a.db.QueryRow(`SELECT count(*) FROM job_deliveries`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 3 {
		t.Fatalf("outbox %d", count)
	}
	list := request(a, user, "GET", "/api/jobs", "")
	if list.Code != 200 || strings.Contains(list.Body.String(), "active_edit_token") {
		t.Fatal("list contract")
	}
	hidden := filepath.Join(dir, ".fixture.mp4.part")
	_ = os.WriteFile(hidden, []byte("unscanned"), 0600)
	invalid := fmt.Sprintf(`{"source_type":"upload","source_file_path":%q}`, hidden)
	if request(a, user, "POST", "/api/jobs", invalid).Code != 400 {
		t.Fatal("quarantine bypass")
	}
}

func TestViewerCannotMutateContent(t *testing.T) {
	a, user, _ := integration(t)
	if _, err := a.db.Exec(`UPDATE users SET access_role='viewer' WHERE id=$1`, user); err != nil {
		t.Fatal(err)
	}
	if request(a, user, "GET", "/api/jobs", "").Code != 200 {
		t.Fatal("viewer read rejected")
	}
	if request(a, user, "POST", "/api/jobs", `{}`).Code != 403 {
		t.Fatal("viewer write accepted")
	}
	if balance(t, a, user) != 100 {
		t.Fatal("viewer charged")
	}
}
