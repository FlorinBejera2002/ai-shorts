package publishing

import (
	"context"
	"database/sql"
	"errors"
	"slices"
	"time"
	"unicode/utf16"
)

func (h *Handler) validateTikTokSelection(ctx context.Context, account Account, duration float64, badge sql.NullBool, mediaURL, caption string, options TikTokOptions) (string, error) {
	credentials, err := h.credentials(account)
	if err != nil {
		return "accountIds", errInvalid
	}
	return h.validateTikTokSelectionWithCredentials(ctx, account, credentials, duration, badge, mediaURL, caption, options)
}

func (h *Handler) validateTikTokSelectionWithCredentials(ctx context.Context, account Account, credentials Credentials, duration float64, badge sql.NullBool, mediaURL, caption string, options TikTokOptions) (string, error) {
	return h.validateTikTokMediaSelection(ctx, account, credentials, duration, badge, []PublishMedia{{Type: "video", URL: mediaURL}}, caption, options)
}

func (h *Handler) validateTikTokMediaSelection(ctx context.Context, account Account, credentials Credentials, duration float64, badge sql.NullBool, media []PublishMedia, caption string, options TikTokOptions) (string, error) {
	photo := len(media) > 0 && media[0].Type == "image"
	if account.Provider != "tiktok" || !h.configured("tiktok") {
		return "accountIds", errInvalid
	}
	now := time.Now()
	if (account.TokenExpiresAt != nil && !account.TokenExpiresAt.After(now)) || (!credentials.ExpiresAt.IsZero() && !credentials.ExpiresAt.After(now)) {
		return "accountIds", errInvalid
	}
	if badge.Valid && badge.Bool {
		return "clipId", errInvalid
	}
	for _, item := range media {
		if !publicHTTPS(item.URL) || !verifiedMediaURL(h.client.config.TikTokVerifiedURLPrefix, item.URL) {
			return "media", errInvalid
		}
	}
	if photo && len(utf16.Encode([]rune(options.PhotoTitle))) > 90 {
		return "tiktok", errInvalid
	}
	if validateTikTokText(photo, caption, options) != nil {
		return "caption", errInvalid
	}
	if !options.MusicUsageConfirmed || options.PrivacyLevel == "" {
		return "tiktok", errInvalid
	}
	creator, err := h.client.Options(ctx, credentials)
	if err != nil {
		return "", err
	}
	if !photo && (creator.MaxDuration <= 0 || duration > float64(creator.MaxDuration)) {
		return "clipId", errInvalid
	}
	if !slices.Contains(creator.PrivacyLevels, options.PrivacyLevel) ||
		(creator.CommentDisabled && !options.DisableComment) ||
		(!photo && creator.DuetDisabled && !options.DisableDuet) ||
		(!photo && creator.StitchDisabled && !options.DisableStitch) ||
		(options.BrandContentToggle && options.PrivacyLevel == "SELF_ONLY") {
		return "tiktok", errInvalid
	}
	return "", nil
}

// ValidateTikTokSchedule validates the same creator and clip constraints used
// by immediate Direct Post while the calendar mutation or dispatch transaction
// is still open. The returned field is safe to expose as a form issue.
func (h *Handler) ValidateTikTokSchedule(ctx context.Context, tx *sql.Tx, userID, accountID, clipID, caption string, options TikTokOptions) (string, error) {
	if tx == nil {
		return "", errors.New("TikTok validation transaction is required")
	}
	var account Account
	err := tx.QueryRowContext(ctx, `SELECT id,user_id,provider,remote_id,name,username,status,credentials,token_expires_at
		FROM social_accounts
		WHERE id=$1 AND user_id=$2 AND provider='tiktok' AND status='connected'
		FOR UPDATE`, accountID, userID).Scan(&account.ID, &account.UserID, &account.Provider, &account.RemoteID, &account.Name, &account.Username, &account.Status, &account.Encrypted, &account.TokenExpiresAt)
	if errors.Is(err, sql.ErrNoRows) {
		return "accountIds", errInvalid
	}
	if err != nil {
		return "", err
	}
	var duration float64
	var reference string
	err = tx.QueryRowContext(ctx, `SELECT duration,
		COALESCE(NULLIF(tiktok_file_storage_key,''),NULLIF(file_storage_key,''),NULLIF(file_path,''),file_url,'')
		FROM clips WHERE id=$1 AND user_id=$2 FOR KEY SHARE`, clipID, userID).Scan(&duration, &reference)
	if errors.Is(err, sql.ErrNoRows) || reference == "" {
		return "clipId", errInvalid
	}
	if err != nil {
		return "", err
	}
	if validator, ok := h.media.(interface {
		ValidatePublishingMedia(context.Context, string, string, string) error
	}); ok {
		if err := validator.ValidatePublishingMedia(ctx, "tiktok", reference, "video"); err != nil {
			return "clipId", &TikTokMediaError{Message: err.Error()}
		}
	}
	if resolver, ok := h.media.(interface {
		PublishingVideoDuration(context.Context, string) (float64, error)
	}); ok {
		duration, err = resolver.PublishingVideoDuration(ctx, reference)
		if err != nil {
			return "clipId", errInvalid
		}
	}
	mediaURL, err := h.media.SignedURL(ctx, reference)
	if err != nil {
		return "", err
	}
	if mediaErr := ValidateMediaReferences("tiktok", []PublishMedia{{Type: "video", URL: mediaURL}}); mediaErr != nil {
		return "clipId", errInvalid
	}
	credentials, err := h.credentials(account)
	if err != nil {
		return "accountIds", errInvalid
	}
	return h.validateTikTokSelectionWithCredentials(ctx, account, credentials, duration, sql.NullBool{Valid: true, Bool: false}, mediaURL, caption, options)
}

func validateTikTokText(photo bool, caption string, options TikTokOptions) error {
	limit := 2200
	if photo {
		limit = 4000
		if len(utf16.Encode([]rune(options.PhotoTitle))) > 90 {
			return errors.New("TikTok photo titles must not exceed 90 characters")
		}
	}
	if len(utf16.Encode([]rune(caption))) > limit {
		return errors.New("The caption exceeds TikTok's limit for this media type")
	}
	return nil
}

// ValidateTikTokMediaSchedule applies creator restrictions to uploaded media.
func (h *Handler) ValidateTikTokMediaSchedule(ctx context.Context, tx *sql.Tx, userID, accountID string, media []PublishMedia, caption string, options TikTokOptions) (string, error) {
	if tx == nil {
		return "", errors.New("TikTok validation transaction is required")
	}
	if err := ValidateMediaReferences("tiktok", media); err != nil {
		return "media", errInvalid
	}
	var account Account
	err := tx.QueryRowContext(ctx, `SELECT id,user_id,provider,remote_id,name,username,status,credentials,token_expires_at FROM social_accounts WHERE id=$1 AND user_id=$2 AND provider='tiktok' AND status='connected' FOR UPDATE`, accountID, userID).Scan(&account.ID, &account.UserID, &account.Provider, &account.RemoteID, &account.Name, &account.Username, &account.Status, &account.Encrypted, &account.TokenExpiresAt)
	if errors.Is(err, sql.ErrNoRows) {
		return "accountIds", errInvalid
	}
	if err != nil {
		return "", err
	}
	credentials, err := h.credentials(account)
	if err != nil {
		return "accountIds", errInvalid
	}
	prepared := make([]PublishMedia, 0, len(media))
	duration := float64(0)
	for _, item := range media {
		reference := item.URL
		if item.Type == "image" {
			resolver, ok := h.media.(interface {
				TikTokPublishingKey(context.Context, string) (string, error)
			})
			if !ok {
				return "media", errInvalid
			}
			reference, err = resolver.TikTokPublishingKey(ctx, reference)
			if err != nil {
				return "media", &TikTokMediaError{Message: err.Error()}
			}
		} else {
			resolver, ok := h.media.(interface {
				PublishingVideoDuration(context.Context, string) (float64, error)
			})
			if !ok {
				return "media", errInvalid
			}
			duration, err = resolver.PublishingVideoDuration(ctx, reference)
			if err != nil {
				return "media", &TikTokMediaError{Message: err.Error()}
			}
		}
		if validator, ok := h.media.(interface {
			ValidatePublishingMedia(context.Context, string, string, string) error
		}); ok {
			if err = validator.ValidatePublishingMedia(ctx, "tiktok", reference, item.Type); err != nil {
				return "media", &TikTokMediaError{Message: err.Error()}
			}
		}
		source, err := h.media.SignedURL(ctx, reference)
		if err != nil {
			return "", err
		}
		prepared = append(prepared, PublishMedia{Type: item.Type, URL: source})
	}
	field, err := h.validateTikTokMediaSelection(ctx, account, credentials, duration, sql.NullBool{Valid: true}, prepared, caption, options)
	if field == "clipId" {
		return "media", &TikTokMediaError{Message: "This video exceeds the maximum duration allowed by your TikTok account"}
	}
	return field, err
}

// TikTokMediaError contains an actionable, safe media validation message.
type TikTokMediaError struct{ Message string }

func (e *TikTokMediaError) Error() string { return e.Message }
