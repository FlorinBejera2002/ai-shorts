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
	"sneepcut/backend-go/internal/story"
)

var narrationContentTypes = map[string]string{
	".webm": "audio/webm", ".ogg": "audio/ogg", ".opus": "audio/ogg",
	".m4a": "audio/mp4", ".mp4": "audio/mp4", ".mp3": "audio/mpeg", ".wav": "audio/wav",
}

// This checks the container before scanning/storing. Registration subsequently
// decodes it and validates audio-only streams, measured duration and codec.
func looksLikeNarration(header []byte, suffix string) bool {
	if len(header) < 12 {
		return false
	}
	switch suffix {
	case ".webm":
		return string(header[:4]) == "\x1a\x45\xdf\xa3"
	case ".ogg", ".opus":
		return string(header[:4]) == "OggS"
	case ".m4a", ".mp4":
		return string(header[4:8]) == "ftyp"
	case ".mp3":
		return string(header[:3]) == "ID3" || header[0] == 0xff && header[1]&0xe0 == 0xe0
	case ".wav":
		return string(header[:4]) == "RIFF" && string(header[8:12]) == "WAVE"
	}
	return false
}

// Keep the normal video validator strict; an audio upload cannot enter the
// legacy video job pipeline just by sharing the user's upload directory.
func (s *Service) ValidateNarrationUploadSource(ctx context.Context, user, reference string) (string, error) {
	key, err := s.KeyFromReference(reference)
	if err != nil || !uuidPattern.MatchString(user) || path.Dir(key) != "uploads/"+user || strings.HasPrefix(path.Base(key), ".") || narrationContentTypes[strings.ToLower(path.Ext(key))] == "" {
		return "", failure(400, "Invalid narration file path")
	}
	exists, err := s.Storage.Exists(ctx, key)
	if err != nil {
		return "", err
	}
	if !exists {
		return "", failure(400, "Uploaded narration was not found")
	}
	return key, nil
}

func (s *Service) StoreNarration(ctx context.Context, user, name string, body io.Reader) (UploadResult, error) {
	var result UploadResult
	suffix := strings.ToLower(path.Ext(name))
	contentType := narrationContentTypes[suffix]
	if contentType == "" || len(name) > 255 || strings.ContainsAny(name, "/\\\x00") {
		return result, failure(422, "Use a WebM, M4A, MP3, WAV or Ogg audio recording")
	}
	if err := s.accountActive(ctx, user, true); err != nil {
		return result, err
	}
	filename, size, err := s.stageValidated(ctx, body, story.MaxNarrationBytes, 0, suffix, looksLikeNarration, "Invalid audio container")
	if err != nil {
		return result, err
	}
	defer os.Remove(filename)
	id, err := randomID()
	if err != nil {
		return result, err
	}
	storedName := id + "-" + safeSlug(strings.TrimSuffix(name, path.Ext(name))) + suffix
	key := "uploads/" + user + "/" + storedName
	if err = s.Storage.Save(ctx, filename, key, contentType); err != nil {
		return result, failure(503, "Narration could not be stored")
	}
	if err = s.accountActive(ctx, user, true); err != nil {
		cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 30*time.Second)
		defer cancel()
		if cleanupErr := s.Storage.Delete(cleanup, key); cleanupErr != nil {
			return result, failure(503, "Account upload cleanup requires retry")
		}
		return result, err
	}
	reference := key
	if local, ok := s.Storage.(*LocalStorage); ok {
		reference, err = local.Path(key)
		if err != nil {
			return result, err
		}
	}
	return UploadResult{FilePath: reference, FileName: storedName, FileSize: size, ContentType: contentType}, nil
}

func (h *Handler) uploadNarration(w http.ResponseWriter, r *http.Request) {
	user := identity.Current(r).User.ID
	if err := h.service.allow(r.Context(), user, "narration-upload", 60); err != nil {
		mediaError(w, err)
		return
	}
	part, err := firstFile(w, r, story.MaxNarrationBytes)
	if err != nil {
		mediaError(w, err)
		return
	}
	defer part.Close()
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Minute)
	defer cancel()
	result, err := h.service.StoreNarration(ctx, user, part.FileName(), part)
	if err != nil {
		mediaError(w, err)
		return
	}
	writeMedia(w, http.StatusCreated, result)
}
