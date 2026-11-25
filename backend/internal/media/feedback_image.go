package media

import (
	"context"
	"io"
	"os"
	"path"
	"strings"
)

// MaxFeedbackImageBytes bounds one screenshot attached to a feedback message.
const MaxFeedbackImageBytes int64 = 5 * 1024 * 1024

const feedbackImageMarker = "-feedback"

// StoreFeedbackImage scans, decodes and saves one screenshot attached to a
// feedback message. The key lives in the owner's upload prefix, so account
// cleanup removes it with the rest of the user's uploads.
func (s *Service) StoreFeedbackImage(ctx context.Context, userID, filename, contentType string, body io.Reader) (string, error) {
	if !uuidPattern.MatchString(userID) {
		return "", ErrInvalidKey
	}
	suffix := strings.ToLower(path.Ext(filename))
	if logoFormats[suffix] == "" {
		return "", failure(400, "Unsupported image format")
	}
	if contentType != logoTypes[suffix] && contentType != "application/octet-stream" {
		return "", failure(400, "Unsupported content type")
	}
	staged, _, err := s.stage(ctx, body, MaxFeedbackImageBytes, 0, suffix, false)
	if err != nil {
		return "", err
	}
	defer os.Remove(staged)
	if !validStoredImage(staged, suffix) {
		return "", failure(400, "Invalid image file")
	}
	if err = s.accountActive(ctx, userID, true); err != nil {
		return "", err
	}
	id, err := randomID()
	if err != nil {
		return "", err
	}
	key := "uploads/" + userID + "/" + id + feedbackImageMarker + suffix
	if err = s.Storage.Save(ctx, staged, key, logoTypes[suffix]); err != nil {
		return "", err
	}
	return key, nil
}

// RemoveFeedbackImage deletes a screenshot whose feedback message was not saved.
func (s *Service) RemoveFeedbackImage(ctx context.Context, userID, key string) error {
	if !IsFeedbackImageKey(userID, key) {
		return ErrInvalidKey
	}
	return s.Storage.Delete(ctx, key)
}

// IsFeedbackImageKey reports whether key is a feedback screenshot owned by userID.
func IsFeedbackImageKey(userID, key string) bool {
	name := path.Base(key)
	suffix := strings.ToLower(path.Ext(name))
	return uuidPattern.MatchString(userID) && path.Dir(key) == "uploads/"+userID && !strings.Contains(key, "..") &&
		logoFormats[suffix] != "" && strings.HasSuffix(strings.TrimSuffix(name, path.Ext(name)), feedbackImageMarker)
}

// ErrorStatus maps a media error to the HTTP status and message the media
// handlers would return, for feature packages that store media themselves.
func ErrorStatus(err error) (int, string) { return statusFor(err) }
