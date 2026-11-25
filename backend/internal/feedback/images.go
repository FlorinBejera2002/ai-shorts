package feedback

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"time"

	"sneepcut/backend-go/internal/httpx"
	"sneepcut/backend-go/internal/media"
)

// maxMultipartBody covers MaxImages screenshots, the payload and part headers.
const maxMultipartBody = MaxImages*media.MaxFeedbackImageBytes + 1<<20

func isMultipart(r *http.Request) bool {
	contentType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	return err == nil && contentType == "multipart/form-data"
}

// readWithImages reads the "payload" part first so the message is validated
// before any screenshot is stored, then stores each "image" part. On failure
// it writes the response and removes what it already stored.
func (h *Handler) readWithImages(w http.ResponseWriter, r *http.Request, userID string) (Input, []string, bool) {
	var input Input
	if r.ContentLength > maxMultipartBody {
		httpx.Error(w, http.StatusRequestEntityTooLarge, "Images are too large")
		return input, nil, false
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxMultipartBody)
	reader, err := r.MultipartReader()
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "Request body must be multipart form data")
		return input, nil, false
	}
	part, err := reader.NextPart()
	if err != nil || part.FormName() != "payload" || part.FileName() != "" {
		httpx.Error(w, http.StatusBadRequest, "The feedback payload must come first")
		return input, nil, false
	}
	raw, err := io.ReadAll(io.LimitReader(part, maxPayload+1))
	part.Close()
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err != nil || len(raw) > maxPayload || decoder.Decode(&input) != nil {
		httpx.Error(w, http.StatusBadRequest, "The feedback payload is invalid")
		return input, nil, false
	}
	if message := input.Validate(); message != "" {
		httpx.Error(w, http.StatusBadRequest, message)
		return input, nil, false
	}
	if input.Kind == KindClip {
		httpx.Error(w, http.StatusBadRequest, "Clip ratings cannot carry images")
		return input, nil, false
	}

	var images []string
	reject := func(status int, message string) (Input, []string, bool) {
		h.discardImages(r.Context(), userID, images)
		httpx.Error(w, status, message)
		return input, nil, false
	}
	for {
		part, err = reader.NextPart()
		if errors.Is(err, io.EOF) {
			return input, images, true
		}
		if err != nil {
			var tooLarge *http.MaxBytesError
			if errors.As(err, &tooLarge) {
				return reject(http.StatusRequestEntityTooLarge, "Images are too large")
			}
			return reject(http.StatusBadRequest, "Request body could not be read")
		}
		if part.FormName() != "image" || part.FileName() == "" {
			part.Close()
			return reject(http.StatusBadRequest, "Unexpected form field")
		}
		if len(images) == MaxImages {
			part.Close()
			return reject(http.StatusBadRequest, "Attach at most 3 images")
		}
		contentType, _, _ := mime.ParseMediaType(part.Header.Get("Content-Type"))
		key, err := h.images.StoreFeedbackImage(r.Context(), userID, part.FileName(), contentType, part)
		part.Close()
		if err != nil {
			status, message := imageFailure(err)
			return reject(status, message)
		}
		images = append(images, key)
	}
}

func imageFailure(err error) (int, string) {
	status, message := media.ErrorStatus(err)
	if status >= 500 {
		slog.Error("store feedback image", "error", err)
	}
	return status, message
}

// discardImages removes screenshots whose message was not saved.
func (h *Handler) discardImages(parent context.Context, userID string, keys []string) {
	if len(keys) == 0 {
		return
	}
	ctx, cancel := context.WithTimeout(context.WithoutCancel(parent), 30*time.Second)
	defer cancel()
	for _, key := range keys {
		if err := h.images.RemoveFeedbackImage(ctx, userID, key); err != nil {
			slog.Warn("remove unsaved feedback image", "key", key, "error", err)
		}
	}
}
