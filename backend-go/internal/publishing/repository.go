package publishing

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"slices"
	"sort"
	"strings"
	"time"

	"github.com/lib/pq"
	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/identity"
)

type Account struct {
	ID             string         `json:"id"`
	Provider       string         `json:"provider"`
	Name           string         `json:"name"`
	Username       string         `json:"username"`
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
	ClipID         string        `json:"clipId"`
	AccountIDs     []string      `json:"accountIds"`
	Caption        string        `json:"caption"`
	IdempotencyKey string        `json:"idempotencyKey"`
	Confirmed      bool          `json:"confirmed"`
	TikTok         TikTokOptions `json:"tiktok"`
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
	e = tx.QueryRowContext(ctx, `SELECT credentials FROM social_accounts WHERE id=$1 AND user_id=$2 AND status='connected' FOR UPDATE`, a.ID, a.UserID).Scan(&a.Encrypted)
	if e != nil {
		return Credentials{}, e
	}
	c, e := h.credentials(a)
	if e != nil {
		return c, e
	}
	if !c.ExpiresAt.IsZero() && time.Until(c.ExpiresAt) < 5*time.Minute {
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
	return c, tx.Commit()
}
func (h *Handler) list(ctx context.Context, user string) ([]Account, []Clip, []Post, error) {
	accounts, clips, posts := []Account{}, []Clip{}, []Post{}
	rows, e := h.db.QueryContext(ctx, `SELECT id,provider,name,username,status,scopes,token_expires_at,COALESCE(token_expires_at<=now(),false) FROM social_accounts WHERE user_id=$1 AND status='connected' ORDER BY provider,name`, user)
	if e != nil {
		return accounts, clips, posts, e
	}
	for rows.Next() {
		var a Account
		if e = rows.Scan(&a.ID, &a.Provider, &a.Name, &a.Username, &a.Status, &a.Scopes, &a.TokenExpiresAt, &a.TokenExpired); e != nil {
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
	rows, e = h.db.QueryContext(ctx, `SELECT id,title,duration,COALESCE(NULLIF(thumbnail_storage_key,''),NULLIF(thumbnail_path,''),thumbnail_url,''),COALESCE(NULLIF(file_storage_key,''),NULLIF(file_path,''),file_url,''),contains_platform_badge IS FALSE FROM clips WHERE user_id=$1 AND COALESCE(NULLIF(file_storage_key,''),NULLIF(file_path,''),file_url,'')<>'' ORDER BY created_at DESC LIMIT 100`, user)
	if e != nil {
		return accounts, clips, posts, e
	}
	for rows.Next() {
		var c Clip
		var thumb, file string
		if e = rows.Scan(&c.ID, &c.Title, &c.Duration, &thumb, &file, &c.TikTokEligible); e != nil {
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
	if !in.Confirmed || !data.ValidUUID(in.ClipID) || !data.ValidUUID(in.IdempotencyKey) || len(in.AccountIDs) == 0 || len(in.AccountIDs) > 10 || len([]rune(in.Caption)) > 2200 {
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
	options, _ := json.Marshal(in.TikTok)
	var duration float64
	var ref string
	var badge sql.NullBool
	e = tx.QueryRowContext(ctx, `SELECT duration,COALESCE(NULLIF(file_storage_key,''),NULLIF(file_path,''),file_url,''),contains_platform_badge FROM clips WHERE user_id=$1 AND id=$2 FOR SHARE`, user, in.ClipID).Scan(&duration, &ref, &badge)
	if e != nil || ref == "" {
		return nil, errInvalid
	}
	mediaURL, e := h.media.SignedURL(ctx, ref)
	if e != nil || !publicHTTPS(mediaURL) {
		return nil, errInvalid
	}
	posts := []Post{}
	for _, id := range in.AccountIDs {
		var a Account
		e = tx.QueryRowContext(ctx, `SELECT id,user_id,provider,remote_id,name,username,status,credentials FROM social_accounts WHERE id=$1 AND user_id=$2 AND status='connected' FOR UPDATE`, id, user).Scan(&a.ID, &a.UserID, &a.Provider, &a.RemoteID, &a.Name, &a.Username, &a.Status, &a.Encrypted)
		if e != nil || !h.configured(a.Provider) || a.Provider == "youtube" {
			return nil, errInvalid
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
			if !badge.Valid || badge.Bool || !in.TikTok.MusicUsageConfirmed {
				return nil, errInvalid
			}
			creds, err := h.credentials(a)
			if err != nil {
				return nil, errInvalid
			}
			o, err := h.client.Options(ctx, creds)
			if err != nil || !slices.Contains(o.PrivacyLevels, in.TikTok.PrivacyLevel) || duration > float64(o.MaxDuration) || (o.CommentDisabled && !in.TikTok.DisableComment) || (o.DuetDisabled && !in.TikTok.DisableDuet) || (o.StitchDisabled && !in.TikTok.DisableStitch) || (in.TikTok.BrandContentToggle && in.TikTok.PrivacyLevel == "SELF_ONLY") {
				return nil, errInvalid
			}
		}
		if strings.TrimSpace(in.Caption) == "" && a.Provider == "tiktok" {
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
		e = tx.QueryRowContext(ctx, `INSERT INTO social_posts(id,user_id,account_id,clip_id,provider,caption,options,idempotency_key,request_hash,media_reference) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING created_at`, p.ID, user, id, in.ClipID, a.Provider, in.Caption, options, in.IdempotencyKey, hash, ref).Scan(&p.CreatedAt)
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
