package media

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

type scannerFunc func(context.Context, string) error

func (f scannerFunc) Scan(ctx context.Context, p string) error { return f(ctx, p) }

type mockNonce struct {
	mu      sync.Mutex
	used    map[string]bool
	err     error
	limited bool
}

func (n *mockNonce) Consume(ctx context.Context, nonce, userID string, ttl time.Duration) (bool, error) {
	n.mu.Lock()
	defer n.mu.Unlock()
	if n.err != nil {
		return false, n.err
	}
	if n.used == nil {
		n.used = map[string]bool{}
	}
	if n.used[nonce] {
		return false, nil
	}
	n.used[nonce] = true
	return true, nil
}
func (n *mockNonce) Allow(ctx context.Context, key string, max int, ttl time.Duration) (bool, error) {
	return !n.limited, n.err
}

type mockStorage struct {
	saved, deleted, prefixes []string
	contentTypes             []string
	saveErr, deleteErr       error
	data                     map[string][]byte
	sizes                    map[string]int64
}

func (s *mockStorage) Save(ctx context.Context, filename, key, contentType string) error {
	s.saved = append(s.saved, key)
	s.contentTypes = append(s.contentTypes, contentType)
	if s.saveErr != nil {
		return s.saveErr
	}
	if s.data == nil {
		s.data = map[string][]byte{}
	}
	s.data[key], _ = os.ReadFile(filename)
	return nil
}

func TestPublishingImagesPreserveOriginalAndPrepareInstagramJPEG(t *testing.T) {
	s, mock, storage, _ := uploadService(t)
	s.cfg.MaxUploadBytes = 1024 * 1024
	activeAccount(mock, "member", false)
	activeAccount(mock, "member", false)
	var source bytes.Buffer
	img := image.NewNRGBA(image.Rect(0, 0, 16, 12))
	for y := 0; y < 12; y++ {
		for x := 0; x < 16; x++ {
			img.Set(x, y, color.NRGBA{R: uint8(x * 10), G: uint8(y * 10), B: 80, A: 180})
		}
	}
	if e := png.Encode(&source, img); e != nil {
		t.Fatal(e)
	}
	result, e := s.StorePublishingMedia(context.Background(), testUserID, UploadIntent{FileName: "photo.png", ContentType: "image/png"}, bytes.NewReader(source.Bytes()))
	if e != nil {
		t.Fatal(e)
	}
	if !strings.HasSuffix(result.FilePath, ".png") || result.ContentType != "image/png" || len(storage.contentTypes) != 2 || storage.contentTypes[0] != "image/png" || storage.contentTypes[1] != "image/jpeg" {
		t.Fatalf("original and derivative have incorrect types: %#v %#v", result, storage.contentTypes)
	}
	if !bytes.Equal(storage.data[result.FilePath], source.Bytes()) || result.FileSize != int64(source.Len()) {
		t.Fatal("original image bytes or size changed")
	}
	derivative, e := s.InstagramPublishingKey(context.Background(), result.FilePath)
	if e != nil || derivative == result.FilePath {
		t.Fatalf("Instagram derivative not selected: %q %v", derivative, e)
	}
	stored := storage.data[derivative]
	if len(stored) < 3 || !bytes.Equal(stored[:3], []byte{0xff, 0xd8, 0xff}) {
		t.Fatal("stored publishing image is not JPEG")
	}
	if e = mock.ExpectationsWereMet(); e != nil {
		t.Fatal(e)
	}
	assertEmptyStage(t, s)
}

func TestPublishingJPEGAndVideoPreserveBytesAndInferContentType(t *testing.T) {
	var jpegSource bytes.Buffer
	if e := jpeg.Encode(&jpegSource, image.NewRGBA(image.Rect(0, 0, 12, 8)), &jpeg.Options{Quality: 96}); e != nil {
		t.Fatal(e)
	}
	for _, tc := range []struct {
		name, claimedType, expectedType string
		data                            []byte
	}{
		{"phone.JPG", "", "image/jpeg", jpegSource.Bytes()},
		{"phone.jpeg", "application/octet-stream", "image/jpeg", jpegSource.Bytes()},
		{"image.jpg", "video/mp4", "image/jpeg", jpegSource.Bytes()},
		{"phone.MOV", "", "video/quicktime", videoBytes},
		{"desktop.mp4", "image/png", "video/mp4", videoBytes},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s, mock, storage, _ := uploadService(t)
			activeAccount(mock, "member", false)
			activeAccount(mock, "member", false)
			result, e := s.StorePublishingMedia(context.Background(), testUserID, UploadIntent{FileName: tc.name, ContentType: tc.claimedType}, bytes.NewReader(tc.data))
			if e != nil {
				t.Fatal(e)
			}
			if result.ContentType != tc.expectedType || len(storage.saved) != 1 || !bytes.Equal(storage.data[result.FilePath], tc.data) {
				t.Fatalf("upload type or original bytes changed: %#v", result)
			}
			if key, e := s.InstagramPublishingKey(context.Background(), result.FilePath); e != nil || key != result.FilePath {
				t.Fatalf("original JPEG/video must not be recompressed: %q %v", key, e)
			}
			if e = mock.ExpectationsWereMet(); e != nil {
				t.Fatal(e)
			}
			assertEmptyStage(t, s)
		})
	}
}

func TestPublishingRejectsForgedImageBeforeStorage(t *testing.T) {
	s, _, storage, _ := uploadService(t)
	_, e := s.StorePublishingMedia(context.Background(), testUserID, UploadIntent{FileName: "photo.png"}, strings.NewReader("\x89PNG\r\n\x1a\nforged"))
	if e == nil || len(storage.saved) != 0 {
		t.Fatal("stored forged PNG")
	}
	assertEmptyStage(t, s)
}

func TestPublishingCleanupOnAccountDeletionIncludesDerivative(t *testing.T) {
	s, mock, storage, _ := uploadService(t)
	activeAccount(mock, "member", false)
	activeAccount(mock, "member", true)
	var source bytes.Buffer
	_ = png.Encode(&source, image.NewRGBA(image.Rect(0, 0, 12, 8)))
	_, e := s.StorePublishingMedia(context.Background(), testUserID, UploadIntent{FileName: "photo.png"}, &source)
	if e == nil || len(storage.saved) != 2 || len(storage.deleted) != 2 {
		t.Fatalf("publishing media survived deletion: %v saved=%v deleted=%v", e, storage.saved, storage.deleted)
	}
	if e = mock.ExpectationsWereMet(); e != nil {
		t.Fatal(e)
	}
	assertEmptyStage(t, s)
}

func TestInstagramChecksPreparedImageSizeWithoutChangingOriginal(t *testing.T) {
	for _, suffix := range []string{".jpg", ".png", ".webp"} {
		t.Run(suffix, func(t *testing.T) {
			s, _, storage, _ := uploadService(t)
			original := "publishing/" + testUserID + "/photo" + suffix
			prepared := original
			if suffix != ".jpg" {
				prepared = instagramImageKey(original)
			}
			storage.data = map[string][]byte{original: {1, 2, 3}}
			storage.data[prepared] = []byte{1, 2, 3}
			storage.sizes = map[string]int64{prepared: 8*1024*1024 + 1}
			if e := s.ValidatePublishingMedia(context.Background(), "instagram", original, "image"); e == nil || !strings.Contains(e.Error(), "8 MB") {
				t.Fatalf("oversized Instagram JPEG accepted: %v", e)
			}
			if !bytes.Equal(storage.data[original], []byte{1, 2, 3}) || len(storage.saved) != 0 || len(storage.deleted) != 0 {
				t.Fatal("validation modified the original")
			}
			storage.sizes[prepared] = 8 * 1024 * 1024
			if e := s.ValidatePublishingMedia(context.Background(), "instagram", original, "image"); e != nil {
				t.Fatalf("image at limit rejected: %v", e)
			}
			storage.sizes[prepared]++
			if e := s.ValidatePublishingMedia(context.Background(), "facebook", original, "image"); e != nil {
				t.Fatalf("Instagram limit applied to another provider: %v", e)
			}
		})
	}
}

func TestPublishingPreviewRequiresOwnedExistingFile(t *testing.T) {
	s, _, storage, _ := uploadService(t)
	key := "publishing/" + testUserID + "/photo.jpg"
	storage.data = map[string][]byte{key: {1}}
	url, e := s.PublishingPreviewURL(context.Background(), testUserID, key)
	if e != nil || !strings.Contains(url, key) {
		t.Fatalf("owned preview failed: %q %v", url, e)
	}
	for _, invalid := range []string{
		"publishing/11111111-1111-4111-8111-111111111111/photo.jpg",
		"publishing/" + testUserID + "/../photo.jpg",
		"publishing/" + testUserID + "/missing.jpg",
		"uploads/" + testUserID + "/photo.jpg",
		"https://attacker.invalid/media/" + key,
	} {
		if _, e := s.PublishingPreviewURL(context.Background(), testUserID, invalid); e == nil {
			t.Fatalf("signed invalid preview %q", invalid)
		}
	}
}

func TestStageCreatesConfiguredDirectory(t *testing.T) {
	s, _, _, _ := uploadService(t)
	s.cfg.StagingDirectory = filepath.Join(s.cfg.StagingDirectory, "new", "quarantine")
	filename, _, e := s.stage(context.Background(), bytes.NewReader(videoBytes), 1024, 0, ".mp4", true)
	if e != nil {
		t.Fatalf("new staging directory rejected: %v", e)
	}
	_ = os.Remove(filename)
	assertEmptyStage(t, s)
}
func (s *mockStorage) Exists(ctx context.Context, key string) (bool, error) {
	_, ok := s.data[key]
	return ok, nil
}
func (s *mockStorage) Size(ctx context.Context, key string) (int64, error) {
	if size, ok := s.sizes[key]; ok {
		return size, nil
	}
	data, ok := s.data[key]
	if !ok {
		return 0, os.ErrNotExist
	}
	return int64(len(data)), nil
}
func (s *mockStorage) Delete(ctx context.Context, key string) error {
	s.deleted = append(s.deleted, key)
	return s.deleteErr
}
func (s *mockStorage) DeletePrefix(ctx context.Context, prefix string) (int, error) {
	s.prefixes = append(s.prefixes, prefix)
	return 0, s.deleteErr
}
func (s *mockStorage) SignedURL(ctx context.Context, key string, ttl time.Duration) (string, error) {
	return "https://storage.invalid/" + key + "?fresh=1", nil
}
func activeAccount(mock sqlmock.Sqlmock, role string, deleting bool) {
	mock.ExpectQuery("SELECT access_role, email_activation_required, EXISTS").WithArgs(testUserID).WillReturnRows(sqlmock.NewRows([]string{"role", "activation", "deleting"}).AddRow(role, false, deleting))
}
func uploadService(t *testing.T) (*Service, sqlmock.Sqlmock, *mockStorage, *mockNonce) {
	t.Helper()
	db, mock, e := sqlmock.New()
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { db.Close() })
	storage := &mockStorage{}
	nonce := &mockNonce{}
	s := NewService(Config{UploadSecret: strings.Repeat("x", 32), MaxUploadBytes: 1024, StagingDirectory: t.TempDir()}, db, storage, nonce, scannerFunc(func(context.Context, string) error { return nil }))
	s.now = func() time.Time { return testNow }
	return s, mock, storage, nonce
}

var videoBytes = []byte{0, 0, 0, 16, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm', 0, 0, 0, 0}

func directRequest(s *Service, token string, body io.Reader, length int64) *httptest.ResponseRecorder {
	h := NewHandler(s, nil)
	r := httptest.NewRequest("PUT", "/api/upload/direct", body)
	r.ContentLength = length
	r.Header.Set("Authorization", "Bearer "+token)
	r.Header.Set("Content-Type", "video/mp4")
	w := httptest.NewRecorder()
	h.uploadDirect(w, r)
	return w
}
func assertEmptyStage(t *testing.T, s *Service) {
	t.Helper()
	entries, e := os.ReadDir(s.cfg.StagingDirectory)
	if e != nil || len(entries) != 0 {
		t.Fatalf("staging leaked: %v %v", entries, e)
	}
}
func TestDirectUploadScansBeforePublishingAndConsumesNonce(t *testing.T) {
	s, mock, storage, _ := uploadService(t)
	scanned := false
	s.scanner = scannerFunc(func(ctx context.Context, p string) error {
		if len(storage.saved) != 0 {
			t.Fatal("published before scan")
		}
		b, e := os.ReadFile(p)
		if e != nil || !bytes.Equal(b, videoBytes) {
			t.Fatal("scanner saw wrong content")
		}
		scanned = true
		return nil
	})
	for i := 0; i < 3; i++ {
		activeAccount(mock, "member", false)
	}
	w := directRequest(s, pythonUploadToken, bytes.NewReader(videoBytes), 16)
	if w.Code != 201 {
		t.Fatalf("upload %d %s", w.Code, w.Body.String())
	}
	if !scanned || len(storage.saved) != 1 {
		t.Fatal("upload not scanned/stored")
	}
	assertEmptyStage(t, s)
	activeAccount(mock, "member", false)
	w = directRequest(s, pythonUploadToken, bytes.NewReader(videoBytes), 16)
	if w.Code != 401 {
		t.Fatalf("replay %d", w.Code)
	}
	if len(storage.saved) != 1 {
		t.Fatal("replay stored data")
	}
	if e := mock.ExpectationsWereMet(); e != nil {
		t.Fatal(e)
	}
}

type forbiddenReader struct{ t *testing.T }

func (r forbiddenReader) Read([]byte) (int, error) {
	r.t.Fatal("body read before authorization")
	return 0, io.EOF
}
func TestDirectUploadRejectsBeforeReadingBody(t *testing.T) {
	for _, scenario := range []string{"bad-token", "viewer", "deleting", "activation", "redis", "length", "limited", "replay"} {
		t.Run(scenario, func(t *testing.T) {
			s, mock, storage, nonce := uploadService(t)
			token := pythonUploadToken
			length := int64(16)
			status := 401
			switch scenario {
			case "bad-token":
				token = "wrong"
			case "viewer":
				activeAccount(mock, "viewer", false)
				status = 403
			case "deleting":
				activeAccount(mock, "member", true)
				status = 409
			case "activation":
				mock.ExpectQuery("SELECT access_role, email_activation_required, EXISTS").WillReturnRows(sqlmock.NewRows([]string{"role", "activation", "deleting"}).AddRow("member", true, false))
				status = 403
			default:
				activeAccount(mock, "member", false)
				switch scenario {
				case "redis":
					nonce.err = errors.New("redis down")
					status = 503
				case "length":
					length = 15
					status = 400
				case "limited":
					nonce.limited = true
					status = 429
				case "replay":
					nonce.used = map[string]bool{"abcdef0123456789abcdef0123456789": true}
				}
			}
			w := directRequest(s, token, forbiddenReader{t}, length)
			if w.Code != status {
				t.Fatalf("status %d: %s", w.Code, w.Body.String())
			}
			if len(storage.saved) > 0 {
				t.Fatal("stored rejected upload")
			}
			if e := mock.ExpectationsWereMet(); e != nil {
				t.Fatal(e)
			}
		})
	}
}
func TestFailedUploadsNeverPublishAndRemoveQuarantine(t *testing.T) {
	for _, scenario := range []string{"malware", "scanner-down", "forged", "short", "oversized", "disconnect"} {
		t.Run(scenario, func(t *testing.T) {
			s, mock, storage, _ := uploadService(t)
			activeAccount(mock, "member", false)
			var body io.Reader = bytes.NewReader(videoBytes)
			status := 400
			switch scenario {
			case "malware":
				s.scanner = scannerFunc(func(context.Context, string) error { return ErrUnsafeUpload })
				status = 422
			case "scanner-down":
				s.scanner = scannerFunc(func(context.Context, string) error { return ErrScannerUnavailable })
				status = 503
			case "forged":
				body = strings.NewReader(strings.Repeat("x", 16))
			case "short":
				body = bytes.NewReader(videoBytes[:8])
			case "oversized":
				body = bytes.NewReader(append(append([]byte{}, videoBytes...), 1, 2))
			case "disconnect":
				body = &failingReader{}
			}
			w := directRequest(s, pythonUploadToken, body, 16)
			if w.Code != status {
				t.Fatalf("status %d: %s", w.Code, w.Body.String())
			}
			if len(storage.saved) > 0 {
				t.Fatal("published rejected upload")
			}
			assertEmptyStage(t, s)
			if e := mock.ExpectationsWereMet(); e != nil {
				t.Fatal(e)
			}
		})
	}
}

type failingReader struct{}

func (*failingReader) Read([]byte) (int, error) { return 0, io.ErrUnexpectedEOF }
func TestDeletionDuringPublicationRemovesUploadedObject(t *testing.T) {
	s, mock, storage, _ := uploadService(t)
	activeAccount(mock, "member", false)
	activeAccount(mock, "member", false)
	activeAccount(mock, "member", true)
	w := directRequest(s, pythonUploadToken, bytes.NewReader(videoBytes), 16)
	if w.Code != 409 {
		t.Fatalf("%d %s", w.Code, w.Body.String())
	}
	if len(storage.saved) != 1 || len(storage.deleted) != 1 || storage.saved[0] != storage.deleted[0] {
		t.Fatal("late upload survived account deletion")
	}
	assertEmptyStage(t, s)
}
func TestStageBoundsDiskAndCancels(t *testing.T) {
	s, _, _, _ := uploadService(t)
	if _, _, e := s.stage(context.Background(), strings.NewReader(strings.Repeat("x", 2048)), 1024, 0, ".mp4", true); e == nil {
		t.Fatal("accepted excess")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, _, e := s.stage(ctx, bytes.NewReader(videoBytes), 1024, 0, ".mp4", true); e == nil {
		t.Fatal("ignored cancellation")
	}
	assertEmptyStage(t, s)
}
func TestOwnedLogoOnlyAllowsRasterReadAndLegacySVGDeletion(t *testing.T) {
	s := NewService(Config{LocalRoot: "/app/media"}, nil, nil, nil, nil)
	for _, tc := range []struct {
		key           string
		legacy, valid bool
	}{{"brand/" + testUserID + "/logo.png", false, true}, {"brand/" + testUserID + "/logo.svg", false, false}, {"brand/" + testUserID + "/logo.svg", true, true}, {"brand/other/logo.png", true, false}, {"brand/" + testUserID + "/nested/logo.png", false, false}, {"brand/" + testUserID + "/../logo.png", true, false}} {
		_, e := s.ownedLogoKey(tc.key, testUserID, tc.legacy)
		if (e == nil) != tc.valid {
			t.Fatalf("%q %v", tc.key, e)
		}
	}
}
func TestValidStoredImageRejectsForgedMagic(t *testing.T) {
	for suffix, header := range map[string][]byte{".png": []byte("\x89PNG\r\n\x1a\nforged"), ".jpg": []byte("\xff\xd8\xffforged"), ".webp": []byte("RIFFxxxxWEBPforged")} {
		file := filepath.Join(t.TempDir(), "logo"+suffix)
		_ = os.WriteFile(file, header, 0600)
		if validStoredImage(file, suffix) {
			t.Fatalf("accepted forged %s", suffix)
		}
	}
}
