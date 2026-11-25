package youtubeimport

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

var jpegFrame = []byte{0xff, 0xd8, 0xff, 0xe0, 'f', 'r', 'a', 'm', 'e'}

type fakePreviews struct {
	stored    int
	sourceErr error
}

func (f *fakePreviews) StorePreview(context.Context, string, []byte) (string, error) {
	f.stored++
	return "uploads/owner/preview-key.jpg", nil
}

func (*fakePreviews) PreviewURL(_ context.Context, key string) (string, error) {
	return "https://signed.example/preview?sig=synthetic", nil
}

func (f *fakePreviews) ImportSourceLocation(context.Context, string) (string, error) {
	return "/source/video.mp4", f.sourceErr
}

func TestPreviewArgsSeekOneSecondScaleAndPipeOutput(t *testing.T) {
	args := previewArgs("/source/video.mp4", "1")
	joined := strings.Join(args, " ")
	for _, want := range []string{"-ss 1 -i /source/video.mp4", "-frames:v 1", "scale='min(480,iw)':-2", "-f mjpeg pipe:1", "-protocol_whitelist file,http,https,tls,tcp"} {
		if !strings.Contains(joined, want) {
			t.Fatalf("preview arguments lack %q: %s", want, joined)
		}
	}
}

func TestExtractPreviewFallsBackToFirstFrameForShortVideos(t *testing.T) {
	var seeks []string
	run := func(_ context.Context, args []string) ([]byte, error) {
		for i, arg := range args {
			if arg == "-ss" {
				seeks = append(seeks, args[i+1])
			}
		}
		if len(seeks) == 1 {
			return nil, errors.New("seek past end")
		}
		return jpegFrame, nil
	}
	frame, err := extractPreview(context.Background(), "/source/short.mp4", run)
	if err != nil || string(frame) != string(jpegFrame) {
		t.Fatalf("expected fallback frame, got %v %v", frame, err)
	}
	if strings.Join(seeks, ",") != "1,0" {
		t.Fatalf("unexpected seek order: %v", seeks)
	}
}

func TestExtractPreviewRejectsNonJPEGOutput(t *testing.T) {
	run := func(context.Context, []string) ([]byte, error) { return []byte("not an image"), nil }
	if _, err := extractPreview(context.Background(), "/source/video.mp4", run); !errors.Is(err, errPreviewDecode) {
		t.Fatalf("expected decode failure, got %v", err)
	}
}

func TestExtractPreviewWithoutFFmpegIsUnavailable(t *testing.T) {
	if _, err := ExtractPreview(context.Background(), "", "/source/video.mp4"); !errors.Is(err, errPreviewUnavailable) {
		t.Fatalf("expected unavailable preview extraction, got %v", err)
	}
}

// A broken preview must not fail the import. The row keeps no preview key and
// records one attempt so the backfill can retry it later.
func TestImportSurvivesPreviewFailureWithoutPreviewKey(t *testing.T) {
	client := archiveFixtureClient(t, map[string][]byte{
		"/export/videos.zip": fixtureZIP(t, archiveEntry{name: "Takeout/YouTube/videos/only.mp4", data: "\x00\x00\x00\x18ftypmp42synthetic-video"}),
	})
	h, mock := mockHandler(t, client)
	h.cfg.FFmpegPath = "/nonexistent/ffmpeg-for-test"
	h.previews = &fakePreviews{}
	h.media = &scriptedMedia{}

	expectVideoStep(mock)
	mock.ExpectBegin()
	expectActiveUser(mock)
	mock.ExpectQuery(regexp.QuoteMeta("SELECT lease_token=$2 AND lease_until>now() AND status='importing'")).WithArgs("import", "lease", "owner").WillReturnRows(sqlmock.NewRows([]string{"active"}).AddRow(true))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT count(*) FROM youtube_import_videos")).WithArgs("owner").WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectExec("INSERT INTO youtube_import_videos").WithArgs("import", "owner", sqlmock.AnyArg(), sqlmock.AnyArg(), "only.mp4", sqlmock.AnyArg(), "uploads/owner/only.mp4", "", 1).WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	if err := h.importVideos(context.Background(), videoImportWork(), []string{videosArchiveURL}); err != nil {
		t.Fatalf("preview failure failed the import: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestLibraryListingSignsPreviewURLWithoutExposingKeys(t *testing.T) {
	client := testClient(t, func(http.ResponseWriter, *http.Request) {})
	h, mock := mockHandler(t, client)
	h.previews = &fakePreviews{}
	now := time.Now()
	mock.ExpectQuery("SELECT i.id,i.status,i.resources").WithArgs("owner").WillReturnRows(sqlmock.NewRows([]string{"id", "status", "resources", "created_at", "updated_at", "error", "video_count"}))
	mock.ExpectQuery(regexp.QuoteMeta("COALESCE(thumbnail_storage_key,''),created_at")).WithArgs("owner").WillReturnRows(sqlmock.NewRows([]string{"id", "import_id", "title", "file_name", "file_size", "source_storage_key", "thumbnail", "created_at"}).
		AddRow("with-preview", "import", "Sermon", "sermon.mp4", 20, "uploads/owner/sermon.mp4", "uploads/owner/preview.jpg", now).
		AddRow("without-preview", "import", "Clip", "clip.mp4", 20, "uploads/owner/clip.mp4", "", now))

	overview, err := h.loadOverview(context.Background(), "owner")
	if err != nil {
		t.Fatal(err)
	}
	if overview.Videos[0].ThumbnailURL != "https://signed.example/preview?sig=synthetic" || overview.Videos[1].ThumbnailURL != "" {
		t.Fatalf("unexpected thumbnail URLs: %+v", overview.Videos)
	}
	body, err := json.Marshal(overview)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(body), `"thumbnail_url":"https://signed.example/preview?sig=synthetic"`) || strings.Contains(string(body), "preview.jpg") {
		t.Fatalf("thumbnail contract changed or storage key leaked: %s", body)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestPreviewBackfillCountsFailedAttempts(t *testing.T) {
	client := testClient(t, func(http.ResponseWriter, *http.Request) {})
	h, mock := mockHandler(t, client)
	h.previews = &fakePreviews{sourceErr: errors.New("source missing")}
	mock.ExpectQuery("WITH candidate AS").WithArgs(maxPreviewAttempts, previewBatchSize, previewLease.Seconds()).
		WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "source_storage_key"}).AddRow("video", "owner", "uploads/owner/broken.mp4"))
	mock.ExpectExec(regexp.QuoteMeta("UPDATE youtube_import_videos SET thumbnail_attempts=thumbnail_attempts+1")).WithArgs("video").WillReturnResult(sqlmock.NewResult(0, 1))

	if err := h.backfillPreviews(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
