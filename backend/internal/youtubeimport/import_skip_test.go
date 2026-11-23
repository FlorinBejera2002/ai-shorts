package youtubeimport

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

// scriptedMedia stores every video except failName, which fails with failErr.
// When cancel is set it is called before failing, to simulate a cancelled import.
type scriptedMedia struct {
	failName string
	failErr  error
	cancel   context.CancelFunc
	stored   []string
}

func (m *scriptedMedia) ImportSource(_ context.Context, _ string, video ImportedVideo) (string, error) {
	if video.FileName == m.failName {
		if m.cancel != nil {
			m.cancel()
		}
		return "", m.failErr
	}
	m.stored = append(m.stored, video.FileName)
	return "uploads/owner/" + video.FileName, nil
}

func (*scriptedMedia) RemoveImportSource(context.Context, string, string) error { return nil }

func videoImportWork() importWork {
	return importWork{ID: "import", UserID: "owner", Lease: "lease", Status: "importing", CreatedAt: time.Now()}
}

// expectVideoStep covers the per-video store calls made before ImportSource runs.
func expectVideoStep(mock sqlmock.Sqlmock) {
	mock.ExpectExec("UPDATE youtube_imports i SET lease_until").WithArgs("import", "lease").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery("SELECT EXISTS\\(SELECT 1 FROM youtube_import_videos").WithArgs("import", sqlmock.AnyArg()).WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
}

// expectRecordedVideo covers recordVideo for a stored video with the given file name.
func expectRecordedVideo(mock sqlmock.Sqlmock, fileName string) {
	mock.ExpectBegin()
	expectActiveUser(mock)
	mock.ExpectQuery("SELECT lease_token=\\$2 AND lease_until>now\\(\\) AND status='importing'").WithArgs("import", "lease", "owner").WillReturnRows(sqlmock.NewRows([]string{"active"}).AddRow(true))
	mock.ExpectQuery("SELECT count\\(\\*\\) FROM youtube_import_videos").WithArgs("owner").WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectExec("INSERT INTO youtube_import_videos").WithArgs("import", "owner", sqlmock.AnyArg(), sqlmock.AnyArg(), fileName, sqlmock.AnyArg(), "uploads/owner/"+fileName).WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()
}

func threeVideoArchive(t *testing.T) map[string][]byte {
	t.Helper()
	video := "\x00\x00\x00\x18ftypmp42synthetic-video"
	return map[string][]byte{
		"/export/videos.zip": fixtureZIP(t,
			archiveEntry{name: "Takeout/YouTube/videos/first.mp4", data: video},
			archiveEntry{name: "Takeout/YouTube/videos/second.mp4", data: video},
			archiveEntry{name: "Takeout/YouTube/videos/third.mp4", data: video},
		),
	}
}

const videosArchiveURL = "https://storage.googleapis.com/export/videos.zip?signature=synthetic"

func TestImportVideosSkipsRejectedVideoAndKeepsRemainingVideos(t *testing.T) {
	client := archiveFixtureClient(t, threeVideoArchive(t))
	h, mock := mockHandler(t, client)
	media := &scriptedMedia{failName: "second.mp4", failErr: errors.New("scanner size limit")}
	h.media = media

	expectVideoStep(mock)
	expectRecordedVideo(mock, "first.mp4")
	expectVideoStep(mock)
	expectVideoStep(mock)
	expectRecordedVideo(mock, "third.mp4")

	err := h.importVideos(context.Background(), videoImportWork(), []string{videosArchiveURL})
	if !errors.Is(err, errVideosSkipped) {
		t.Fatalf("expected errVideosSkipped, got %v", err)
	}
	if len(media.stored) != 2 || media.stored[0] != "first.mp4" || media.stored[1] != "third.mp4" {
		t.Fatalf("unexpected stored videos: %v", media.stored)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestImportVideosAbortsOnContextCancellationFromImportSource(t *testing.T) {
	client := archiveFixtureClient(t, threeVideoArchive(t))
	h, mock := mockHandler(t, client)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	h.media = &scriptedMedia{failName: "second.mp4", failErr: context.Canceled, cancel: cancel}

	expectVideoStep(mock)
	expectRecordedVideo(mock, "first.mp4")
	expectVideoStep(mock)

	err := h.importVideos(ctx, videoImportWork(), []string{videosArchiveURL})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("cancellation was not returned, got %v", err)
	}
	if errors.Is(err, errVideosSkipped) {
		t.Fatal("cancellation was converted into a skipped-video result")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

// temporaryTestError stands in for media.ErrScannerUnavailable or a 5xx storage failure.
type temporaryTestError struct{}

func (temporaryTestError) Error() string   { return "scanner unavailable" }
func (temporaryTestError) Temporary() bool { return true }

func TestImportVideosStopsOnTemporaryFailureInsteadOfSkipping(t *testing.T) {
	client := archiveFixtureClient(t, threeVideoArchive(t))
	h, mock := mockHandler(t, client)
	h.media = &scriptedMedia{failName: "second.mp4", failErr: temporaryTestError{}}

	expectVideoStep(mock)
	expectRecordedVideo(mock, "first.mp4")
	expectVideoStep(mock)

	err := h.importVideos(context.Background(), videoImportWork(), []string{videosArchiveURL})
	if !errors.As(err, &temporaryTestError{}) {
		t.Fatalf("temporary failure was not returned, got %v", err)
	}
	if errors.Is(err, errVideosSkipped) {
		t.Fatal("a temporary failure dropped the video instead of stopping the import")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
