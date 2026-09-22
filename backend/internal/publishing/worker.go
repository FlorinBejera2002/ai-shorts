package publishing

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log/slog"
	"slices"
	"time"

	"github.com/lib/pq"
	"sneepcut/backend-go/internal/data"
)

// Start resumes durable jobs after restart. Unknown mutation outcomes are never
// automatically retried: the platform may have accepted the original request.
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
				work, c := context.WithTimeout(ctx, 30*time.Minute)
				if err := h.maintainYouTubeData(work); err != nil {
					slog.Error("YouTube data maintenance failed", "error", err)
				}
				if err := h.maintainLinkedInData(work); err != nil {
					slog.Error("LinkedIn data maintenance failed", "error", err)
				}
				if !h.cfg.Enabled {
					c()
					continue
				}
				if err := h.reconcileCalendar(work); err != nil {
					slog.Error("publishing calendar reconciliation failed", "error", err)
				}
				if err := h.dispatchCalendar(work); err != nil {
					slog.Error("publishing calendar dispatch failed", "error", err)
				}
				if err := h.runOne(work); err != nil {
					slog.Error("publishing job failed", "error", err)
				}
				c()
			}
		}
	}()
	return func() { cancel(); <-done }
}

func (h *Handler) reconcileCalendar(ctx context.Context) error {
	_, e := h.db.ExecContext(ctx, `UPDATE scheduled_posts s SET status='published',publishing_error='',updated_at=now()
		WHERE s.status='publishing' AND EXISTS(SELECT 1 FROM social_posts p WHERE p.scheduled_post_id=s.id)
		AND NOT EXISTS(SELECT 1 FROM social_posts p WHERE p.scheduled_post_id=s.id AND p.status<>'published')`)
	if e != nil {
		return e
	}
	_, e = h.db.ExecContext(ctx, `UPDATE scheduled_posts s SET status='failed',publishing_error=COALESCE((
		SELECT NULLIF(p.error,'') FROM social_posts p WHERE p.scheduled_post_id=s.id
		AND p.status IN ('failed','unknown','cancelled') ORDER BY p.updated_at DESC LIMIT 1
	),'Publication failed. Check the destination account and try again.'),updated_at=now()
		WHERE s.status='publishing' AND EXISTS(SELECT 1 FROM social_posts p WHERE p.scheduled_post_id=s.id AND p.status IN ('failed','unknown','cancelled'))`)
	return e
}

func (h *Handler) failCalendar(ctx context.Context, tx *sql.Tx, id, message string) error {
	_, e := tx.ExecContext(ctx, `UPDATE scheduled_posts SET status='failed',publishing_error=$2,updated_at=now() WHERE id=$1`, id, message)
	if e != nil {
		return e
	}
	return tx.Commit()
}

// dispatchCalendar atomically turns one due calendar entry into the same
// durable jobs used by Publish now. It never guesses a destination account.
func (h *Handler) dispatchCalendar(ctx context.Context) error {
	var candidateID, candidateUserID string
	var candidateAccountIDs pq.StringArray
	e := h.db.QueryRowContext(ctx, `SELECT id,user_id,account_ids FROM scheduled_posts WHERE status='scheduled' AND scheduled_at<=now() ORDER BY scheduled_at,id LIMIT 1`).Scan(&candidateID, &candidateUserID, &candidateAccountIDs)
	if errors.Is(e, sql.ErrNoRows) {
		return nil
	}
	if e != nil {
		return e
	}
	prepareErr := h.prepareTikTokCredentials(ctx, candidateUserID, []string(candidateAccountIDs))

	tx, e := h.db.BeginTx(ctx, nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	// Match scheduling, disconnect and data deletion: owner before dependent rows.
	var ownerActive bool
	if e = tx.QueryRowContext(ctx, `SELECT NOT EXISTS(SELECT 1 FROM account_deletion_requests d WHERE d.user_id=u.id) FROM users u WHERE id=$1 FOR UPDATE`, candidateUserID).Scan(&ownerActive); e != nil || !ownerActive {
		return e
	}
	var id, userID, caption, reference, tiktokReference string
	var clipID sql.NullString
	var accountIDs pq.StringArray
	var postMedia, tiktokJSON, igJSON, youtubeJSON []byte
	e = tx.QueryRowContext(ctx, `SELECT s.id,s.user_id,s.clip_id,COALESCE(s.caption,''),s.account_ids,
		COALESCE(NULLIF(c.file_storage_key,''),NULLIF(c.file_path,''),c.file_url,''),
		COALESCE(NULLIF(c.tiktok_file_storage_key,''),NULLIF(c.file_storage_key,''),NULLIF(c.file_path,''),c.file_url,''),s.media,s.tiktok_options,s.instagram_options,s.youtube_options
		FROM scheduled_posts s LEFT JOIN clips c ON c.id=s.clip_id AND c.user_id=s.user_id
		WHERE s.id=$1 AND s.status='scheduled' AND s.scheduled_at<=now()
		FOR UPDATE OF s`, candidateID).Scan(&id, &userID, &clipID, &caption, &accountIDs, &reference, &tiktokReference, &postMedia, &tiktokJSON, &igJSON, &youtubeJSON)
	if errors.Is(e, sql.ErrNoRows) {
		return nil
	}
	if e != nil {
		return e
	}
	if userID != candidateUserID || !slices.Equal([]string(accountIDs), []string(candidateAccountIDs)) {
		return nil
	}
	if prepareErr != nil {
		return h.failCalendar(ctx, tx, id, "TikTok authorization could not be refreshed. Reconnect the account and reschedule the post.")
	}
	if reference == "" && string(postMedia) != "[]" {
		reference = string(postMedia)
	}
	if reference == "" || len(accountIDs) == 0 {
		return h.failCalendar(ctx, tx, id, "Choose an available clip and at least one connected account.")
	}
	selectedMedia := []PublishMedia{{Type: "video", URL: reference}}
	if !clipID.Valid {
		var attached []struct{ Type, Reference string }
		if json.Unmarshal(postMedia, &attached) != nil || len(attached) == 0 {
			return h.failCalendar(ctx, tx, id, "Choose available images or videos before publication.")
		}
		selectedMedia = make([]PublishMedia, 0, len(attached))
		for _, item := range attached {
			selectedMedia = append(selectedMedia, PublishMedia{Type: item.Type, URL: item.Reference})
		}
	}
	var tiktokOptions TikTokOptions
	if json.Unmarshal(tiktokJSON, &tiktokOptions) != nil {
		return h.failCalendar(ctx, tx, id, "The saved TikTok settings are invalid. Review the post and schedule it again.")
	}
	var youtubeOptions YouTubeOptions
	if json.Unmarshal(youtubeJSON, &youtubeOptions) != nil {
		return h.failCalendar(ctx, tx, id, "Review the YouTube settings.")
	}
	requestHash := digest(string(youtubeJSON) + id + ":" + reference + ":" + caption + ":" + string(tiktokJSON))
	providers := make([]string, 0, len(accountIDs))
	tiktokAccounts := 0
	for _, accountID := range accountIDs {
		var provider string
		e = tx.QueryRowContext(ctx, `SELECT provider FROM social_accounts WHERE id=$1 AND user_id=$2 AND status='connected' AND (provider IN ('tiktok','youtube') OR COALESCE(token_expires_at>now(),true)) FOR UPDATE`, accountID, userID).Scan(&provider)
		if e != nil || (provider != "instagram" && provider != "facebook" && provider != "tiktok" && provider != "youtube" && provider != "linkedin") || !h.configured(provider) {
			return h.failCalendar(ctx, tx, id, "A selected account is disconnected or unavailable. Reconnect it and reschedule the post.")
		}
		if provider == "youtube" {
			if _, err := h.ValidateYouTubeSchedule(ctx, tx, userID, accountID, youtubeOptions); err != nil {
				return h.failCalendar(ctx, tx, id, "Review YouTube settings and reconnect the channel if necessary.")
			}
		}
		if provider == "linkedin" {
			if _, err := h.ValidateLinkedInSchedule(ctx, tx, userID, accountID); err != nil {
				return h.failCalendar(ctx, tx, id, "Reconnect LinkedIn and review the selected destination.")
			}
		}
		if provider == "tiktok" {
			tiktokAccounts++
		}
		providers = append(providers, provider)
	}
	if tiktokAccounts > 1 {
		return h.failCalendar(ctx, tx, id, "Choose one TikTok account per calendar post.")
	}
	for i, provider := range providers {
		accountID := accountIDs[i]
		if err := ValidateMediaReferences(provider, selectedMedia); err != nil {
			return h.failCalendar(ctx, tx, id, err.Error())
		}
		if provider == "tiktok" {
			var field string
			var validationErr error
			if clipID.Valid {
				field, validationErr = h.ValidateTikTokSchedule(ctx, tx, userID, accountID, clipID.String, caption, tiktokOptions)
			} else {
				field, validationErr = h.ValidateTikTokMediaSchedule(ctx, tx, userID, accountID, selectedMedia, caption, tiktokOptions)
			}
			if validationErr != nil {
				message := "The TikTok settings no longer match the creator account. Review the post and schedule it again."
				switch field {
				case "accountIds":
					message = "The TikTok account is disconnected or unavailable. Reconnect it and reschedule the post."
				case "clipId":
					message = "The selected clip is no longer eligible for TikTok. Review it and schedule the post again."
				case "caption":
					message = "The TikTok caption exceeds the limit for this media type."
				case "":
					message = "TikTok creator settings could not be confirmed. Try scheduling the post again."
				}
				var mediaError *TikTokMediaError
				if errors.As(validationErr, &mediaError) {
					message = mediaError.Error()
				}
				return h.failCalendar(ctx, tx, id, message)
			}
		}
	}
	// Validate every destination before inserting any job. A later unsupported
	// account must not leave an earlier destination queued for publication.
	for i, accountID := range accountIDs {
		_, e = tx.ExecContext(ctx, `UPDATE social_posts
			SET idempotency_key='calendar-archive:'||id::text
			WHERE user_id=$1 AND account_id=$2 AND idempotency_key=$3 AND scheduled_post_id IS NULL`, userID, accountID, id)
		if e != nil {
			return e
		}
		postID, uuidErr := data.NewUUID()
		if uuidErr != nil {
			return uuidErr
		}
		options := []byte(`{}`)
		if providers[i] == "tiktok" {
			options = tiktokJSON
		} else if providers[i] == "youtube" {
			options = youtubeJSON
		} else if providers[i] == "instagram" {
			options = igJSON
		}
		publishReference := reference
		if providers[i] == "tiktok" && clipID.Valid {
			publishReference = tiktokReference
			if publishReference == "" {
				return h.failCalendar(ctx, tx, id, "The selected clip has no clean TikTok export. Regenerate it and schedule the post again.")
			}
		}
		_, e = tx.ExecContext(ctx, `INSERT INTO social_posts(id,user_id,account_id,clip_id,provider,caption,options,idempotency_key,request_hash,media_reference,scheduled_post_id)
			VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
			ON CONFLICT (scheduled_post_id,account_id) WHERE scheduled_post_id IS NOT NULL DO NOTHING`, postID, userID, accountID, clipID, providers[i], caption, options, id, requestHash, publishReference, id)
		if e != nil {
			return e
		}
	}
	_, e = tx.ExecContext(ctx, `UPDATE scheduled_posts SET status='publishing',publishing_error='',updated_at=now() WHERE id=$1`, id)
	if e != nil {
		return e
	}
	return tx.Commit()
}

type workItem struct {
	YouTubeOptions                                                        YouTubeOptions
	ID, UserID, AccountID, Provider, Status, RemoteID, Caption, Reference string
	Options                                                               TikTokOptions
	IGOptions                                                             InstagramOptions
	Finalized                                                             bool
	CreatedAt                                                             time.Time
}

func (h *Handler) runOne(ctx context.Context) error {
	// No mutation request is retried after process death or timeout.
	_, e := h.db.ExecContext(ctx, `UPDATE social_posts SET status='unknown',error='Publication outcome is unknown. Check the destination account before posting again.',updated_at=now() WHERE status IN ('submitting','finalizing') AND updated_at<now()-CASE WHEN provider='youtube' THEN interval '35 minutes' ELSE interval '5 minutes' END`)
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
	if job.Provider == "youtube" {
		if json.Unmarshal(raw, &job.YouTubeOptions) != nil {
			return errInvalid
		}
	}
	if job.Provider == "instagram" {
		_ = json.Unmarshal(raw, &job.IGOptions)
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
	return h.process(ctx, job, "")
}
func (h *Handler) process(ctx context.Context, job workItem, action string) error {
	// TikTok can rotate the refresh token. Commit that rotation before opening
	// the transaction held across the remote publishing request so a timeout or
	// rollback cannot restore credentials that TikTok has already invalidated.
	var credentialPreparationErr error
	if job.Provider == "tiktok" {
		credentialPreparationErr = h.prepareTikTokCredentials(ctx, job.UserID, []string{job.AccountID})
	}
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
	if action == "finalize" {
		expected = "finalizing"
	} else if action == "carousel" {
		expected = "submitting"
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
	if credentialPreparationErr != nil {
		return set("failed", "Account authorization expired. Reconnect the account.", job.RemoteID, "")
	}
	creds, e := h.credentials(a)
	if e != nil {
		return set("failed", "Reconnect this account.", job.RemoteID, "")
	}
	if !creds.ExpiresAt.IsZero() && time.Until(creds.ExpiresAt) < 5*time.Minute {
		if a.Provider == "tiktok" {
			return set("failed", "Account authorization expired. Reconnect the account.", job.RemoteID, "")
		}
		creds, e = h.client.Refresh(ctx, a.Provider, creds)
		if e != nil {
			return set("failed", "Account authorization expired. Reconnect the account.", job.RemoteID, "")
		}
		encrypted, err := seal(h.vault, creds, a.UserID+":"+a.Provider+":"+a.RemoteID)
		if err != nil {
			return err
		}
		if _, e = tx.ExecContext(ctx, `UPDATE social_accounts SET credentials=$2,token_expires_at=$3,updated_at=now() WHERE id=$1`, a.ID, encrypted, creds.ExpiresAt); e != nil {
			return e
		}
	}
	if action == "carousel" {
		id, err := h.client.CreateCarousel(ctx, job.RemoteID, creds)
		if err != nil {
			return set("unknown", "Carousel creation could not be confirmed. Check the destination account before posting again.", job.RemoteID, "")
		}
		return set("processing", "", id, "")
	}
	if action == "finalize" {
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
		media := []PublishMedia{}
		var attached []struct{ Type, Reference, Name string }
		if json.Unmarshal([]byte(job.Reference), &attached) == nil && len(attached) > 0 {
			for _, item := range attached {
				reference := item.Reference
				if a.Provider == "instagram" && item.Type == "image" {
					if resolver, ok := h.media.(interface {
						InstagramPublishingKey(context.Context, string) (string, error)
					}); ok {
						var err error
						reference, err = resolver.InstagramPublishingKey(ctx, reference)
						if err != nil {
							return set("failed", err.Error(), "", "")
						}
					}
				}
				if a.Provider == "tiktok" {
					if item.Type == "image" {
						resolver, ok := h.media.(interface {
							TikTokPublishingKey(context.Context, string) (string, error)
						})
						if !ok {
							return set("failed", "TikTok image preparation is unavailable.", "", "")
						}
						var err error
						reference, err = resolver.TikTokPublishingKey(ctx, reference)
						if err != nil {
							return set("failed", err.Error(), "", "")
						}
					}
					if validator, ok := h.media.(interface {
						ValidatePublishingMedia(context.Context, string, string, string) error
					}); ok {
						if err := validator.ValidatePublishingMedia(ctx, "tiktok", reference, item.Type); err != nil {
							return set("failed", err.Error(), "", "")
						}
					}
				}
				source, err := h.media.SignedURL(ctx, reference)
				if err != nil || !publicHTTPS(source) {
					return set("failed", "A public HTTPS media URL is required.", "", "")
				}
				media = append(media, PublishMedia{Type: item.Type, URL: source})
			}
		} else {
			var currentReference string
			err := tx.QueryRowContext(ctx, `SELECT CASE WHEN p.provider='tiktok'
				THEN COALESCE(NULLIF(c.tiktok_file_storage_key,''),NULLIF(c.file_storage_key,''),NULLIF(c.file_path,''),c.file_url,'')
				ELSE COALESCE(NULLIF(c.file_storage_key,''),NULLIF(c.file_path,''),c.file_url,'') END
				FROM social_posts p JOIN clips c ON c.id=p.clip_id AND c.user_id=p.user_id
				WHERE p.id=$1 FOR SHARE OF c`, job.ID).Scan(&currentReference)
			if err != nil || currentReference != job.Reference {
				return set("failed", "The selected clip changed or is no longer available. Review it before publishing again.", "", "")
			}
			source, err := h.media.SignedURL(ctx, job.Reference)
			if err != nil || !publicHTTPS(source) {
				return set("failed", "A public HTTPS video URL is required.", "", "")
			}
			media = append(media, PublishMedia{Type: "video", URL: source})
		}
		if a.Provider == "tiktok" {
			var clip sql.NullString
			if err := tx.QueryRowContext(ctx, "SELECT clip_id FROM social_posts WHERE id=$1", job.ID).Scan(&clip); err != nil {
				return err
			}
			var field string
			var err error
			if clip.Valid {
				field, err = h.ValidateTikTokSchedule(ctx, tx, job.UserID, a.ID, clip.String, job.Caption, job.Options)
			} else {
				originals := make([]PublishMedia, 0, len(attached))
				for _, item := range attached {
					originals = append(originals, PublishMedia{Type: item.Type, URL: item.Reference})
				}
				field, err = h.ValidateTikTokMediaSchedule(ctx, tx, job.UserID, a.ID, originals, job.Caption, job.Options)
			}
			if err != nil {
				message := "TikTok media or creator settings are no longer valid (" + field + "). Review the post before publishing."
				var mediaError *TikTokMediaError
				if errors.As(err, &mediaError) {
					message = mediaError.Error()
				}
				return set("failed", message, "", "")
			}
		}
		var id, status string
		var err error
		if a.Provider == "youtube" {
			if _, err = h.ValidateYouTubeSchedule(ctx, tx, job.UserID, a.ID, job.YouTubeOptions); err != nil {
				return set("failed", "Review the YouTube settings or reconnect the channel.", "", "")
			}
			id, status, err = h.client.PublishYouTube(ctx, creds, media, job.YouTubeOptions)
		} else if a.Provider == "linkedin" {
			if _, err = h.ValidateLinkedInSchedule(ctx, tx, job.UserID, a.ID); err != nil {
				return set("failed", "Reconnect LinkedIn and review the selected destination.", "", "")
			}
			id, status, err = h.client.PublishLinkedIn(ctx, a.RemoteID, creds, media, job.Caption)
		} else {
			id, status, err = h.client.PublishMedia(ctx, a.Provider, a.RemoteID, creds, media, job.Caption, job.Options, job.IGOptions)
		}
		if err != nil {
			if status == "failed" {
				return set("failed", err.Error(), id, "")
			}
			return set("unknown", "Publication outcome is unknown. Check the destination account before posting again.", id, "")
		}
		if status != "processing" && status != "published" {
			status = "unknown"
		}
		return set(status, "", id, "")
	}
	status, link, err := h.client.Poll(ctx, a.Provider, job.RemoteID, creds)
	if status == "failed" {
		return set("failed", "The platform could not process this media.", job.RemoteID, "")
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
	if status == "carousel_ready" {
		if e = set("submitting", "", job.RemoteID, ""); e != nil {
			return e
		}
		return h.process(ctx, job, "carousel")
	}
	if status == "ready" && !job.Finalized {
		if e = set("finalizing", "", job.RemoteID, ""); e != nil {
			return e
		}
		return h.process(ctx, job, "finalize")
	}
	if status == "ready" {
		status = "processing"
	}
	if status != "published" && status != "failed" {
		status = "processing"
	}
	message := ""
	if status == "failed" {
		message = "The platform could not process this media."
	}
	return set(status, message, job.RemoteID, link)
}
