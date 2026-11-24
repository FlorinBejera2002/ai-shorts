package media

import (
	"context"
	"errors"
	"os"
)

// StoreImportPreview saves a preview frame generated from an imported video.
// The frame lives in the owner's upload prefix beside the import source, so
// removal and account cleanup treat it like any other owned upload. Frames are
// produced by this service rather than uploaded, so no browser content checks apply.
func (s *Service) StoreImportPreview(ctx context.Context, userID string, jpeg []byte) (string, error) {
	if !uuidPattern.MatchString(userID) {
		return "", ErrInvalidKey
	}
	if len(jpeg) < 3 || jpeg[0] != 0xff || jpeg[1] != 0xd8 || jpeg[2] != 0xff {
		return "", errors.New("import preview is not a JPEG image")
	}
	if err := s.accountActive(ctx, userID, true); err != nil {
		return "", err
	}
	id, err := randomID()
	if err != nil {
		return "", err
	}
	if s.cfg.StagingDirectory != "" {
		if err = os.MkdirAll(s.cfg.StagingDirectory, 0700); err != nil {
			return "", err
		}
	}
	staged, err := os.CreateTemp(s.cfg.StagingDirectory, "sneepcut-import-preview-*.jpg")
	if err != nil {
		return "", err
	}
	defer os.Remove(staged.Name())
	_, err = staged.Write(jpeg)
	if closeErr := staged.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return "", err
	}
	key := "uploads/" + userID + "/" + id + "-preview.jpg"
	if err = s.Storage.Save(ctx, staged.Name(), key, "image/jpeg"); err != nil {
		return "", err
	}
	return key, nil
}
