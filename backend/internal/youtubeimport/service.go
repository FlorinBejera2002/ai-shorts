package youtubeimport

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"os"
	"path/filepath"
	"time"
)

// Start resumes imports independently of the media-generation worker. Closing
// the page or restarting this API process does not lose Google's archive job.
func (h *Handler) Start(parent context.Context) func() {
	ctx, cancel := context.WithCancel(parent)
	done := make(chan struct{})
	go func() {
		defer close(done)
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if h.media != nil {
					if err := h.cleanOneSource(ctx); err != nil && !isNoWork(err) && ctx.Err() == nil {
						slog.Error("YouTube import source cleanup failed")
					}
				}
				if err := h.backfillPreviews(ctx); err != nil && !isNoWork(err) && ctx.Err() == nil {
					slog.Error("YouTube import preview backfill failed")
				}
				if !h.cfg.Enabled {
					continue
				}
				if err := h.sweepAuthorizations(ctx); err != nil && ctx.Err() == nil {
					slog.Error("YouTube import authorization maintenance failed")
				}
				if err := h.runOne(ctx); err != nil && !isNoWork(err) && ctx.Err() == nil {
					// Provider failures can contain tokens or signed archive URLs.
					// Public state and logs use deliberate, stable messages instead.
					slog.Error("YouTube import processing failed")
				}
			}
		}
	}()
	return func() { cancel(); <-done }
}

func (h *Handler) runOne(parent context.Context) error {
	work, err := h.claim(parent)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(parent, 2*time.Hour)
	defer cancel()
	heartbeatDone := make(chan struct{})
	go func() {
		defer close(heartbeatDone)
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if err := h.renewLease(ctx, work); err != nil {
					cancel()
					return
				}
			}
		}
	}()
	err = h.process(ctx, work)
	cancel()
	<-heartbeatDone
	if parent.Err() != nil {
		// Restore the durable lease for another process after graceful shutdown.
		cleanup, stop := context.WithTimeout(context.Background(), 5*time.Second)
		defer stop()
		_ = h.releaseWork(cleanup, work, 0, false)
	}
	return err
}

func (h *Handler) process(ctx context.Context, work importWork) error {
	if work.Encrypted == "" {
		return h.finishWork(ctx, work, "failed", "YouTube authorization is unavailable. Connect again.")
	}
	token, err := decryptToken(h.vault, work.Encrypted, work.UserID+":"+work.ID)
	if err != nil {
		return h.finishWork(ctx, work, "failed", "YouTube authorization could not be read. Connect again.")
	}
	if work.CleanupPending {
		return h.cleanupAuthorization(ctx, work, token)
	}
	if time.Since(work.CreatedAt) > h.cfg.MaxImportAge {
		return h.completeImport(ctx, work, token, "failed", "The YouTube export took too long. Connect again to start a new import.")
	}
	if !token.ExpiresAt.IsZero() && token.ExpiresAt.Before(time.Now().Add(time.Minute)) {
		if token.RefreshToken == "" {
			return h.finishWork(ctx, work, "failed", "YouTube authorization expired. Connect again.")
		}
		token, err = h.client.Refresh(ctx, token)
		if err != nil {
			if definitiveGrantRejection(err) {
				return h.finishWork(ctx, work, "failed", "YouTube authorization expired or was revoked. Connect again.")
			}
			return h.retryRead(ctx, work, "YouTube authorization expired or was revoked. Connect again.")
		}
		work.Encrypted, err = encryptToken(h.vault, token, work.UserID+":"+work.ID)
		if err != nil {
			return h.finishWork(ctx, work, "failed", "Could not update YouTube authorization. Connect again.")
		}
		if err = h.updateWork(ctx, work, work.Status, work.Encrypted, work.ArchiveID, work.AccessType); err != nil {
			return err
		}
	}
	if work.Status == "queued" {
		if err = h.markInitiating(ctx, work); err != nil {
			return err
		}
		job, initiateErr := h.client.Initiate(ctx, token.AccessToken, work.Resources)
		if initiateErr != nil {
			// Initiate is a mutation. Its outcome may be unknown after a timeout;
			// retrying could consume consent twice or start an unexpected export.
			return h.completeImport(ctx, work, token, "failed", "Google could not confirm the export request. Check account eligibility and connect again.")
		}
		work.ArchiveID, work.AccessType, work.Status = job.ID, job.AccessType, "exporting"
		if err = h.updateWork(ctx, work, work.Status, work.Encrypted, work.ArchiveID, work.AccessType); err != nil {
			return err
		}
	} else if work.ArchiveID == "" {
		// A crash between remote initiation and saving the response must not
		// silently initiate a second export on restart.
		return h.completeImport(ctx, work, token, "failed", "The export request could not be confirmed after a restart. Connect again.")
	}
	state, err := h.client.State(ctx, token.AccessToken, work.ArchiveID)
	if err != nil {
		if definitiveGrantRejection(err) {
			return h.finishWork(ctx, work, "failed", "YouTube authorization expired or was revoked. Connect again.")
		}
		return h.retryRead(ctx, work, "The YouTube export could not be retrieved. Connect again.")
	}
	switch state.State {
	case "IN_PROGRESS":
		if err = h.updateWork(ctx, work, "exporting", work.Encrypted, work.ArchiveID, work.AccessType); err != nil {
			return err
		}
		return h.releaseWork(ctx, work, h.cfg.PollInterval, false)
	case "FAILED", "CANCELLED":
		return h.completeImport(ctx, work, token, "failed", "Google did not complete the export. Check account eligibility and connect again.")
	case "COMPLETE":
		if err = h.updateWork(ctx, work, "importing", work.Encrypted, work.ArchiveID, work.AccessType); err != nil {
			return err
		}
		work.Status = "importing"
		if err = h.importVideos(ctx, work, state.URLs); err != nil {
			if ctx.Err() != nil || errors.Is(err, errLeaseLost) {
				return err
			}
			return h.completeImport(ctx, work, token, "failed", "Some videos could not be imported. Completed videos remain available; check file limits or connect again.")
		}
		return h.completeImport(ctx, work, token, "ready", "")
	default:
		return h.retryRead(ctx, work, "Google returned an unknown export state. Connect again.")
	}
}

func (h *Handler) retryRead(ctx context.Context, work importWork, message string) error {
	if work.Attempts >= 11 || time.Since(work.CreatedAt) > h.cfg.MaxImportAge {
		if token, err := decryptToken(h.vault, work.Encrypted, work.UserID+":"+work.ID); err == nil {
			return h.completeImport(ctx, work, token, "failed", message)
		}
		return h.finishWork(ctx, work, "failed", message)
	}
	delay := time.Minute * time.Duration(1<<min(work.Attempts, 6))
	return h.releaseWork(ctx, work, delay, true)
}

// settleEndedSelection settles the selected videos of an import that ends without
// success. A ready import has already settled them when its archive was read.
func (h *Handler) settleEndedSelection(ctx context.Context, work importWork, status string) error {
	if !work.Selected || status == "ready" {
		return nil
	}
	return h.settleSelection(ctx, work)
}

func (h *Handler) completeImport(ctx context.Context, work importWork, token Token, status, message string) error {
	if err := h.markCleanup(ctx, work, status, message); err != nil {
		return err
	}
	if err := h.settleEndedSelection(ctx, work, status); err != nil {
		return err
	}
	work.CleanupPending = true
	work.CompletionStatus, work.CompletionError = status, message
	return h.cleanupAuthorization(ctx, work, token)
}

// Cleanup is a durable stage, separate from archive ingestion. Refresh before
// using a token after a long download; retries never download the archive again.
// Keep the per-user active guard until Google confirms cleanup, so revoking an
// old grant cannot revoke a newer consent in the same dedicated Cloud project.
func (h *Handler) cleanupAuthorization(ctx context.Context, work importWork, token Token) error {
	if err := h.renewLease(ctx, work); err != nil {
		return err
	}
	if !token.ExpiresAt.IsZero() && token.ExpiresAt.Before(time.Now().Add(time.Minute)) {
		if token.RefreshToken == "" {
			return h.finishWork(ctx, work, work.CompletionStatus, work.CompletionError)
		}
		refreshed, err := h.client.Refresh(ctx, token)
		if err != nil {
			if definitiveGrantRejection(err) {
				return h.finishWork(ctx, work, work.CompletionStatus, work.CompletionError)
			}
			return h.retryCleanup(ctx, work)
		}
		token = refreshed
		encrypted, err := encryptToken(h.vault, token, work.UserID+":"+work.ID)
		if err != nil {
			return err
		}
		if err = h.saveCleanupToken(ctx, work, encrypted); err != nil {
			return err
		}
	}
	err := h.cleanupRemote(ctx, work, token)
	if err != nil {
		if definitiveGrantRejection(err) {
			return h.finishWork(ctx, work, work.CompletionStatus, work.CompletionError)
		}
		var api *APIError
		if errors.As(err, &api) && api.StatusCode == 401 && token.RefreshToken != "" {
			// Refresh on the next cleanup attempt even when Google's previous
			// expiry estimate said this access token was still current.
			token.ExpiresAt = time.Unix(1, 0)
			encrypted, sealErr := encryptToken(h.vault, token, work.UserID+":"+work.ID)
			if sealErr != nil {
				return sealErr
			}
			if saveErr := h.saveCleanupToken(ctx, work, encrypted); saveErr != nil {
				return saveErr
			}
		}
		return h.retryCleanup(ctx, work)
	}
	return h.finishWork(ctx, work, work.CompletionStatus, work.CompletionError)
}

func (h *Handler) cleanupRemote(ctx context.Context, work importWork, token Token) error {
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = lockActiveUser(ctx, tx, work.UserID); err != nil {
		return err
	}
	var active bool
	err = tx.QueryRowContext(ctx, `SELECT lease_token=$2 AND lease_until>now() AND cleanup_pending FROM youtube_imports WHERE id=$1 AND user_id=$3 FOR UPDATE`, work.ID, work.Lease, work.UserID).Scan(&active)
	if err != nil || !active {
		return errLeaseLost
	}
	// Cancellation and new consent take the same user lock. Hold it across the
	// short remote mutation, so a released/replaced worker cannot revoke a fresh
	// connection after a concurrent cancellation.
	remote, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	if work.AccessType != "" || len(GrantedResources(token.Scope, work.Resources)) > 0 {
		err = h.client.Reset(remote, token.AccessToken)
	} else {
		// A token carrying no Data Portability permission cannot call Reset.
		err = h.client.Revoke(remote, token.AccessToken)
	}
	if commitErr := tx.Commit(); commitErr != nil {
		return commitErr
	}
	return err
}

func definitiveGrantRejection(err error) bool {
	var api *APIError
	return errors.As(err, &api) && (api.Code == "invalid_grant" || api.Code == "invalid_token")
}

func (h *Handler) retryCleanup(ctx context.Context, work importWork) error {
	// A provider outage must not discard the only token that can reset exhausted
	// one-time scopes. Retry at a bounded rate, while the imported library remains
	// available and the guard prevents a competing consent.
	delay := time.Minute * time.Duration(1<<min(work.Attempts, 6))
	return h.releaseWork(ctx, work, delay, true)
}

func authorizationRejected(err error) bool {
	var api *APIError
	return errors.As(err, &api) && (api.StatusCode == 401 || api.StatusCode == 403 || api.Code == "invalid_grant")
}

// errVideosSkipped reports that the archive was read but at least one video was
// rejected (malware scan, size, signature or conversion); the others were kept.
var errVideosSkipped = errors.New("some YouTube videos were skipped")

// temporaryFailure reports an ImportSource error that may pass on a later attempt
// (scanner or storage unavailable), as opposed to a rejection of the video itself.
func temporaryFailure(err error) bool {
	var temporary interface{ Temporary() bool }
	return errors.As(err, &temporary) && temporary.Temporary()
}

func (h *Handler) importVideos(ctx context.Context, work importWork, urls []string) error {
	root := h.cfg.TempRoot
	if root == "" {
		root = filepath.Join(os.TempDir(), "sneepcut-youtube-import")
	}
	if err := os.MkdirAll(root, 0700); err != nil {
		return err
	}
	directory, err := os.MkdirTemp(root, work.ID+"-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(directory)
	// A selected import reads only the chosen videos; the rest are never copied.
	var plan *selectionPlan
	var selector VideoSelector
	if work.Selected {
		if plan, err = h.loadSelectionPlan(ctx, work); err != nil {
			return err
		}
		selector = &selectionSelector{handler: h, work: work, plan: plan}
	}
	skipped := 0
	err = h.client.ImportArchivesSelected(ctx, urls, directory, h.cfg.Limits, selector, func(ctx context.Context, video ImportedVideo) error {
		if err := h.renewLease(ctx, work); err != nil {
			return err
		}
		exists, err := h.videoExists(ctx, work, video.RelativePath)
		if err != nil || exists {
			return err
		}
		var chosen *selectedVideo
		if plan != nil {
			// Ambiguous files never reach this point; the selector excluded them.
			chosen, _ = plan.match(video)
			if chosen == nil {
				return nil
			}
			video.selectedVideoID = chosen.videoID
		}
		key, err := h.media.ImportSource(ctx, work.UserID, video)
		if err != nil {
			if ctx.Err() != nil || temporaryFailure(err) {
				return err
			}
			// One rejected video must not drop the rest of the export. The title stays
			// out of the log; the size and cause are enough to diagnose limits.
			skipped++
			slog.Warn("YouTube import skipped a video", "import_id", work.ID, "bytes", video.Size, "error", err)
			if chosen != nil {
				return h.rejectSelection(ctx, work, chosen, selectionRejected)
			}
			return nil
		}
		if sized, ok := h.media.(interface {
			ImportSourceSize(context.Context, string) (int64, error)
		}); ok {
			var size int64
			size, err = sized.ImportSourceSize(ctx, key)
			if err == nil && size <= 0 {
				err = sql.ErrNoRows
			}
			if err == nil {
				video.Size = size
			}
		}
		// Only a video that will be recorded gets a preview; a rejected one would
		// upload a JPEG just to delete it again.
		var previewKey string
		if err == nil {
			var previewAttempts int
			previewKey, previewAttempts = h.storePreview(ctx, work, video)
			err = h.recordVideo(ctx, work, video, key, previewKey, previewAttempts)
		}
		if err == nil {
			if chosen != nil {
				// The video is stored; its clip job is queued from here. A job failure
				// never removes the stored video.
				chosen.status = selectionImporting
				return h.startSelectionJobs(ctx, work)
			}
			return nil
		}
		// An import may be cancelled or the owner may request deletion while a
		// video is being scanned/stored. Never leave its unrecorded files behind.
		cleanup, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		for _, stored := range storedKeys(key, previewKey) {
			if cleanupErr := h.media.RemoveImportSource(cleanup, work.UserID, stored); cleanupErr != nil {
				if queueErr := h.queueSourceCleanup(cleanup, work.UserID, stored); queueErr != nil {
					slog.Error("YouTube import source cleanup could not be queued", "import_id", work.ID)
				}
			}
		}
		if uniqueViolation(err) {
			// Another lease may have committed the same archive member first.
			return nil
		}
		return err
	})
	if err == nil && skipped > 0 {
		err = errVideosSkipped
	}
	// The archive has been read in full, so every chosen video is now either
	// queued, rejected, or not in the export.
	if plan != nil && (err == nil || errors.Is(err, errVideosSkipped)) {
		if finishErr := h.finishSelection(ctx, work); finishErr != nil {
			return finishErr
		}
	}
	return err
}
