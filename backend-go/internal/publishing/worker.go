package publishing

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"
)

// Start resumes durable jobs after restart. Unknown mutation outcomes are never
// automatically retried: the platform may have accepted the original request.
func (h *Handler) Start(parent context.Context) func() {
	ctx, cancel := context.WithCancel(parent)
	done := make(chan struct{})
	go func() {
		defer close(done)
		if !h.cfg.Enabled {
			return
		}
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				work, c := context.WithTimeout(ctx, 100*time.Second)
				_ = h.runOne(work)
				c()
			}
		}
	}()
	return func() { cancel(); <-done }
}

type workItem struct {
	ID, UserID, AccountID, Provider, Status, RemoteID, Caption, Reference string
	Options                                                               TikTokOptions
	Finalized                                                             bool
	CreatedAt                                                             time.Time
}

func (h *Handler) runOne(ctx context.Context) error {
	// No mutation request is retried after process death or timeout.
	_, e := h.db.ExecContext(ctx, `UPDATE social_posts SET status='unknown',error='Publication outcome is unknown. Check the destination account before posting again.',updated_at=now() WHERE status IN ('submitting','finalizing') AND updated_at<now()-interval '5 minutes'`)
	if e != nil {
		return e
	}
	_, _ = h.db.ExecContext(ctx, `DELETE FROM social_oauth_states WHERE expires_at<now()`)
	tx, e := h.db.BeginTx(ctx, nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	var job workItem
	var raw []byte
	e = tx.QueryRowContext(ctx, `SELECT id,user_id,account_id,provider,status,remote_id,caption,options,finalized,created_at,media_reference FROM social_posts WHERE status IN ('queued','processing') AND next_attempt_at<=now() ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 1`).Scan(&job.ID, &job.UserID, &job.AccountID, &job.Provider, &job.Status, &job.RemoteID, &job.Caption, &raw, &job.Finalized, &job.CreatedAt, &job.Reference)
	if e == sql.ErrNoRows {
		return nil
	}
	if e != nil {
		return e
	}
	if json.Unmarshal(raw, &job.Options) != nil {
		return errInvalid
	}
	next := job.Status
	if next == "queued" {
		next = "submitting"
	}
	_, e = tx.ExecContext(ctx, `UPDATE social_posts SET status=$2,updated_at=now(),next_attempt_at=now()+interval '2 minutes' WHERE id=$1`, job.ID, next)
	if e != nil {
		return e
	}
	if e = tx.Commit(); e != nil {
		return e
	}
	return h.process(ctx, job, false)
}
func (h *Handler) process(ctx context.Context, job workItem, finalize bool) error {
	tx, e := h.db.BeginTx(ctx, nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	// Same lock order as deletion and enqueue. Holding these during an external
	// action prevents disconnect/deletion from racing the permission check.
	var active bool
	e = tx.QueryRowContext(ctx, `SELECT NOT EXISTS(SELECT 1 FROM account_deletion_requests d WHERE d.user_id=u.id) FROM users u WHERE id=$1 FOR UPDATE`, job.UserID).Scan(&active)
	if e == sql.ErrNoRows {
		return nil
	}
	if e != nil {
		return e
	}
	var a Account
	e = tx.QueryRowContext(ctx, `SELECT id,user_id,provider,remote_id,name,username,status,credentials FROM social_accounts WHERE id=$1 AND user_id=$2 FOR UPDATE`, job.AccountID, job.UserID).Scan(&a.ID, &a.UserID, &a.Provider, &a.RemoteID, &a.Name, &a.Username, &a.Status, &a.Encrypted)
	if e == sql.ErrNoRows {
		return nil
	}
	if e != nil {
		return e
	}
	var current string
	e = tx.QueryRowContext(ctx, `SELECT status FROM social_posts WHERE id=$1 FOR UPDATE`, job.ID).Scan(&current)
	if e != nil {
		return e
	}
	expected := job.Status
	if expected == "queued" {
		expected = "submitting"
	}
	if finalize {
		expected = "finalizing"
	}
	if current != expected {
		return nil
	}
	set := func(status, message, remote, link string) error {
		_, err := tx.ExecContext(ctx, `UPDATE social_posts SET status=$2,error=$3,remote_id=$4,url=$5,updated_at=now(),next_attempt_at=now()+interval '20 seconds' WHERE id=$1`, job.ID, status, message, remote, link)
		if err != nil {
			return err
		}
		return tx.Commit()
	}
	if !active || a.Status != "connected" {
		return set("cancelled", "Account is no longer connected.", job.RemoteID, "")
	}
	if !h.configured(a.Provider) {
		return set("failed", "Provider configuration is unavailable.", job.RemoteID, "")
	}
	creds, e := h.credentials(a)
	if e != nil {
		return set("failed", "Reconnect this account.", job.RemoteID, "")
	}
	if !creds.ExpiresAt.IsZero() && time.Until(creds.ExpiresAt) < 5*time.Minute {
		creds, e = h.client.Refresh(ctx, a.Provider, creds)
		if e != nil {
			return set("failed", "Account authorization expired. Reconnect the account.", job.RemoteID, "")
		}
		encrypted, err := seal(h.vault, creds, a.UserID+":"+a.Provider+":"+a.RemoteID)
		if err != nil {
			return err
		}
		if _, e = tx.ExecContext(ctx, `UPDATE social_accounts SET credentials=$2,updated_at=now() WHERE id=$1`, a.ID, encrypted); e != nil {
			return e
		}
	}
	if finalize {
		id, link, err := h.client.Finalize(ctx, a.Provider, job.RemoteID, creds)
		if err != nil {
			return set("unknown", "Publication outcome is unknown. Check the destination account before posting again.", job.RemoteID, "")
		}
		if a.Provider == "facebook" {
			_, e = tx.ExecContext(ctx, `UPDATE social_posts SET finalized=true WHERE id=$1`, job.ID)
			if e != nil {
				return e
			}
			return set("processing", "", job.RemoteID, link)
		}
		return set("published", "", id, link)
	}
	if job.Status == "queued" {
		var currentReference string
		var badge sql.NullBool
		e = tx.QueryRowContext(ctx, `SELECT COALESCE(NULLIF(c.file_storage_key,''),NULLIF(c.file_path,''),c.file_url,''),c.contains_platform_badge FROM clips c JOIN social_posts p ON p.clip_id=c.id AND p.user_id=c.user_id WHERE p.id=$1 FOR SHARE OF c`, job.ID).Scan(&currentReference, &badge)
		if e != nil || currentReference != job.Reference || (a.Provider == "tiktok" && (!badge.Valid || badge.Bool)) {
			return set("failed", "The clip is no longer available.", "", "")
		}
		source, err := h.media.SignedURL(ctx, job.Reference)
		if err != nil || !publicHTTPS(source) {
			return set("failed", "A public HTTPS video URL is required.", "", "")
		}
		id, status, err := h.client.Publish(ctx, a.Provider, a.RemoteID, creds, source, job.Caption, job.Options)
		if err != nil {
			return set("unknown", "Publication outcome is unknown. Check the destination account before posting again.", id, "")
		}
		if status != "processing" && status != "published" {
			status = "unknown"
		}
		return set(status, "", id, "")
	}
	status, link, err := h.client.Poll(ctx, a.Provider, job.RemoteID, creds)
	if status == "failed" {
		return set("failed", "The platform could not process this video.", job.RemoteID, "")
	}
	if time.Since(job.CreatedAt) > 24*time.Hour && status != "published" {
		return set("unknown", "Could not confirm the final platform status.", job.RemoteID, "")
	}
	if err != nil {
		if time.Since(job.CreatedAt) > 24*time.Hour {
			return set("unknown", "Could not confirm the final platform status.", job.RemoteID, "")
		}
		return set("processing", "Waiting for platform status.", job.RemoteID, "")
	}
	if status == "ready" && !job.Finalized {
		if e = set("finalizing", "", job.RemoteID, ""); e != nil {
			return e
		}
		return h.process(ctx, job, true)
	}
	if status == "ready" {
		status = "processing"
	}
	if status != "published" && status != "failed" {
		status = "processing"
	}
	message := ""
	if status == "failed" {
		message = "The platform could not process this video."
	}
	return set(status, message, job.RemoteID, link)
}
