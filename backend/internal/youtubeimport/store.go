package youtubeimport

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/lib/pq"
	"sneepcut/backend-go/internal/data"
)

type authorization struct {
	ID, UserID, Verifier, Locale string
	SessionVersion               int
	Resources                    []string
}

type importWork struct {
	ID, UserID, Status, Encrypted, ArchiveID, AccessType, Lease string
	Resources                                                   []string
	CreatedAt                                                   time.Time
	Attempts                                                    int
	Initiated                                                   bool
	CleanupPending                                              bool
	CompletionStatus, CompletionError                           string
	// Selected means only the videos in youtube_import_selections are imported.
	Selected bool
}

func lockActiveUser(ctx context.Context, tx *sql.Tx, user string) error {
	var role, status string
	var activation bool
	err := tx.QueryRowContext(ctx, `SELECT access_role,account_status,email_activation_required FROM users WHERE id=$1 FOR UPDATE`, user).Scan(&role, &status, &activation)
	if err != nil {
		return err
	}
	if (role != "member" && role != "admin") || status != "active" || activation {
		return sql.ErrNoRows
	}
	// A fresh READ COMMITTED snapshot is required after waiting for the user
	// lock; a deletion marker may have committed while that wait was pending.
	var deleting bool
	if err = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=$1)`, user).Scan(&deleting); err != nil {
		return err
	}
	if deleting {
		return sql.ErrNoRows
	}
	return nil
}

func (h *Handler) createAuthorization(ctx context.Context, user string, version int, resources []string, state, browser, verifier, locale string) error {
	id, err := data.NewUUID()
	if err != nil {
		return err
	}
	return h.createAuthorizationWith(ctx, user, version, resources, state, browser, verifier, locale, id, nil)
}

// createAuthorizationWith stores a new authorizing import with the given id. A
// selection, when present, is stored in the same transaction.
func (h *Handler) createAuthorizationWith(ctx context.Context, user string, version int, resources []string, state, browser, verifier, locale, id string, selection *selectionRequest) error {
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = lockActiveUser(ctx, tx, user); err != nil {
		return err
	}
	var currentVersion int
	if err = tx.QueryRowContext(ctx, `SELECT session_version FROM users WHERE id=$1`, user).Scan(&currentVersion); err != nil || currentVersion != version {
		return sql.ErrNoRows
	}
	// Closing the Google consent window must not permanently block a later try.
	if _, err = tx.ExecContext(ctx, `UPDATE youtube_imports SET status='cancelled',credentials='',authorization_in_progress=false,cleanup_pending=false,error='Authorization expired. Connect again.',updated_at=now() WHERE user_id=$1 AND status='authorizing' AND ((NOT authorization_in_progress AND created_at<now()-interval '10 minutes') OR (authorization_in_progress AND updated_at<now()-interval '2 minutes'))`, user); err != nil {
		return err
	}
	var active bool
	if err = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM youtube_imports WHERE user_id=$1 AND (status IN ('authorizing','queued','exporting','importing') OR cleanup_pending))`, user).Scan(&active); err != nil {
		return err
	}
	if active {
		return errActiveImport
	}
	var recentImports, libraryVideos int
	if err = tx.QueryRowContext(ctx, `SELECT (SELECT count(*) FROM youtube_imports WHERE user_id=$1 AND created_at>now()-interval '1 hour'),(SELECT count(*) FROM youtube_import_videos WHERE user_id=$1 AND deleted_at IS NULL)`, user).Scan(&recentImports, &libraryVideos); err != nil {
		return err
	}
	if recentImports >= 10 || libraryVideos >= 1000 {
		return errImportBudget
	}
	var jobOptions sql.NullString
	if selection != nil {
		jobOptions = sql.NullString{String: string(selection.options), Valid: true}
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO youtube_imports(id,user_id,status,resources,session_version,job_options) VALUES($1,$2,'authorizing',$3,$4,$5)`, id, user, pq.Array(resources), version, jobOptions)
	if uniqueViolation(err) {
		return errActiveImport
	}
	if err != nil {
		return err
	}
	if selection != nil {
		if err = insertSelection(ctx, tx, id, selection); err != nil {
			return err
		}
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO youtube_import_oauth_states(state_hash,import_id,user_id,browser_hash,verifier,locale,session_version,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '10 minutes')`, secretDigest(state), id, user, secretDigest(browser), verifier, locale, version)
	if err != nil {
		return err
	}
	return tx.Commit()
}

func (h *Handler) consumeAuthorization(ctx context.Context, state, browser string) (authorization, error) {
	var a authorization
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return a, err
	}
	defer tx.Rollback()
	// Resolve ownership without consuming state, then follow the same user-first
	// lock order as cancellation and account deletion. Locking state first can
	// deadlock with cancellation's import/state cleanup.
	err = tx.QueryRowContext(ctx, `SELECT user_id FROM youtube_import_oauth_states WHERE state_hash=$1 AND browser_hash=$2 AND expires_at>now()`, secretDigest(state), secretDigest(browser)).Scan(&a.UserID)
	if err != nil {
		return a, err
	}
	if err = lockActiveUser(ctx, tx, a.UserID); err != nil {
		return a, err
	}
	err = tx.QueryRowContext(ctx, `DELETE FROM youtube_import_oauth_states WHERE state_hash=$1 AND browser_hash=$2 AND expires_at>now() RETURNING import_id,user_id,verifier,locale,session_version`, secretDigest(state), secretDigest(browser)).Scan(&a.ID, &a.UserID, &a.Verifier, &a.Locale, &a.SessionVersion)
	if err != nil {
		return a, err
	}
	err = tx.QueryRowContext(ctx, `UPDATE youtube_imports SET authorization_in_progress=true,updated_at=now() WHERE id=$1 AND user_id=$2 AND status='authorizing' RETURNING resources`, a.ID, a.UserID).Scan(pq.Array(&a.Resources))
	if err != nil {
		return a, err
	}
	return a, tx.Commit()
}

func (h *Handler) authorizationActive(ctx context.Context, a authorization) bool {
	var active bool
	err := h.db.QueryRowContext(ctx, `SELECT u.session_version=$3 AND u.account_status='active' AND u.access_role IN ('member','admin') AND NOT u.email_activation_required AND i.status='authorizing' AND NOT EXISTS(SELECT 1 FROM account_deletion_requests d WHERE d.user_id=u.id) FROM users u JOIN youtube_imports i ON i.user_id=u.id WHERE u.id=$1 AND i.id=$2`, a.UserID, a.ID, a.SessionVersion).Scan(&active)
	return err == nil && active
}

func (h *Handler) saveAuthorization(ctx context.Context, a authorization, encrypted string, resources []string) error {
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = lockActiveUser(ctx, tx, a.UserID); err != nil {
		return err
	}
	result, err := tx.ExecContext(ctx, `UPDATE youtube_imports SET status='queued',authorization_in_progress=false,credentials=$3,resources=$4,next_poll_at=now(),updated_at=now() WHERE id=$1 AND user_id=$2 AND status='authorizing' AND session_version=(SELECT session_version FROM users WHERE id=$2)`, a.ID, a.UserID, encrypted, pq.Array(resources))
	if err != nil {
		return err
	}
	if count, err := result.RowsAffected(); err != nil || count != 1 {
		return sql.ErrNoRows
	}
	return tx.Commit()
}

func (h *Handler) authorizationFailed(ctx context.Context, id, message string) {
	_, _ = h.db.ExecContext(ctx, `UPDATE youtube_imports SET status=CASE WHEN status='cancelled' THEN status ELSE 'failed' END,authorization_in_progress=false,cleanup_pending=false,credentials='',error=$2,updated_at=now() WHERE id=$1 AND status IN ('authorizing','cancelled') AND credentials=''`, id, message)
}

func (h *Handler) queueRejectedAuthorization(ctx context.Context, a authorization, token Token, message string) error {
	encrypted, err := encryptToken(h.vault, token, a.UserID+":"+a.ID)
	if err != nil {
		return err
	}
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = lockActiveUser(ctx, tx, a.UserID); err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `UPDATE youtube_imports SET credentials=$3,authorization_in_progress=false,cleanup_pending=true,completion_status=CASE WHEN status='cancelled' THEN 'cancelled' ELSE 'failed' END,completion_error=$4,status='cancelled',error=$4,next_poll_at=now(),updated_at=now() WHERE id=$1 AND user_id=$2 AND (status='authorizing' OR (status='cancelled' AND authorization_in_progress))`, a.ID, a.UserID, encrypted, message)
	if err != nil {
		return err
	}
	return tx.Commit()
}

func (h *Handler) loadOverview(ctx context.Context, user string) (Overview, error) {
	result := Overview{Imports: []Import{}, Videos: []Video{}}
	rows, err := h.db.QueryContext(ctx, `SELECT i.id,i.status,i.resources,i.created_at,i.updated_at,i.error,(SELECT count(*) FROM youtube_import_videos v WHERE v.import_id=i.id AND v.deleted_at IS NULL) FROM youtube_imports i WHERE i.user_id=$1 ORDER BY i.created_at DESC LIMIT 50`, user)
	if err != nil {
		return result, err
	}
	for rows.Next() {
		var item Import
		var resources []string
		if err = rows.Scan(&item.ID, &item.Status, pq.Array(&resources), &item.CreatedAt, &item.UpdatedAt, &item.Error, &item.VideoCount); err != nil {
			rows.Close()
			return result, err
		}
		item.Visibilities = resourceVisibilities(resources)
		result.Imports = append(result.Imports, item)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return result, err
	}
	if len(result.Imports) > 0 {
		if err = h.attachSelections(ctx, user, result.Imports); err != nil {
			return result, err
		}
	}
	rows, err = h.db.QueryContext(ctx, `SELECT id,import_id,title,file_name,file_size,source_storage_key,COALESCE(thumbnail_storage_key,''),created_at FROM youtube_import_videos WHERE user_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC,id LIMIT 1000`, user)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var item Video
		if err = rows.Scan(&item.ID, &item.ImportID, &item.Title, &item.FileName, &item.FileSize, &item.SourceStorageKey, &item.thumbnailKey, &item.CreatedAt); err != nil {
			return result, err
		}
		result.Videos = append(result.Videos, item)
	}
	if err = rows.Err(); err != nil {
		return result, err
	}
	h.signPreviews(ctx, result.Videos)
	return result, nil
}

// signPreviews fills thumbnail_url for videos with a stored preview. A signing
// failure leaves the URL empty instead of hiding the whole library.
func (h *Handler) signPreviews(ctx context.Context, videos []Video) {
	if h.previews == nil {
		return
	}
	for i := range videos {
		if videos[i].thumbnailKey == "" {
			continue
		}
		if url, err := h.previews.PreviewURL(ctx, videos[i].thumbnailKey); err == nil {
			videos[i].ThumbnailURL = url
		}
	}
}

func (h *Handler) cancelImport(ctx context.Context, user, id string) (string, error) {
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()
	if err = lockActiveUser(ctx, tx, user); err != nil {
		return "", err
	}
	var encrypted string
	if err = tx.QueryRowContext(ctx, `SELECT credentials FROM youtube_imports WHERE id=$1 AND user_id=$2 FOR UPDATE`, id, user).Scan(&encrypted); err != nil {
		return "", err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE youtube_imports SET status=CASE WHEN status IN ('ready','failed') THEN status ELSE 'cancelled' END,cleanup_pending=(credentials<>'' OR authorization_in_progress),completion_status='cancelled',completion_error='Import stopped. Videos already imported remain in your library.',next_poll_at=now(),lease_token=NULL,lease_until=NULL,error=CASE WHEN status IN ('ready','failed') THEN error ELSE 'Import stopped. Videos already imported remain in your library.' END,updated_at=now() WHERE id=$1 AND user_id=$2`, id, user); err != nil {
		return "", err
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM youtube_import_oauth_states WHERE import_id=$1 AND user_id=$2`, id, user); err != nil {
		return "", err
	}
	return encrypted, tx.Commit()
}

// tombstoneVideo hides the video and returns its source and preview keys
// (the preview is empty when none exists) for removal.
func (h *Handler) tombstoneVideo(ctx context.Context, user, id string) (sourceKey, previewKey string, err error) {
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return "", "", err
	}
	defer tx.Rollback()
	if err = lockActiveUser(ctx, tx, user); err != nil {
		return "", "", err
	}
	err = tx.QueryRowContext(ctx, `UPDATE youtube_import_videos SET deleted_at=COALESCE(deleted_at,now()) WHERE id=$1 AND user_id=$2 RETURNING source_storage_key,COALESCE(thumbnail_storage_key,'')`, id, user).Scan(&sourceKey, &previewKey)
	if err != nil {
		return "", "", err
	}
	return sourceKey, previewKey, tx.Commit()
}

func (h *Handler) claim(ctx context.Context) (importWork, error) {
	var work importWork
	lease, err := randomSecret()
	if err != nil {
		return work, err
	}
	err = h.db.QueryRowContext(ctx, `WITH candidate AS (
		SELECT i.id FROM youtube_imports i JOIN users u ON u.id=i.user_id
		WHERE (i.status IN ('queued','exporting','importing') OR (i.cleanup_pending AND i.credentials<>'')) AND i.next_poll_at<=now()
		AND (i.lease_until IS NULL OR i.lease_until<now())
		AND u.account_status='active' AND u.access_role IN ('member','admin') AND NOT u.email_activation_required
		AND NOT EXISTS(SELECT 1 FROM account_deletion_requests d WHERE d.user_id=i.user_id)
		ORDER BY i.next_poll_at,i.id FOR UPDATE OF i SKIP LOCKED LIMIT 1
	) UPDATE youtube_imports i SET lease_token=$1,lease_until=now()+interval '5 minutes' FROM candidate c WHERE i.id=c.id
	RETURNING i.id,i.user_id,i.status,i.credentials,i.archive_id,i.access_type,i.resources,i.created_at,i.attempts,i.initiate_started_at IS NOT NULL,i.cleanup_pending,i.completion_status,i.completion_error,EXISTS(SELECT 1 FROM youtube_import_selections s WHERE s.import_id=i.id)`, lease).Scan(&work.ID, &work.UserID, &work.Status, &work.Encrypted, &work.ArchiveID, &work.AccessType, pq.Array(&work.Resources), &work.CreatedAt, &work.Attempts, &work.Initiated, &work.CleanupPending, &work.CompletionStatus, &work.CompletionError, &work.Selected)
	work.Lease = lease
	return work, err
}

func (h *Handler) renewLease(ctx context.Context, work importWork) error {
	result, err := h.db.ExecContext(ctx, `UPDATE youtube_imports i SET lease_until=now()+interval '5 minutes' WHERE id=$1 AND lease_token=$2 AND lease_until>now() AND (status IN ('queued','exporting','importing') OR cleanup_pending) AND EXISTS(SELECT 1 FROM users u WHERE u.id=i.user_id AND u.account_status='active' AND u.access_role IN ('member','admin') AND NOT u.email_activation_required) AND NOT EXISTS(SELECT 1 FROM account_deletion_requests d WHERE d.user_id=i.user_id)`, work.ID, work.Lease)
	if err != nil {
		return err
	}
	if count, _ := result.RowsAffected(); count != 1 {
		return errLeaseLost
	}
	return nil
}

func (h *Handler) updateWork(ctx context.Context, work importWork, status, encrypted, archiveID, accessType string) error {
	result, err := h.db.ExecContext(ctx, `UPDATE youtube_imports SET status=$3,credentials=$4,archive_id=$5,access_type=$6,updated_at=now(),attempts=0 WHERE id=$1 AND lease_token=$2 AND lease_until>now() AND status IN ('queued','exporting','importing')`, work.ID, work.Lease, status, encrypted, archiveID, accessType)
	if err != nil {
		return err
	}
	if count, _ := result.RowsAffected(); count != 1 {
		return errLeaseLost
	}
	return nil
}

func (h *Handler) releaseWork(ctx context.Context, work importWork, delay time.Duration, failed bool) error {
	increment := 0
	if failed {
		increment = 1
	}
	_, err := h.db.ExecContext(ctx, `UPDATE youtube_imports SET lease_token=NULL,lease_until=NULL,next_poll_at=now()+($3*interval '1 second'),attempts=attempts+$4,updated_at=now() WHERE id=$1 AND lease_token=$2`, work.ID, work.Lease, delay.Seconds(), increment)
	return err
}

func (h *Handler) finishWork(ctx context.Context, work importWork, status, message string) error {
	// Direct failures (authorization problems before any archive read) reach here
	// without completeImport, so the selected videos are settled on this path too.
	if err := h.settleEndedSelection(ctx, work, status); err != nil {
		return err
	}
	_, err := h.db.ExecContext(ctx, `UPDATE youtube_imports SET status=$3,error=$4,credentials='',cleanup_pending=false,authorization_in_progress=false,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=$1 AND lease_token=$2 AND lease_until>now() AND (status IN ('queued','exporting','importing') OR cleanup_pending)`, work.ID, work.Lease, status, message)
	return err
}

func (h *Handler) markCleanup(ctx context.Context, work importWork, status, message string) error {
	result, err := h.db.ExecContext(ctx, `UPDATE youtube_imports SET cleanup_pending=true,completion_status=$3,completion_error=$4,error=$4,status=CASE WHEN status='cancelled' THEN status ELSE 'importing' END,attempts=0,updated_at=now() WHERE id=$1 AND lease_token=$2 AND lease_until>now() AND status IN ('queued','exporting','importing') AND NOT cleanup_pending`, work.ID, work.Lease, status, message)
	if err != nil {
		return err
	}
	if count, _ := result.RowsAffected(); count != 1 {
		return errLeaseLost
	}
	return nil
}

func (h *Handler) saveCleanupToken(ctx context.Context, work importWork, encrypted string) error {
	result, err := h.db.ExecContext(ctx, `UPDATE youtube_imports SET credentials=$3,updated_at=now() WHERE id=$1 AND lease_token=$2 AND lease_until>now() AND cleanup_pending`, work.ID, work.Lease, encrypted)
	if err != nil {
		return err
	}
	if count, _ := result.RowsAffected(); count != 1 {
		return errLeaseLost
	}
	return nil
}

func (h *Handler) markInitiating(ctx context.Context, work importWork) error {
	result, err := h.db.ExecContext(ctx, `UPDATE youtube_imports SET status='exporting',initiate_started_at=now(),updated_at=now() WHERE id=$1 AND lease_token=$2 AND lease_until>now() AND status='queued' AND initiate_started_at IS NULL`, work.ID, work.Lease)
	if err != nil {
		return err
	}
	if count, _ := result.RowsAffected(); count != 1 {
		return errLeaseLost
	}
	return nil
}

func (h *Handler) videoExists(ctx context.Context, work importWork, relativePath string) (bool, error) {
	var exists bool
	err := h.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM youtube_import_videos WHERE import_id=$1 AND relative_path=$2)`, work.ID, relativePath).Scan(&exists)
	return exists, err
}

// recordVideo stores the library row. previewKey is empty when extraction
// failed; previewAttempts then records that failure for the backfill.
func (h *Handler) recordVideo(ctx context.Context, work importWork, video ImportedVideo, key, previewKey string, previewAttempts int) error {
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = lockActiveUser(ctx, tx, work.UserID); err != nil {
		return err
	}
	var active bool
	err = tx.QueryRowContext(ctx, `SELECT lease_token=$2 AND lease_until>now() AND status='importing' FROM youtube_imports WHERE id=$1 AND user_id=$3 FOR UPDATE`, work.ID, work.Lease, work.UserID).Scan(&active)
	if err != nil || !active {
		return errLeaseLost
	}
	var count int
	if err = tx.QueryRowContext(ctx, `SELECT count(*) FROM youtube_import_videos WHERE user_id=$1 AND deleted_at IS NULL`, work.UserID).Scan(&count); err != nil {
		return err
	}
	if count >= 1000 {
		return errImportBudget
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO youtube_import_videos(import_id,user_id,relative_path,title,file_name,file_size,source_storage_key,thumbnail_storage_key,thumbnail_attempts) VALUES($1,$2,$3,$4,$5,$6,$7,NULLIF($8,''),$9)`, work.ID, work.UserID, video.RelativePath, safeTitle(video.Title, video.FileName), video.FileName, video.Size, key, previewKey, previewAttempts)
	if err != nil {
		return err
	}
	if video.selectedVideoID != "" {
		// The selection moves to importing in the same transaction as the library
		// row, so a restart never leaves a stored video still waiting.
		_, err = tx.ExecContext(ctx, `UPDATE youtube_import_selections SET status='importing',source_storage_key=$3,updated_at=now() WHERE import_id=$1 AND video_id=$2 AND status='waiting'`, work.ID, video.selectedVideoID, key)
		if err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (h *Handler) sweepAuthorizations(ctx context.Context) error {
	if _, err := h.db.ExecContext(ctx, `DELETE FROM youtube_import_oauth_states WHERE expires_at<=now()`); err != nil {
		return err
	}
	_, err := h.db.ExecContext(ctx, `UPDATE youtube_imports SET status='cancelled',credentials='',authorization_in_progress=false,cleanup_pending=false,error='Authorization expired. Connect again.',updated_at=now() WHERE status='authorizing' AND ((NOT authorization_in_progress AND created_at<now()-interval '10 minutes') OR (authorization_in_progress AND updated_at<now()-interval '2 minutes'))`)
	if err == nil {
		_, err = h.db.ExecContext(ctx, `UPDATE youtube_imports SET cleanup_pending=false,authorization_in_progress=false,updated_at=now() WHERE status='cancelled' AND cleanup_pending AND credentials='' AND updated_at<now()-interval '2 minutes'`)
	}
	return err
}

func (h *Handler) queueSourceCleanup(ctx context.Context, user, key string) error {
	_, err := h.db.ExecContext(ctx, `INSERT INTO youtube_import_cleanup(source_storage_key,user_id) SELECT $1,id FROM users WHERE id=$2 ON CONFLICT(source_storage_key) DO NOTHING`, key, user)
	return err
}

func (h *Handler) cleanOneSource(ctx context.Context) error {
	var user, key string
	err := h.db.QueryRowContext(ctx, `SELECT user_id,source_storage_key FROM youtube_import_cleanup WHERE next_attempt_at<=now() ORDER BY next_attempt_at LIMIT 1`).Scan(&user, &key)
	if err != nil {
		return err
	}
	if err = h.media.RemoveImportSource(ctx, user, key); err != nil {
		_, updateErr := h.db.ExecContext(ctx, `UPDATE youtube_import_cleanup SET next_attempt_at=now()+interval '1 hour' WHERE source_storage_key=$1`, key)
		return updateErr
	}
	_, err = h.db.ExecContext(ctx, `DELETE FROM youtube_import_cleanup WHERE source_storage_key=$1`, key)
	return err
}

func isNoWork(err error) bool {
	return errors.Is(err, sql.ErrNoRows) || errors.Is(err, errLeaseLost)
}
