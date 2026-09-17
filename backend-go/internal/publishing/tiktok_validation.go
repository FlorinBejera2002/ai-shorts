package publishing

import (
	"context"
	"database/sql"
	"errors"
	"slices"
	"strings"
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
	if account.Provider != "tiktok" || !h.configured("tiktok") {
		return "accountIds", errInvalid
	}
	now := time.Now()
	if (account.TokenExpiresAt != nil && !account.TokenExpiresAt.After(now)) || (!credentials.ExpiresAt.IsZero() && !credentials.ExpiresAt.After(now)) {
		return "accountIds", errInvalid
	}
	if !badge.Valid || badge.Bool || !publicHTTPS(mediaURL) || !verifiedMediaURL(h.client.config.TikTokVerifiedURLPrefix, mediaURL) {
		return "clipId", errInvalid
	}
	if strings.TrimSpace(caption) == "" || len(utf16.Encode([]rune(caption))) > 2200 {
		return "caption", errInvalid
	}
	if !options.MusicUsageConfirmed || options.PrivacyLevel == "" {
		return "tiktok", errInvalid
	}
	creator, err := h.client.Options(ctx, credentials)
	if err != nil {
		return "", err
	}
	if creator.MaxDuration <= 0 || duration > float64(creator.MaxDuration) {
		return "clipId", errInvalid
	}
	if !slices.Contains(creator.PrivacyLevels, options.PrivacyLevel) ||
		(creator.CommentDisabled && !options.DisableComment) ||
		(creator.DuetDisabled && !options.DisableDuet) ||
		(creator.StitchDisabled && !options.DisableStitch) ||
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
	var badge sql.NullBool
	err = tx.QueryRowContext(ctx, `SELECT duration,COALESCE(NULLIF(file_storage_key,''),NULLIF(file_path,''),file_url,''),contains_platform_badge
		FROM clips WHERE id=$1 AND user_id=$2 FOR KEY SHARE`, clipID, userID).Scan(&duration, &reference, &badge)
	if errors.Is(err, sql.ErrNoRows) || reference == "" {
		return "clipId", errInvalid
	}
	if err != nil {
		return "", err
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
	return h.validateTikTokSelectionWithCredentials(ctx, account, credentials, duration, badge, mediaURL, caption, options)
}
