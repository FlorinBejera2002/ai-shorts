package media

import (
	"context"
	"database/sql"
	"errors"
	"io"
	"path"
	"strings"
)

// StoreImportedVideo applies the same ownership, size, content and malware
// checks as a browser upload. Importers never publish an archive directly.
func (s *Service) StoreImportedVideo(ctx context.Context, userID string, intent UploadIntent, body io.Reader) (UploadResult, error) {
	if !uuidPattern.MatchString(userID) {
		return UploadResult{}, ErrInvalidKey
	}
	if err := intent.Validate(s.cfg.MaxUploadBytes); err != nil {
		return UploadResult{}, failure(400, err.Error())
	}
	if err := s.accountActive(ctx, userID, true); err != nil {
		return UploadResult{}, err
	}
	return s.storeVideo(ctx, userID, intent, body, intent.FileSize)
}

// RemoveImportedVideo removes an unreferenced import after its library row has
// been tombstoned. Job creation takes the same user lock and checks tombstones,
// preventing a request validated before deletion from claiming missing bytes.
func (s *Service) RemoveImportedVideo(ctx context.Context, userID, reference string) error {
	key, err := s.KeyFromReference(reference)
	if err != nil || !uuidPattern.MatchString(userID) || path.Dir(key) != "uploads/"+userID || strings.HasPrefix(path.Base(key), ".") {
		return ErrInvalidKey
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var owner string
	if err = tx.QueryRowContext(ctx, `SELECT id FROM users WHERE id=$1 FOR UPDATE`, userID).Scan(&owner); errors.Is(err, sql.ErrNoRows) {
		return nil // Account cleanup owns the entire upload prefix now.
	} else if err != nil {
		return err
	}
	var used bool
	err = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM jobs WHERE user_id=$1 AND source_storage_key=$2)
		OR EXISTS(SELECT 1 FROM youtube_import_videos WHERE user_id=$1 AND source_storage_key=$2 AND deleted_at IS NULL)
		OR EXISTS(SELECT 1 FROM story_assets a JOIN story_projects p ON p.id=a.project_id WHERE p.user_id=$1 AND a.asset::text LIKE '%' || $2 || '%')`, userID, key).Scan(&used)
	if err != nil {
		return err
	}
	if !used {
		if err = s.Storage.Delete(ctx, key); err != nil {
			return err
		}
	}
	return tx.Commit()
}
