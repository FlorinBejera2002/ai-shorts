package media

import (
	"context"
	"io"
	"net/http"
	"os"
	"path"
	"strings"
	"time"

	"sneepcut/backend-go/internal/identity"
)

const MaxMusicBytes int64 = 128 << 20

func musicContentType(suffix string) string {
	if suffix == ".flac" {
		return "audio/flac"
	}
	return narrationContentTypes[suffix]
}

func looksLikeMusic(header []byte, suffix string) bool {
	if suffix == ".flac" {
		return len(header) >= 4 && string(header[:4]) == "fLaC"
	}
	return looksLikeNarration(header, suffix)
}

// ValidateMusicUploadSource authorizes an opaque owned storage key, never a
// client-provided URL. Full decoding and measured duration checks run in the worker.
func (s *Service) ValidateMusicUploadSource(ctx context.Context, user, reference string) (string, error) {
	key, err := s.KeyFromReference(reference)
	if err != nil || !uuidPattern.MatchString(user) || path.Dir(key) != "uploads/"+user || strings.HasPrefix(path.Base(key), ".") || musicContentType(strings.ToLower(path.Ext(key))) == "" {
		return "", failure(400, "Invalid music file path")
	}
	exists, err := s.Storage.Exists(ctx, key)
	if err != nil {
		return "", err
	}
	if !exists {
		return "", failure(400, "Uploaded music was not found")
	}
	return key, nil
}

func (s *Service) StoreMusic(ctx context.Context, user, name string, body io.Reader) (UploadResult, error) {
	suffix := strings.ToLower(path.Ext(name))
	contentType := musicContentType(suffix)
	if contentType == "" || len(name) > 255 || strings.ContainsAny(name, "/\\\x00") {
		return UploadResult{}, failure(422, "Use an MP3, WAV, FLAC, M4A, WebM or Ogg audio file")
	}
	if err := s.accountActive(ctx, user, true); err != nil {
		return UploadResult{}, err
	}
	file, size, err := s.stageValidated(ctx, body, MaxMusicBytes, 0, suffix, looksLikeMusic, "Invalid audio container")
	if err != nil {
		return UploadResult{}, err
	}
	defer os.Remove(file)
	id, err := randomID()
	if err != nil {
		return UploadResult{}, err
	}
	key := "uploads/" + user + "/" + id + "-music" + suffix
	if err = s.Storage.Save(ctx, file, key, contentType); err != nil {
		return UploadResult{}, failure(503, "Music could not be stored")
	}
	if err = s.accountActive(ctx, user, true); err != nil {
		cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 30*time.Second)
		defer cancel()
		if cleanupErr := s.Storage.Delete(cleanup, key); cleanupErr != nil {
			return UploadResult{}, failure(503, "Account upload cleanup requires retry")
		}
		return UploadResult{}, err
	}
	return UploadResult{FilePath: key, FileName: name, FileSize: size, ContentType: contentType}, nil
}

func (h *Handler) uploadMusic(w http.ResponseWriter, r *http.Request) {
	user := identity.Current(r).User.ID
	if err := h.service.allow(r.Context(), user, "music-upload", 30); err != nil {
		mediaError(w, err)
		return
	}
	part, err := firstFile(w, r, MaxMusicBytes)
	if err != nil {
		mediaError(w, err)
		return
	}
	defer part.Close()
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Minute)
	defer cancel()
	result, err := h.service.StoreMusic(ctx, user, part.FileName(), part)
	if err != nil {
		mediaError(w, err)
		return
	}
	url, err := h.service.SignedURL(ctx, result.FilePath)
	if err != nil {
		mediaError(w, err)
		return
	}
	writeMedia(w, http.StatusCreated, map[string]any{"file_path": result.FilePath, "file_name": result.FileName, "file_size": result.FileSize, "url": url})
}

func (h *Handler) previewMusic(w http.ResponseWriter, r *http.Request) {
	key, err := h.service.ValidateMusicUploadSource(r.Context(), identity.Current(r).User.ID, r.URL.Query().Get("reference"))
	if err != nil {
		mediaError(w, err)
		return
	}
	url, err := h.service.SignedURL(r.Context(), key)
	if err != nil {
		mediaError(w, err)
		return
	}
	writeMedia(w, 200, map[string]string{"url": url})
}
