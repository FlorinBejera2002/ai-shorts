package publishing

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"sort"
	"time"
	"unicode/utf16"

	"github.com/lib/pq"
	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/identity"
)

type Account struct {
	ID             string         `json:"id"`
	Provider       string         `json:"provider"`
	Name           string         `json:"name"`
	Username       string         `json:"username"`
	AvatarURL      string         `json:"avatarUrl,omitempty"`
	Status         string         `json:"status"`
	Scopes         pq.StringArray `json:"scopes"`
	TokenExpiresAt *time.Time     `json:"tokenExpiresAt,omitempty"`
	TokenExpired   bool           `json:"tokenExpired"`
	UserID         string         `json:"-"`
	RemoteID       string         `json:"-"`
	Encrypted      string         `json:"-"`
}
type Clip struct {
	ID             string  `json:"id"`
	Title          string  `json:"title"`
	Duration       float64 `json:"duration"`
	ThumbnailURL   string  `json:"thumbnailUrl,omitempty"`
	FileURL        string  `json:"fileUrl,omitempty"`
	CaptionTikTok  string  `json:"captionTiktok,omitempty"`
	TikTokEligible bool    `json:"tiktokEligible"`
}
type Post struct {
	ID        string    `json:"id"`
	ClipID    *string   `json:"clipId"`
	AccountID string    `json:"accountId"`
	Provider  string    `json:"provider"`
	Status    string    `json:"status"`
	Error     string    `json:"error,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
	URL       string    `json:"url,omitempty"`
}
type postInput struct {
	ClipID         string         `json:"clipId"`
	AccountIDs     []string       `json:"accountIds"`
	Caption        string         `json:"caption"`
	IdempotencyKey string         `json:"idempotencyKey"`
	Confirmed      bool           `json:"confirmed"`
	TikTok         TikTokOptions  `json:"tiktok"`
	YouTube        YouTubeOptions `json:"youtube"`
}

func (h *Handler) account(ctx context.Context, user, id string) (Account, error) {
	var a Account
	if !data.ValidUUID(id) {
		return a, sql.ErrNoRows
	}
	e := h.db.QueryRowContext(ctx, `SELECT id,user_id,provider,remote_id,name,username,status,credentials FROM social_accounts WHERE user_id=$1 AND id=$2 AND status='connected'`, user, id).Scan(&a.ID, &a.UserID, &a.Provider, &a.RemoteID, &a.Name, &a.Username, &a.Status, &a.Encrypted)
	return a, e
}
func (h *Handler) credentials(a Account) (Credentials, error) {
	var c Credentials
	if h.vault == nil {
		return c, errInvalid
	}
	e := unseal(h.vault, a.Encrypted, a.UserID+":"+a.Provider+":"+a.RemoteID, &c)
	return c, e
}

// Persist rotated refresh tokens before the following read-only API request.
func (h *Handler) liveCredentials(ctx context.Context, a Account) (Credentials, error) {
	tx, e := h.db.BeginTx(ctx, nil)
	if e != nil {
		return Credentials{}, e
	}
	defer tx.Rollback()
	e = tx.QueryRowContext(ctx, `SELECT credentials,token_expires_at FROM social_accounts WHERE id=$1 AND user_id=$2 AND status='connected' FOR UPDATE`, a.ID, a.UserID).Scan(&a.Encrypted, &a.TokenExpiresAt)
	if e != nil {
		return Credentials{}, e
	}
	c, e := h.liveCredentialsLocked(ctx, tx, a)
	if e != nil {
		return c, e
	}
	return c, tx.Commit()
}

// liveCredentialsLocked refreshes credentials while the caller holds the
// social account row lock. Token rotation and its expiry are persisted in the
// same transaction before any creator or publishing request uses the token.
func (h *Handler) liveCredentialsLocked(ctx context.Context, tx *sql.Tx, a Account) (Credentials, error) {
	c, e := h.credentials(a)
	if e != nil {
		return c, e
	}
	refreshAt := c.ExpiresAt
	if a.TokenExpiresAt != nil && (refreshAt.IsZero() || a.TokenExpiresAt.Before(refreshAt)) {
		refreshAt = *a.TokenExpiresAt
	}
	if !refreshAt.IsZero() && time.Until(refreshAt) < 5*time.Minute {
		c, e = h.client.Refresh(ctx, a.Provider, c)
		if e != nil {
			return c, e
		}
		sealed, err := seal(h.vault, c, a.UserID+":"+a.Provider+":"+a.RemoteID)
		if err != nil {
			return c, err
		}
		_, e = tx.ExecContext(ctx, `UPDATE social_accounts SET credentials=$2,token_expires_at=$3,updated_at=now() WHERE id=$1`, a.ID, sealed, c.ExpiresAt)
		if e != nil {
			return c, e
		}
	}
	return c, nil
}

// prepareTikTokCredentials commits any required token rotation before callers
// open the mutation transaction that fences disconnects and validates content.
func (h *Handler) prepareTikTokCredentials(ctx context.Context, userID string, accountIDs []string) error {
	if len(accountIDs) == 0 {
		return nil
	}
	rows, err := h.db.QueryContext(ctx, `SELECT id,user_id,provider,remote_id FROM social_accounts WHERE user_id=$1 AND provider='tiktok' AND status='connected' AND id=ANY($2::uuid[])`, userID, pq.Array(accountIDs))
	if err != nil {
		return err
	}
	accounts := []Account{}
	for rows.Next() {
		var account Account
		if err = rows.Scan(&account.ID, &account.UserID, &account.Provider, &account.RemoteID); err != nil {
			rows.Close()
			return err
		}
		accounts = append(accounts, account)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, account := range accounts {
		if _, err = h.liveCredentials(ctx, account); err != nil {
			return err
		}
	}
	return nil
}

// PrepareTikTokSchedule is the pre-transaction phase of calendar validation.
// The caller must re-read and lock the selected account before creator checks.
func (h *Handler) PrepareTikTokSchedule(ctx context.Context, userID string, accountIDs []string) (string, error) {
	if err := h.prepareTikTokCredentials(ctx, userID, accountIDs); err != nil {
		return "accountIds", errInvalid
	}
	return "", nil
}

// DeletePublishedPosts removes supported remote destinations linked to a
// calendar entry. The calendar row is deleted only after every requested
// remote deletion has been confirmed.
func (h *Handler) DeletePublishedPosts(ctx context.Context, user, scheduledPostID string, providers []string) error {
	if !data.ValidUUID(scheduledPostID) || len(providers) != 1 || providers[0] != "facebook" {
		return errInvalid
	}
	rows, e := h.db.QueryContext(ctx, `SELECT sp.id,sp.remote_id,a.id,a.user_id,a.provider,a.remote_id,a.name,a.username,a.status,a.credentials
		FROM social_posts sp
		JOIN social_accounts a ON a.id=sp.account_id AND a.user_id=sp.user_id
		JOIN scheduled_posts s ON s.id=sp.scheduled_post_id AND s.user_id=sp.user_id
		WHERE sp.scheduled_post_id=$1 AND sp.user_id=$2 AND sp.provider='facebook' AND sp.status='published' AND s.status<>'publishing'`, scheduledPostID, user)
	if e != nil {
		return e
	}
	type deletion struct {
		id       string
		remoteID string
		account  Account
	}
	deletions := []deletion{}
	for rows.Next() {
		var item deletion
		if e = rows.Scan(&item.id, &item.remoteID, &item.account.ID, &item.account.UserID, &item.account.Provider, &item.account.RemoteID, &item.account.Name, &item.account.Username, &item.account.Status, &item.account.Encrypted); e != nil {
			rows.Close()
			return e
		}
		deletions = append(deletions, item)
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return e
	}
	if len(deletions) == 0 {
		return sql.ErrNoRows
	}
	for _, item := range deletions {
		credentials, credentialErr := h.liveCredentials(ctx, item.account)
		if credentialErr != nil {
			return credentialErr
		}
		deleteCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
		deleteErr := h.client.DeletePost(deleteCtx, item.account.Provider, item.remoteID, credentials)
		cancel()
		if deleteErr != nil {
			return deleteErr
		}
		if _, e = h.db.ExecContext(ctx, `UPDATE social_posts SET status='cancelled',error='Deleted from platform by user.',url='',updated_at=now() WHERE id=$1 AND user_id=$2 AND status='published'`, item.id, user); e != nil {
			return e
		}
	}
	return nil
}

func (h *Handler) list(ctx context.Context, user string) ([]Account, []Clip, []Post, error) {
	accounts, clips, posts := []Account{}, []Clip{}, []Post{}
	rows, e := h.db.QueryContext(ctx, `SELECT id,provider,name,username,avatar_url,status,scopes,token_expires_at,(CASE WHEN provider='youtube' THEN NOT ('video_publish'=ANY(scopes)) ELSE COALESCE(token_expires_at<=now(),false) END) FROM social_accounts WHERE user_id=$1 AND status='connected' AND (provider<>'youtube' OR youtube_verified_at>now()-interval '6 days') ORDER BY provider,name`, user)
	if e != nil {
		return accounts, clips, posts, e
	}
	for rows.Next() {
		var a Account
		if e = rows.Scan(&a.ID, &a.Provider, &a.Name, &a.Username, &a.AvatarURL, &a.Status, &a.Scopes, &a.TokenExpiresAt, &a.TokenExpired); e != nil {
			break
		}
		accounts = append(accounts, a)
	}
	if e == nil {
		e = rows.Err()
	}
	rows.Close()
	if e != nil {
		return accounts, clips, posts, e
	}
	rows, e = h.db.QueryContext(ctx, `SELECT id,title,duration,COALESCE(NULLIF(thumbnail_storage_key,''),NULLIF(thumbnail_path,''),thumbnail_url,''),COALESCE(NULLIF(file_storage_key,''),NULLIF(file_path,''),file_url,''),COALESCE(caption_tiktok,''),COALESCE(NULLIF(tiktok_file_storage_key,''),NULLIF(file_storage_key,''),NULLIF(file_path,''),file_url,'')<>'' FROM clips WHERE user_id=$1 AND COALESCE(NULLIF(file_storage_key,''),NULLIF(file_path,''),file_url,'')<>'' ORDER BY created_at DESC LIMIT 100`, user)
	if e != nil {
		return accounts, clips, posts, e
	}
	for rows.Next() {
		var c Clip
		var thumb, file string
		if e = rows.Scan(&c.ID, &c.Title, &c.Duration, &thumb, &file, &c.CaptionTikTok, &c.TikTokEligible); e != nil {
			break
		}
		if thumb != "" {
			c.ThumbnailURL, _ = h.media.SignedURL(ctx, thumb)
		}
		c.FileURL, _ = h.media.SignedURL(ctx, file)
		clips = append(clips, c)
	}
	if e == nil {
		e = rows.Err()
	}
	rows.Close()
	if e != nil {
		return accounts, clips, posts, e
	}
	rows, e = h.db.QueryContext(ctx, `SELECT id,clip_id,account_id,provider,status,error,created_at,url FROM social_posts WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`, user)
	if e != nil {
		return accounts, clips, posts, e
	}
	defer rows.Close()
	for rows.Next() {
		var p Post
		if e = rows.Scan(&p.ID, &p.ClipID, &p.AccountID, &p.Provider, &p.Status, &p.Error, &p.CreatedAt, &p.URL); e != nil {
			return accounts, clips, posts, e
		}
		posts = append(posts, p)
	}
	return accounts, clips, posts, rows.Err()
}
func validateInput(in *postInput) bool {
	if !in.Confirmed || !data.ValidUUID(in.ClipID) || !data.ValidUUID(in.IdempotencyKey) || len(in.AccountIDs) == 0 || len(in.AccountIDs) > 10 || len(utf16.Encode([]rune(in.Caption))) > 2200 {
		return false
	}
	sort.Strings(in.AccountIDs)
	for i, id := range in.AccountIDs {
		if !data.ValidUUID(id) || (i > 0 && id == in.AccountIDs[i-1]) {
			return false
		}
	}
	return true
}
func (h *Handler) createPosts(w http.ResponseWriter, r *http.Request) {
	var in postInput
	if !decode(w, r, &in) {
		return
	}
	if !validateInput(&in) {
		fail(w, 400, "Choose a clip and accounts, limit the caption to 2200 characters, and confirm publication.")
		return
	}
	posts, e := h.enqueue(r.Context(), identity.Current(r).User.ID, in)
	if e == errInvalid {
		fail(w, 400, "Selected clip, connected accounts or TikTok options are invalid. Refresh the page and check the selection.")
		return
	}
	if e != nil {
		fail(w, 503, "Could not queue publication.")
		return
	}
	respond(w, 202, map[string]any{"posts": posts})
}
func (h *Handler) enqueue(ctx context.Context, user string, in postInput) ([]Post, error) {
	if e := h.prepareTikTokCredentials(ctx, user, in.AccountIDs); e != nil {
		return nil, errInvalid
	}
	tx, e := h.db.BeginTx(ctx, nil)
	if e != nil {
		return nil, e
	}
	defer tx.Rollback()
	var active bool
	e = tx.QueryRowContext(ctx, `SELECT NOT EXISTS(SELECT 1 FROM account_deletion_requests d WHERE d.user_id=u.id) FROM users u WHERE id=$1 FOR UPDATE`, user).Scan(&active)
	if e != nil || !active {
		return nil, errInvalid
	}
	// A request key is bound to the full payload, not just a single destination.
	encoded, _ := json.Marshal(in)
	hash := digest(string(encoded))
	tiktokOptions, _ := json.Marshal(in.TikTok)
	var duration float64
	var ref, tiktokRef string
	e = tx.QueryRowContext(ctx, `SELECT duration,
		COALESCE(NULLIF(file_storage_key,''),NULLIF(file_path,''),file_url,''),
		COALESCE(NULLIF(tiktok_file_storage_key,''),NULLIF(file_storage_key,''),NULLIF(file_path,''),file_url,'')
		FROM clips WHERE user_id=$1 AND id=$2 FOR SHARE`, user, in.ClipID).Scan(&duration, &ref, &tiktokRef)
	if e != nil || ref == "" {
		return nil, errInvalid
	}
	posts := []Post{}
	for _, id := range in.AccountIDs {
		var a Account
		e = tx.QueryRowContext(ctx, `SELECT id,user_id,provider,remote_id,name,username,status,credentials,token_expires_at FROM social_accounts WHERE id=$1 AND user_id=$2 AND status='connected' FOR UPDATE`, id, user).Scan(&a.ID, &a.UserID, &a.Provider, &a.RemoteID, &a.Name, &a.Username, &a.Status, &a.Encrypted, &a.TokenExpiresAt)
		if e != nil || !h.configured(a.Provider) {
			return nil, errInvalid
		}
		options := tiktokOptions
		if a.Provider == "youtube" {
			if _, err := h.ValidateYouTubeSchedule(ctx, tx, user, a.ID, in.YouTube); err != nil {
				return nil, errInvalid
			}
			options, _ = json.Marshal(in.YouTube)
		}
		var existingHash string
		var p Post
		e = tx.QueryRowContext(ctx, `SELECT id,clip_id,account_id,provider,status,error,created_at,url,request_hash FROM social_posts WHERE user_id=$1 AND account_id=$2 AND idempotency_key=$3`, user, id, in.IdempotencyKey).Scan(&p.ID, &p.ClipID, &p.AccountID, &p.Provider, &p.Status, &p.Error, &p.CreatedAt, &p.URL, &existingHash)
		if e == nil {
			if existingHash != hash {
				return nil, errInvalid
			}
			posts = append(posts, p)
			continue
		}
		if e != sql.ErrNoRows {
			return nil, e
		}
		if a.Provider == "tiktok" {
			if tiktokRef == "" {
				return nil, errInvalid
			}
			credentials, credentialErr := h.credentials(a)
			if credentialErr != nil {
				return nil, errInvalid
			}
			if resolver, ok := h.media.(interface {
				PublishingVideoDuration(context.Context, string) (float64, error)
			}); ok {
				duration, e = resolver.PublishingVideoDuration(ctx, tiktokRef)
				if e != nil {
					return nil, errInvalid
				}
			}
			mediaURL, mediaErr := h.media.SignedURL(ctx, tiktokRef)
			if mediaErr != nil || !publicHTTPS(mediaURL) {
				return nil, errInvalid
			}
			field, validationErr := h.validateTikTokSelectionWithCredentials(ctx, a, credentials, duration, sql.NullBool{Valid: true, Bool: false}, mediaURL, in.Caption, in.TikTok)
			if field != "" || validationErr != nil {
				return nil, errInvalid
			}
		}
		publishRef := ref
		if a.Provider == "tiktok" {
			publishRef = tiktokRef
		}
		mediaURL, mediaErr := h.media.SignedURL(ctx, publishRef)
		if mediaErr != nil || !publicHTTPS(mediaURL) {
			return nil, errInvalid
		}
		p.ID, e = data.NewUUID()
		if e != nil {
			return nil, e
		}
		p.ClipID = &in.ClipID
		p.AccountID = id
		p.Provider = a.Provider
		p.Status = "queued"
		e = tx.QueryRowContext(ctx, `INSERT INTO social_posts(id,user_id,account_id,clip_id,provider,caption,options,idempotency_key,request_hash,media_reference) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING created_at`, p.ID, user, id, in.ClipID, a.Provider, in.Caption, options, in.IdempotencyKey, hash, publishRef).Scan(&p.CreatedAt)
		if e != nil {
			return nil, e
		}
		posts = append(posts, p)
	}
	if e = tx.Commit(); e != nil {
		return nil, e
	}
	return posts, nil
}
