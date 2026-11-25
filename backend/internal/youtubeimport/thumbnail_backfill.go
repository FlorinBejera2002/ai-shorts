package youtubeimport

import (
	"context"
	"log/slog"
	"time"
)

// Backfill is deliberately small: a bounded batch per poller tick keeps the
// ffmpeg work away from the import lease and the request path.
const (
	previewBatchSize = 5
	previewLease     = 5 * time.Minute
)

type previewWork struct {
	ID, UserID, SourceKey string
}

// backfillPreviews gives imported videos stored before previews existed (and
// those whose import-time extraction failed) a preview, a few at a time.
func (h *Handler) backfillPreviews(ctx context.Context) error {
	if h.previews == nil {
		return nil
	}
	batch, err := h.claimPreviewBatch(ctx)
	if err != nil {
		return err
	}
	for _, work := range batch {
		if ctx.Err() != nil {
			return nil
		}
		h.backfillPreview(ctx, work)
	}
	return nil
}

// claimPreviewBatch leases rows like the import worker does, so overlapping API
// processes never extract the same video twice. Deleted videos and inactive or
// deleting accounts are skipped.
func (h *Handler) claimPreviewBatch(ctx context.Context) ([]previewWork, error) {
	rows, err := h.db.QueryContext(ctx, `WITH candidate AS (
		SELECT v.id FROM youtube_import_videos v JOIN users u ON u.id=v.user_id
		WHERE v.deleted_at IS NULL AND v.thumbnail_storage_key IS NULL AND v.thumbnail_attempts<$1
		AND (v.thumbnail_lease_until IS NULL OR v.thumbnail_lease_until<now())
		AND u.account_status='active' AND u.access_role IN ('member','admin') AND NOT u.email_activation_required
		AND NOT EXISTS(SELECT 1 FROM account_deletion_requests d WHERE d.user_id=v.user_id)
		ORDER BY v.created_at,v.id FOR UPDATE OF v SKIP LOCKED LIMIT $2
	) UPDATE youtube_import_videos v SET thumbnail_lease_until=now()+($3*interval '1 second') FROM candidate c WHERE v.id=c.id
	RETURNING v.id,v.user_id,v.source_storage_key`, maxPreviewAttempts, previewBatchSize, previewLease.Seconds())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var batch []previewWork
	for rows.Next() {
		var work previewWork
		if err = rows.Scan(&work.ID, &work.UserID, &work.SourceKey); err != nil {
			return nil, err
		}
		batch = append(batch, work)
	}
	return batch, rows.Err()
}

// backfillPreview extracts one preview. A failure counts as an attempt and
// releases the lease; a video that was deleted meanwhile gets its new frame removed.
func (h *Handler) backfillPreview(ctx context.Context, work previewWork) {
	key, err := h.buildPreview(ctx, work)
	if err != nil {
		if ctx.Err() != nil {
			// Shutdown is not the video's fault; the lease expires and another pass retries.
			return
		}
		if _, releaseErr := h.db.ExecContext(ctx, `UPDATE youtube_import_videos SET thumbnail_attempts=thumbnail_attempts+1,thumbnail_lease_until=NULL WHERE id=$1 AND thumbnail_storage_key IS NULL`, work.ID); releaseErr != nil {
			slog.Error("YouTube import preview attempt could not be recorded", "video_id", work.ID)
		}
		slog.Warn("YouTube import preview backfill failed", "video_id", work.ID)
		return
	}
	result, err := h.db.ExecContext(ctx, `UPDATE youtube_import_videos SET thumbnail_storage_key=$2,thumbnail_lease_until=NULL WHERE id=$1 AND deleted_at IS NULL AND thumbnail_storage_key IS NULL`, work.ID, key)
	if err != nil {
		slog.Error("YouTube import preview could not be saved", "video_id", work.ID)
		return
	}
	if count, _ := result.RowsAffected(); count != 1 {
		// The video was removed or another worker won; the new object is unreferenced.
		if queueErr := h.queueSourceCleanup(ctx, work.UserID, key); queueErr != nil {
			slog.Error("YouTube import preview cleanup could not be queued", "video_id", work.ID)
		}
	}
}

func (h *Handler) buildPreview(ctx context.Context, work previewWork) (string, error) {
	source, err := h.previews.ImportSourceLocation(ctx, work.SourceKey)
	if err != nil {
		return "", err
	}
	jpeg, err := ExtractPreview(ctx, h.cfg.FFmpegPath, source)
	if err != nil {
		return "", err
	}
	return h.previews.StorePreview(ctx, work.UserID, jpeg)
}
