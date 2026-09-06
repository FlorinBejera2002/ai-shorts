package media

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path"
	"strings"
	"time"
)

type Config struct {
	LocalRoot, PublicBaseURL, AppURL, SigningSecret, UploadSecret, DirectUploadURL, StagingDirectory string
	MaxUploadBytes                                                                                   int64
}
type Service struct {
	cfg     Config
	db      *sql.DB
	Storage Storage
	nonce   NonceStore
	scanner Scanner
	now     func() time.Time
}

func NewService(cfg Config, db *sql.DB, storage Storage, nonce NonceStore, scanner Scanner) *Service {
	if cfg.MaxUploadBytes <= 0 {
		cfg.MaxUploadBytes = 2 * 1024 * 1024 * 1024
	}
	if cfg.DirectUploadURL == "" {
		cfg.DirectUploadURL = "/api/upload/direct"
	}
	return &Service{cfg: cfg, db: db, Storage: storage, nonce: nonce, scanner: scanner, now: time.Now}
}

type HTTPError struct {
	Status  int
	Message string
}

func (e *HTTPError) Error() string             { return e.Message }
func failure(status int, message string) error { return &HTTPError{Status: status, Message: message} }
func (s *Service) KeyFromReference(reference string) (string, error) {
	key, err := keyFromReference(reference, s.cfg.LocalRoot, s.cfg.PublicBaseURL, s.cfg.AppURL)
	if err != nil {
		if local, ok := s.Storage.(*LocalStorage); ok {
			return keyFromReference(reference, local.directory, s.cfg.PublicBaseURL, s.cfg.AppURL)
		}
	}
	return key, err
}
func (s *Service) SignedURL(ctx context.Context, key string) (string, error) {
	key, e := s.KeyFromReference(key)
	if e != nil {
		return "", e
	}
	signed, e := s.Storage.SignedURL(ctx, key, 4*time.Hour)
	if e != nil || signed != "" {
		return signed, e
	}
	if s.cfg.SigningSecret == "" {
		return "", errors.New("media signing secret is required")
	}
	mediaPath := "/media/" + key
	expires := s.now().Add(4 * time.Hour).Unix()
	return fmt.Sprintf("%s%s?expires=%d&sig=%s", strings.TrimRight(s.cfg.AppURL, "/"), mediaPath, expires, SignMediaPath(s.cfg.SigningSecret, mediaPath, expires)), nil
}
func (s *Service) WorkerSource(ctx context.Context, key string) (string, error) {
	key, e := s.KeyFromReference(key)
	if e != nil {
		return "", e
	}
	if local, ok := s.Storage.(*LocalStorage); ok {
		return local.Path(key)
	}
	return s.SignedURL(ctx, key)
}
func (s *Service) Delete(ctx context.Context, key string) error {
	key, e := s.KeyFromReference(key)
	if e != nil {
		return e
	}
	return s.Storage.Delete(ctx, key)
}
func (s *Service) DeletePrefix(ctx context.Context, prefix string) error {
	if !validKey(strings.TrimSuffix(prefix, "/")) {
		return ErrInvalidKey
	}
	_, e := s.Storage.DeletePrefix(ctx, prefix)
	return e
}
func (s *Service) ValidateUploadSource(ctx context.Context, userID, reference string) (string, error) {
	key, e := s.KeyFromReference(reference)
	if e != nil || !uuidPattern.MatchString(userID) || path.Dir(key) != "uploads/"+userID || strings.HasPrefix(path.Base(key), ".") || !videoExtensions[strings.ToLower(path.Ext(key))] {
		return "", failure(400, "Invalid uploaded file path")
	}
	exists, e := s.Storage.Exists(ctx, key)
	if e != nil {
		return "", e
	}
	if !exists {
		return "", failure(400, "Uploaded file was not found")
	}
	return key, nil
}
func (s *Service) accountActive(ctx context.Context, userID string, write bool) error {
	var role string
	var deleting bool
	var activationRequired bool
	err := s.db.QueryRowContext(ctx, `SELECT access_role, email_activation_required, EXISTS (SELECT 1 FROM account_deletion_requests d WHERE d.user_id=u.id) FROM users u WHERE u.id=$1`, userID).Scan(&role, &activationRequired, &deleting)
	if errors.Is(err, sql.ErrNoRows) {
		return failure(401, "Authentication required")
	}
	if err != nil {
		return failure(503, "Account verification is temporarily unavailable")
	}
	if activationRequired {
		return failure(403, "Verify your email before uploading")
	}
	if deleting {
		return failure(409, "Account deletion is pending")
	}
	if write && role != "member" {
		return failure(403, "This role cannot modify content")
	}
	return nil
}
func (s *Service) allow(ctx context.Context, userID, action string, max int) error {
	if s.nonce == nil {
		return failure(503, "Upload authorization is temporarily unavailable")
	}
	ok, e := s.nonce.Allow(ctx, action+":"+userID, max, time.Hour)
	if e != nil {
		return failure(503, "Upload authorization is temporarily unavailable")
	}
	if !ok {
		return failure(429, "Too many requests")
	}
	return nil
}

type UploadResult struct {
	FilePath    string `json:"file_path"`
	FileName    string `json:"file_name"`
	FileSize    int64  `json:"file_size"`
	ContentType string `json:"content_type"`
}

func safeSlug(name string) string {
	var b strings.Builder
	dash := false
	for _, c := range strings.ToLower(name) {
		if c >= 'a' && c <= 'z' || c >= '0' && c <= '9' {
			b.WriteRune(c)
			dash = false
		} else if !dash && b.Len() > 0 {
			b.WriteByte('-')
			dash = true
		}
		if b.Len() >= 64 {
			break
		}
	}
	if b.Len() == 0 {
		return "video"
	}
	return strings.Trim(b.String(), "-")
}

// stage never publishes unscanned data. Max+1 bounds disk writes, and the
// content length is checked again against bytes actually received.
func (s *Service) stage(ctx context.Context, body io.Reader, maximum, expected int64, suffix string, video bool) (string, int64, error) {
	f, e := os.CreateTemp(s.cfg.StagingDirectory, "sneepcut-upload-*"+suffix)
	if e != nil {
		return "", 0, failure(503, "Upload staging is unavailable")
	}
	filename := f.Name()
	keep := false
	defer func() {
		_ = f.Close()
		if !keep {
			_ = os.Remove(filename)
		}
	}()
	n, e := io.Copy(f, io.LimitReader(&contextReader{ctx: ctx, r: body}, maximum+1))
	if e != nil {
		return "", 0, failure(400, "Upload body could not be read")
	}
	if n > maximum {
		return "", 0, failure(413, "File too large")
	}
	if n == 0 || expected > 0 && n != expected {
		return "", 0, failure(400, "Upload size does not match authorization")
	}
	if _, e = f.Seek(0, io.SeekStart); e != nil {
		return "", 0, e
	}
	header := make([]byte, 64)
	read, _ := io.ReadFull(f, header)
	if video && !LooksLikeVideo(header[:read], suffix) {
		return "", 0, failure(400, "Invalid video file")
	}
	if e = f.Sync(); e != nil {
		return "", 0, e
	}
	if e = f.Close(); e != nil {
		return "", 0, e
	}
	if s.scanner == nil {
		return "", 0, ErrScannerUnavailable
	}
	if e = s.scanner.Scan(ctx, filename); e != nil {
		return "", 0, e
	}
	keep = true
	return filename, n, nil
}
func (s *Service) storeVideo(ctx context.Context, userID string, intent UploadIntent, body io.Reader, expected int64) (UploadResult, error) {
	var result UploadResult
	suffix := strings.ToLower(path.Ext(intent.FileName))
	filename, size, e := s.stage(ctx, body, s.cfg.MaxUploadBytes, expected, suffix, true)
	if e != nil {
		return result, e
	}
	defer os.Remove(filename)
	if e = s.accountActive(ctx, userID, true); e != nil {
		return result, e
	}
	id, e := randomID()
	if e != nil {
		return result, e
	}
	storedName := id + "-" + safeSlug(strings.TrimSuffix(intent.FileName, path.Ext(intent.FileName))) + suffix
	key := "uploads/" + userID + "/" + storedName
	if e = s.Storage.Save(ctx, filename, key, intent.ContentType); e != nil {
		return result, failure(503, "Upload could not be stored")
	}
	if e = s.accountActive(ctx, userID, true); e != nil {
		cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 30*time.Second)
		defer cancel()
		if cleanupErr := s.Storage.Delete(cleanupCtx, key); cleanupErr != nil {
			return result, failure(503, "Account upload cleanup requires retry")
		}
		return result, e
	}
	// Browser persists a stable reference; local workers retain absolute paths.
	reference := key
	if local, ok := s.Storage.(*LocalStorage); ok {
		reference, e = local.Path(key)
		if e != nil {
			return result, e
		}
	}
	return UploadResult{FilePath: reference, FileName: storedName, FileSize: size, ContentType: intent.ContentType}, nil
}
func statusFor(err error) (int, string) {
	var failure *HTTPError
	if errors.As(err, &failure) {
		return failure.Status, failure.Message
	}
	if errors.Is(err, ErrUnsafeUpload) {
		return 422, err.Error()
	}
	if errors.Is(err, ErrScannerUnavailable) {
		return 503, err.Error()
	}
	if errors.Is(err, ErrInvalidKey) {
		return 403, "Cannot access this file"
	}
	return http.StatusServiceUnavailable, "Media operation is temporarily unavailable"
}
