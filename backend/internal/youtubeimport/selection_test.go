package youtubeimport

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"sneepcut/backend-go/internal/identity"
	"sneepcut/backend-go/internal/jobs"
	"sneepcut/backend-go/internal/youtubechannel"
)

const (
	selectedID   = "_6f6RnHmde0"
	unselectedID = "abcdefghijk"
)

type fakeChannel struct {
	videos []youtubechannel.Video
	err    error
	calls  int
}

func (f *fakeChannel) LookupVideos(context.Context, string, []string) ([]youtubechannel.Video, error) {
	f.calls++
	return f.videos, f.err
}

type fakeQueue struct {
	precheckErr error
	createErr   error
	created     []string
}

func (q *fakeQueue) Precheck(context.Context, string, jobs.Options, int) error {
	return q.precheckErr
}

func (q *fakeQueue) CreateTx(_ context.Context, _ *sql.Tx, _ string, sourceKey string, _ jobs.Options) (string, error) {
	if q.createErr != nil {
		return "", q.createErr
	}
	q.created = append(q.created, sourceKey)
	return "job-" + sourceKey, nil
}

func selectionHandler(t *testing.T, channel ChannelVideos, queue SelectionJobs) *Handler {
	t.Helper()
	return &Handler{cfg: Config{Enabled: true}, channel: channel, queue: queue}
}

func selectionPost(body string) *http.Request {
	r := httptest.NewRequest(http.MethodPost, "/api/youtube/imports/selection", strings.NewReader(body))
	user := identity.User{ID: "owner", AccessRole: "member", SessionVersion: 1}
	return r.WithContext(identity.WithPrincipal(r.Context(), identity.AuthResponse{User: user}))
}

func TestSelectionRejectsInvalidRequestsBeforeGoogle(t *testing.T) {
	publicVideo := youtubechannel.Video{ID: selectedID, Visibility: youtubechannel.VisibilityPublic}
	privateVideo := youtubechannel.Video{ID: selectedID, Visibility: youtubechannel.VisibilityPrivate}
	tests := []struct {
		name     string
		body     string
		channel  *fakeChannel
		queue    *fakeQueue
		status   int
		videoIDs []string
	}{
		{name: "no videos", body: `{"video_ids":[],"consent":true}`, status: http.StatusBadRequest},
		{name: "too many videos", body: `{"video_ids":["a","b","c","d","e","f","g","h","i","j","k"],"consent":true}`, status: http.StatusBadRequest},
		{name: "malformed id", body: `{"video_ids":["not-an-id"],"consent":true}`, status: http.StatusBadRequest},
		{name: "duplicate id", body: `{"video_ids":["` + selectedID + `","` + selectedID + `"],"consent":true}`, status: http.StatusBadRequest},
		{name: "no consent", body: `{"video_ids":["` + selectedID + `"],"consent":false}`, status: http.StatusBadRequest},
		{name: "source fields are unknown", body: `{"video_ids":["` + selectedID + `"],"consent":true,"source_url":"https://example.com"}`, status: http.StatusBadRequest},
		{name: "job options reject source fields", body: `{"video_ids":["` + selectedID + `"],"consent":true,"job":{"source_type":"upload"}}`, status: http.StatusUnprocessableEntity},
		{name: "job options out of range", body: `{"video_ids":["` + selectedID + `"],"consent":true,"job":{"num_clips_requested":31,"aspect_ratio":"9:16","subtitle_style":"default"}}`, status: http.StatusUnprocessableEntity},
		{name: "credits short", body: `{"video_ids":["` + selectedID + `"],"consent":true}`, queue: &fakeQueue{precheckErr: jobs.ErrCredits}, status: http.StatusPaymentRequired},
		{name: "video not on channel", body: `{"video_ids":["` + selectedID + `"],"consent":true}`, channel: &fakeChannel{}, status: http.StatusUnprocessableEntity, videoIDs: []string{selectedID}},
		{name: "private video", body: `{"video_ids":["` + selectedID + `"],"consent":true}`, channel: &fakeChannel{videos: []youtubechannel.Video{privateVideo}}, status: http.StatusUnprocessableEntity, videoIDs: []string{selectedID}},
		{name: "channel not connected", body: `{"video_ids":["` + selectedID + `"],"consent":true}`, channel: &fakeChannel{err: youtubechannel.ErrNotConnected}, status: http.StatusConflict},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			channel := test.channel
			if channel == nil {
				channel = &fakeChannel{videos: []youtubechannel.Video{publicVideo}}
			}
			queue := test.queue
			if queue == nil {
				queue = &fakeQueue{}
			}
			h := selectionHandler(t, channel, queue)
			response := httptest.NewRecorder()
			h.selectionImport(response, selectionPost(test.body))
			if response.Code != test.status {
				t.Fatalf("status %d, want %d: %s", response.Code, test.status, response.Body.String())
			}
			if test.videoIDs != nil {
				var body struct {
					Error    string   `json:"error"`
					VideoIDs []string `json:"video_ids"`
				}
				if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil || body.Error == "" || len(body.VideoIDs) != 1 || body.VideoIDs[0] != test.videoIDs[0] {
					t.Fatalf("rejection body %s", response.Body.String())
				}
			}
			if test.name == "job options out of range" || test.name == "job options reject source fields" || test.name == "credits short" {
				if channel.calls != 0 {
					t.Fatal("channel was consulted before the job options or credits were checked")
				}
			}
		})
	}
}

func TestSelectionRequiresEnabledImport(t *testing.T) {
	h := &Handler{cfg: Config{Enabled: false}, channel: &fakeChannel{}, queue: &fakeQueue{}}
	response := httptest.NewRecorder()
	h.selectionImport(response, selectionPost(`{"video_ids":["`+selectedID+`"],"consent":true}`))
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("disabled import returned %d", response.Code)
	}
}

func TestClassifySelectionKeepsRequestOrderAndRejectsOffChannelAndPrivate(t *testing.T) {
	videos := []youtubechannel.Video{
		{ID: "one-aaaaaaa", Visibility: youtubechannel.VisibilityUnlisted},
		{ID: "two-bbbbbbb", Visibility: youtubechannel.VisibilityPrivate},
		{ID: "six-fffffff", Visibility: youtubechannel.VisibilityPublic},
	}
	picked, rejected := classifySelection([]string{"six-fffffff", "two-bbbbbbb", "one-aaaaaaa", "zzz-off-chan"}, videos)
	if len(picked) != 2 || picked[0].ID != "six-fffffff" || picked[1].ID != "one-aaaaaaa" {
		t.Fatalf("picked %+v", picked)
	}
	if len(rejected) != 2 || rejected[0] != "two-bbbbbbb" || rejected[1] != "zzz-off-chan" {
		t.Fatalf("rejected %v", rejected)
	}
}

// selectionArchive has a metadata CSV with two videos. Only the first is chosen.
func selectionArchive(t *testing.T) map[string][]byte {
	t.Helper()
	video := "\x00\x00\x00\x18ftypmp42selection-video"
	metadata := "Video ID,Video Title (Original)\n" + selectedID + ",Chosen talk\n" + unselectedID + ",Other talk\n"
	return map[string][]byte{
		"/export/selected.zip": fixtureZIP(t,
			archiveEntry{name: "Takeout/YouTube/videos.csv", data: metadata},
			archiveEntry{name: "Takeout/YouTube/videos/" + selectedID + ".mp4", data: video},
			archiveEntry{name: "Takeout/YouTube/videos/Other talk.mp4", data: video},
		),
	}
}

func TestSelectedImportReadsOnlyChosenVideosFromMetadata(t *testing.T) {
	client := archiveFixtureClient(t, selectionArchive(t))
	plan := newSelectionPlan([]*selectedVideo{{videoID: selectedID, title: "Chosen talk", status: selectionWaiting}})
	var seen []string
	var emitted []string
	err := client.ImportArchivesSelected(context.Background(), []string{"https://storage.googleapis.com/export/selected.zip?signature=synthetic"}, t.TempDir(), ArchiveLimits{}, selectorFunc(func(video ImportedVideo) bool {
		seen = append(seen, video.VideoID+"|"+video.Title)
		return plan.wants(video)
	}), func(_ context.Context, video ImportedVideo) error {
		emitted = append(emitted, video.VideoID)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(emitted) != 1 || emitted[0] != selectedID {
		t.Fatalf("only the chosen video should be copied, emitted %v", emitted)
	}
	if len(seen) != 2 {
		t.Fatalf("filter should see every archive video's metadata, saw %v", seen)
	}
}

// selectorFunc adapts a keep-function to VideoSelector for tests that need no
// preparation step.
type selectorFunc func(ImportedVideo) bool

func (selectorFunc) Prepare(context.Context, []ImportedVideo) error { return nil }

func (f selectorFunc) Wants(video ImportedVideo) bool { return f(video) }

func TestAmbiguousTitleFailsChosenItemBeforeAnyCopy(t *testing.T) {
	duplicates := "Video ID,Video Title (Original)\naaaaaaaaaaa,Same title\nbbbbbbbbbbb,Same title\n"
	client := archiveFixtureClient(t, map[string][]byte{
		"/export/dup.zip": fixtureZIP(t,
			archiveEntry{name: "Takeout/YouTube/videos.csv", data: duplicates},
			archiveEntry{name: "Takeout/YouTube/videos/Same title.mp4", data: "\x00\x00\x00\x18ftypmp42dup"},
		),
	})
	h, mock := mockHandler(t, client)
	work := importWork{ID: "import", UserID: "owner", Lease: "lease"}
	item := &selectedVideo{videoID: "aaaaaaaaaaa", title: "Same title", status: selectionWaiting}
	selector := &selectionSelector{handler: h, work: work, plan: newSelectionPlan([]*selectedVideo{item})}
	mock.ExpectExec(regexp.QuoteMeta("UPDATE youtube_import_selections SET status='failed'")).WithArgs("import", "aaaaaaaaaaa", selectionAmbiguous).WillReturnResult(sqlmock.NewResult(0, 1))

	err := client.ImportArchivesSelected(context.Background(), []string{"https://storage.googleapis.com/export/dup.zip?signature=synthetic"}, t.TempDir(), ArchiveLimits{}, selector, func(_ context.Context, video ImportedVideo) error {
		t.Errorf("ambiguous file was copied: %+v", video)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if item.status != selectionFailed || item.errorText != selectionAmbiguous {
		t.Fatalf("chosen item should fail as ambiguous, got %+v", item)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

// A title ending in an 11-letter word must not be read as a YouTube id.
func TestTitleEndingInElevenLetterWordMatchesByTitle(t *testing.T) {
	const title = "Growing Up Our Development"
	metadata := "Video ID,Video Title (Original)\n" + selectedID + "," + title + "\n"
	client := archiveFixtureClient(t, map[string][]byte{
		"/export/words.zip": fixtureZIP(t,
			archiveEntry{name: "Takeout/YouTube/videos.csv", data: metadata},
			archiveEntry{name: "Takeout/YouTube/videos/" + title + ".mp4", data: "\x00\x00\x00\x18ftypmp42words"},
		),
	})
	plan := newSelectionPlan([]*selectedVideo{{videoID: selectedID, title: title, status: selectionWaiting}})
	var emitted []ImportedVideo
	err := client.ImportArchivesSelected(context.Background(), []string{"https://storage.googleapis.com/export/words.zip?signature=synthetic"}, t.TempDir(), ArchiveLimits{}, selectorFunc(plan.wants), func(_ context.Context, video ImportedVideo) error {
		emitted = append(emitted, video)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(emitted) != 1 || emitted[0].VideoID != selectedID || emitted[0].Title != title {
		t.Fatalf("title match was not used, emitted %+v", emitted)
	}
}

func TestPlanMatchesWaitingItemsOnly(t *testing.T) {
	done := &selectedVideo{videoID: selectedID, title: "Chosen talk", status: selectionProcessing}
	waiting := &selectedVideo{videoID: unselectedID, title: "Other talk", status: selectionWaiting}
	plan := newSelectionPlan([]*selectedVideo{done, waiting})
	if plan.wants(ImportedVideo{VideoID: selectedID}) {
		t.Fatal("a video whose job already exists must not be read again")
	}
	item, failing := plan.match(ImportedVideo{VideoID: unselectedID})
	if item != waiting || failing != nil {
		t.Fatalf("waiting item not matched: %v %v", item, failing)
	}
	if plan.wants(ImportedVideo{VideoID: "zzzzzzzzzzz"}) {
		t.Fatal("an unchosen video must not be read")
	}
}

// expectSelectionStatus returns the item status row that a locked selection read yields.
func expectSelectionStatus(mock sqlmock.Sqlmock, status string, jobID sql.NullString) {
	value := any(nil)
	if jobID.Valid {
		value = jobID.String
	}
	mock.ExpectQuery(regexp.QuoteMeta("SELECT status,job_id FROM youtube_import_selections")).WithArgs("import", unselectedID).WillReturnRows(sqlmock.NewRows([]string{"status", "job_id"}).AddRow(status, value))
}

func TestSelectionJobIsQueuedOnceAcrossRetries(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	queue := &fakeQueue{}
	h := &Handler{db: db, queue: queue}
	work := importWork{ID: "import", UserID: "owner", Lease: "lease"}

	mock.ExpectBegin()
	expectActiveUser(mock)
	expectSelectionStatus(mock, selectionImporting, sql.NullString{})
	mock.ExpectExec(regexp.QuoteMeta("UPDATE youtube_import_selections SET status='processing'")).WithArgs("import", unselectedID, "job-key").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	mock.ExpectBegin()
	expectActiveUser(mock)
	expectSelectionStatus(mock, selectionProcessing, sql.NullString{String: "job-key", Valid: true})
	mock.ExpectRollback()

	options := jobs.DefaultOptions()
	for attempt := 0; attempt < 2; attempt++ {
		if err := h.createSelectionJob(context.Background(), work, unselectedID, "key", options); err != nil {
			t.Fatalf("attempt %d: %v", attempt, err)
		}
	}
	if len(queue.created) != 1 {
		t.Fatalf("a retry queued a second job: %v", queue.created)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestSelectionJobCreditFailureMarksItemFailed(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	h := &Handler{db: db, queue: &fakeQueue{createErr: jobs.ErrCredits}}
	work := importWork{ID: "import", UserID: "owner", Lease: "lease"}

	mock.ExpectBegin()
	expectActiveUser(mock)
	expectSelectionStatus(mock, selectionImporting, sql.NullString{})
	mock.ExpectRollback()
	mock.ExpectExec(regexp.QuoteMeta("UPDATE youtube_import_selections SET status='failed'")).WithArgs("import", unselectedID, jobs.ErrCredits.Error()).WillReturnResult(sqlmock.NewResult(0, 1))

	if err := h.createSelectionJob(context.Background(), work, unselectedID, "key", jobs.DefaultOptions()); err != nil {
		t.Fatalf("credit failure should be recorded on the item, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestFinishSelectionMarksMissingVideos(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	h := &Handler{db: db, queue: &fakeQueue{}}
	work := importWork{ID: "import", UserID: "owner", Lease: "lease"}

	mock.ExpectExec(regexp.QuoteMeta("UPDATE youtube_import_selections SET status='missing'")).WithArgs("import", selectionNotFound).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT video_id,source_storage_key FROM youtube_import_selections")).WithArgs("import").WillReturnRows(sqlmock.NewRows([]string{"video_id", "source_storage_key"}))

	if err := h.finishSelection(context.Background(), work); err != nil {
		t.Fatal(err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

// selectionOptionsJSON is the stored clip options of a selected import.
func selectionOptionsJSON(t *testing.T) []byte {
	t.Helper()
	raw, err := json.Marshal(jobs.DefaultOptions())
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

// A selected import whose archive cannot be read must leave no video waiting or
// importing: the stored video without a job gets its queueing attempt and the
// waiting one fails as unfinished, all before the import row is finished.
func TestFailedArchiveReadLeavesNoSelectedVideoWaitingOrImporting(t *testing.T) {
	client := archiveFixtureClient(t, map[string][]byte{})
	h, mock := mockHandler(t, client)
	queue := &fakeQueue{}
	h.queue = queue
	work := importWork{ID: "import", UserID: "owner", Lease: "lease", Status: "importing", Selected: true, CreatedAt: time.Now()}

	mock.ExpectQuery(regexp.QuoteMeta("SELECT video_id,title,status,source_storage_key")).WithArgs("import").WillReturnRows(
		sqlmock.NewRows([]string{"video_id", "title", "status", "source_storage_key", "job_id", "error"}).
			AddRow(selectedID, "Chosen talk", selectionWaiting, "", "", "").
			AddRow(unselectedID, "Other talk", selectionImporting, "key", "", ""))
	if err := h.importVideos(context.Background(), work, []string{"https://storage.googleapis.com/export/missing.zip?signature=synthetic"}); err == nil {
		t.Fatal("a failed archive download must fail the import")
	}

	mock.ExpectExec(regexp.QuoteMeta("UPDATE youtube_imports i SET lease_until")).WithArgs("import", "lease").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT video_id,source_storage_key FROM youtube_import_selections")).WithArgs("import").WillReturnRows(sqlmock.NewRows([]string{"video_id", "source_storage_key"}).AddRow(unselectedID, "key"))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT job_options FROM youtube_imports")).WithArgs("import").WillReturnRows(sqlmock.NewRows([]string{"job_options"}).AddRow(selectionOptionsJSON(t)))
	mock.ExpectBegin()
	expectActiveUser(mock)
	expectSelectionStatus(mock, selectionImporting, sql.NullString{})
	mock.ExpectExec(regexp.QuoteMeta("UPDATE youtube_import_selections SET status='processing'")).WithArgs("import", unselectedID, "job-key").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()
	mock.ExpectExec(regexp.QuoteMeta("UPDATE youtube_import_selections SET status='failed'")).WithArgs("import", selectionUnfinished).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(regexp.QuoteMeta("UPDATE youtube_imports SET status=$3,error=$4,credentials=''")).WithArgs("import", "lease", "failed", "The YouTube import did not finish.").WillReturnResult(sqlmock.NewResult(0, 1))

	if err := h.finishWork(context.Background(), work, "failed", "The YouTube import did not finish."); err != nil {
		t.Fatal(err)
	}
	if len(queue.created) != 1 {
		t.Fatalf("the stored video should get one queueing attempt, created %v", queue.created)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

// A stored video whose job cannot be queued fails with a user-readable reason
// instead of staying importing.
func TestSettleSelectionFailsVideoWhoseJobCannotQueue(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	h := &Handler{db: db, queue: &fakeQueue{createErr: errors.New("queue unavailable")}}
	work := importWork{ID: "import", UserID: "owner", Lease: "lease", Selected: true}

	mock.ExpectExec("UPDATE youtube_imports i SET lease_until").WithArgs("import", "lease").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT video_id,source_storage_key FROM youtube_import_selections")).WithArgs("import").WillReturnRows(sqlmock.NewRows([]string{"video_id", "source_storage_key"}).AddRow(unselectedID, "key"))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT job_options FROM youtube_imports")).WithArgs("import").WillReturnRows(sqlmock.NewRows([]string{"job_options"}).AddRow(selectionOptionsJSON(t)))
	mock.ExpectBegin()
	expectActiveUser(mock)
	expectSelectionStatus(mock, selectionImporting, sql.NullString{})
	mock.ExpectRollback()
	mock.ExpectExec(regexp.QuoteMeta("UPDATE youtube_import_selections SET status='failed'")).WithArgs("import", unselectedID, "Job service is temporarily unavailable").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(regexp.QuoteMeta("UPDATE youtube_import_selections SET status='failed'")).WithArgs("import", selectionUnfinished).WillReturnResult(sqlmock.NewResult(0, 0))

	if err := h.settleSelection(context.Background(), work); err != nil {
		t.Fatal(err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestImportJSONCarriesSelectionOnlyForSelectedImports(t *testing.T) {
	job := "11111111-2222-3333-4444-555555555555"
	overview := Overview{Enabled: true, Imports: []Import{
		{ID: "connect", Status: "ready", Visibilities: []string{"public"}},
		{ID: "picked", Status: "importing", Selection: &SelectionOverview{Items: []SelectionItem{
			{VideoID: selectedID, Title: "Chosen talk", ThumbnailURL: "https://img.example/a.jpg", Status: selectionProcessing, JobID: &job},
			{VideoID: unselectedID, Title: "Other talk", Status: selectionWaiting},
			{VideoID: "zzzzzzzzzzz", Title: "Broken", Status: selectionFailed, Error: selectionRejected},
		}}},
	}, Videos: []Video{}}
	body, err := json.Marshal(overview)
	if err != nil {
		t.Fatal(err)
	}
	var decoded struct {
		Imports []struct {
			ID        string `json:"id"`
			Selection *struct {
				Items []map[string]any `json:"items"`
			} `json:"selection"`
		} `json:"imports"`
	}
	if err := json.Unmarshal(body, &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded.Imports[0].Selection != nil {
		t.Fatalf("whole-category import must report selection null: %s", body)
	}
	items := decoded.Imports[1].Selection.Items
	if items[0]["job_id"] != job || items[0]["status"] != selectionProcessing || items[1]["job_id"] != nil || items[1]["status"] != selectionWaiting {
		t.Fatalf("unexpected selection items: %s", body)
	}
	for _, key := range []string{"video_id", "title", "thumbnail_url", "status", "job_id", "error"} {
		if _, ok := items[0][key]; !ok {
			t.Fatalf("item is missing %q: %s", key, body)
		}
	}
	if !strings.Contains(string(body), `"selection":null`) {
		t.Fatalf("selection key must be present as null: %s", body)
	}
}

func TestSelectionFailureStatusesMatchJobsAPI(t *testing.T) {
	if status, _ := selectionFailureStatus(jobs.ErrCredits); status != http.StatusPaymentRequired {
		t.Fatalf("credits status %d", status)
	}
	if status, _ := selectionFailureStatus(jobs.ErrInactive); status != http.StatusForbidden {
		t.Fatalf("inactive status %d", status)
	}
	if status, _ := selectionFailureStatus(errors.New("database down")); status != http.StatusServiceUnavailable {
		t.Fatalf("default status %d", status)
	}
}
