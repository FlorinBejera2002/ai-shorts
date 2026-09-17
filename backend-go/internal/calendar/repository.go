package calendar

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"path"
	"slices"
	"sort"
	"strings"
	"time"

	"github.com/lib/pq"
	"sneepcut/backend-go/internal/publishing"
)

var ErrClip = errors.New("Choose a clip from your library or remove the selected clip")
var ErrInactive = errors.New("Account is unavailable")
var ErrLocked = errors.New("A post that is publishing or published can no longer be changed")

type Media interface {
	KeyFromReference(string) (string, error)
	SignedURL(context.Context, string) (string, error)
}
type TikTokScheduleValidator interface {
	PrepareTikTokSchedule(context.Context, string, []string) (string, error)
	ValidateTikTokSchedule(context.Context, *sql.Tx, string, string, string, string, publishing.TikTokOptions) (string, error)
}
type PostClip struct {
	ID             string  `json:"id"`
	Title          string  `json:"title"`
	ViralScore     float64 `json:"viralScore"`
	Duration       float64 `json:"duration"`
	TikTokEligible bool    `json:"tiktokEligible"`
	ThumbnailURL   *string `json:"thumbnailUrl"`
}
type ClipOption struct {
	PostClip
	CaptionTiktok    *string `json:"captionTiktok"`
	CaptionInstagram *string `json:"captionInstagram"`
	CaptionYoutube   *string `json:"captionYoutube"`
}
type Post struct {
	ID                     string                    `json:"id"`
	Title                  string                    `json:"title"`
	Caption                *string                   `json:"caption"`
	Notes                  *string                   `json:"notes"`
	Platforms              []string                  `json:"platforms"`
	AccountIDs             []string                  `json:"accountIds"`
	Status                 string                    `json:"status"`
	PublishingError        string                    `json:"publishingError,omitempty"`
	PublishingDestinations []PublishingDestination   `json:"publishingDestinations"`
	ScheduledAt            string                    `json:"scheduledAt"`
	CreatedAt              string                    `json:"createdAt"`
	UpdatedAt              string                    `json:"updatedAt"`
	Clip                   *PostClip                 `json:"clip"`
	Media                  []map[string]string       `json:"media"`
	TikTok                 *publishing.TikTokOptions `json:"tiktok,omitempty"`
}
type PublishingDestination struct {
	Provider    string `json:"provider"`
	AccountName string `json:"accountName"`
	Status      string `json:"status"`
	Error       string `json:"error,omitempty"`
	URL         string `json:"url,omitempty"`
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
}
type Repository struct {
	db              *sql.DB
	media           Media
	tiktokValidator TikTokScheduleValidator
}

func NewRepository(db *sql.DB, media Media, validators ...TikTokScheduleValidator) *Repository {
	repository := &Repository{db: db, media: media}
	if len(validators) > 0 {
		repository.tiktokValidator = validators[0]
	}
	return repository
}
func isoDate(t time.Time) string { return t.UTC().Format("2006-01-02T15:04:05.000Z") }
func (s *Repository) thumbnail(ctx context.Context, references ...sql.NullString) *string {
	if s.media == nil {
		return nil
	}
	for _, reference := range references {
		if !reference.Valid || reference.String == "" {
			continue
		}
		key, e := s.media.KeyFromReference(reference.String)
		if e != nil {
			continue
		}
		signed, e := s.media.SignedURL(ctx, key)
		if e == nil && signed != "" {
			return &signed
		}
	}
	return nil
}

const postSelect = `SELECT p.id,p.title,p.caption,p.notes,p.platforms,p.account_ids,p.status,p.publishing_error,p.scheduled_at,p.created_at,p.updated_at,p.media,p.tiktok_options,
	c.id,c.title,c.viral_score,c.duration,COALESCE(NULLIF(c.tiktok_file_storage_key,''),CASE WHEN c.contains_platform_badge IS FALSE THEN COALESCE(NULLIF(c.file_storage_key,''),NULLIF(c.file_path,''),c.file_url,'') END,'')<>'',c.thumbnail_storage_key,c.thumbnail_path,c.thumbnail_url,
	COALESCE((SELECT jsonb_agg(jsonb_build_object(
		'provider',sp.provider,'accountName',COALESCE(NULLIF(a.username,''),NULLIF(a.name,''),sp.provider),
		'status',sp.status,'error',sp.error,'url',sp.url,'createdAt',sp.created_at,'updatedAt',sp.updated_at
	) ORDER BY sp.created_at) FROM social_posts sp LEFT JOIN social_accounts a ON a.id=sp.account_id
	WHERE sp.scheduled_post_id=p.id),'[]'::jsonb)
	FROM scheduled_posts p LEFT JOIN clips c ON c.id=p.clip_id AND c.user_id=p.user_id`

type rowScanner interface{ Scan(...any) error }

func (s *Repository) readPost(ctx context.Context, row rowScanner) (Post, error) {
	var p Post
	var scheduled, created, updated time.Time
	var clipID, clipTitle, thumbKey, thumbPath, thumbURL sql.NullString
	var score, duration sql.NullFloat64
	var tiktokEligible bool
	var destinations, mediaJSON, tiktokJSON []byte
	e := row.Scan(&p.ID, &p.Title, &p.Caption, &p.Notes, pq.Array(&p.Platforms), pq.Array(&p.AccountIDs), &p.Status, &p.PublishingError, &scheduled, &created, &updated, &mediaJSON, &tiktokJSON, &clipID, &clipTitle, &score, &duration, &tiktokEligible, &thumbKey, &thumbPath, &thumbURL, &destinations)
	if e != nil {
		return p, e
	}
	if e = json.Unmarshal(destinations, &p.PublishingDestinations); e != nil {
		return p, e
	}
	if e = json.Unmarshal(mediaJSON, &p.Media); e != nil {
		return p, e
	}
	var persistedTikTok map[string]any
	if e = json.Unmarshal(tiktokJSON, &persistedTikTok); e != nil {
		return p, e
	}
	if len(persistedTikTok) > 0 {
		var options publishing.TikTokOptions
		if e = json.Unmarshal(tiktokJSON, &options); e != nil {
			return p, e
		}
		p.TikTok = &options
	}
	p.ScheduledAt = isoDate(scheduled)
	p.CreatedAt = isoDate(created)
	p.UpdatedAt = isoDate(updated)
	if clipID.Valid {
		p.Clip = &PostClip{ID: clipID.String, Title: clipTitle.String, ViralScore: score.Float64, Duration: duration.Float64, TikTokEligible: tiktokEligible, ThumbnailURL: s.thumbnail(ctx, thumbKey, thumbPath, thumbURL)}
	}
	return p, nil
}
func (s *Repository) Get(ctx context.Context, userID, id string) (Post, error) {
	return s.readPost(ctx, s.db.QueryRowContext(ctx, postSelect+` WHERE p.id=$1 AND p.user_id=$2`, id, userID))
}

type ListResult struct {
	Posts []Post       `json:"posts"`
	Clips []ClipOption `json:"clips"`
	Meta  struct {
		Truncated bool `json:"truncated"`
		Limit     int  `json:"limit"`
	} `json:"meta"`
}

func (s *Repository) List(ctx context.Context, userID string, start, end time.Time) (ListResult, error) {
	result := ListResult{Posts: []Post{}, Clips: []ClipOption{}}
	result.Meta.Limit = PostLimit
	rows, e := s.db.QueryContext(ctx, postSelect+` WHERE p.user_id=$1 AND p.scheduled_at >= $2 AND p.scheduled_at < $3 ORDER BY p.scheduled_at ASC,p.id ASC LIMIT $4`, userID, start, end, PostLimit+1)
	if e != nil {
		return result, e
	}
	for rows.Next() {
		p, e := s.readPost(ctx, rows)
		if e != nil {
			rows.Close()
			return result, e
		}
		if len(result.Posts) < PostLimit {
			result.Posts = append(result.Posts, p)
		} else {
			result.Meta.Truncated = true
		}
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return result, e
	}
	rows, e = s.db.QueryContext(ctx, `SELECT id,title,viral_score,duration,COALESCE(NULLIF(tiktok_file_storage_key,''),CASE WHEN contains_platform_badge IS FALSE THEN COALESCE(NULLIF(file_storage_key,''),NULLIF(file_path,''),file_url,'') END,'')<>'',thumbnail_storage_key,thumbnail_path,thumbnail_url,caption_tiktok,caption_instagram,caption_youtube FROM clips WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2`, userID, RecentClipLimit)
	if e != nil {
		return result, e
	}
	defer rows.Close()
	for rows.Next() {
		var c ClipOption
		var key, path, url sql.NullString
		if e = rows.Scan(&c.ID, &c.Title, &c.ViralScore, &c.Duration, &c.TikTokEligible, &key, &path, &url, &c.CaptionTiktok, &c.CaptionInstagram, &c.CaptionYoutube); e != nil {
			return result, e
		}
		c.ThumbnailURL = s.thumbnail(ctx, key, path, url)
		result.Clips = append(result.Clips, c)
	}
	return result, rows.Err()
}
func lockUser(ctx context.Context, tx *sql.Tx, userID string) error {
	var role string
	var activation bool
	e := tx.QueryRowContext(ctx, `SELECT access_role,email_activation_required FROM users WHERE id=$1 FOR UPDATE`, userID).Scan(&role, &activation)
	if errors.Is(e, sql.ErrNoRows) {
		return ErrInactive
	}
	if e != nil {
		return e
	}
	if role != "member" || activation {
		return ErrInactive
	}
	var deleting bool
	e = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=$1)`, userID).Scan(&deleting)
	if e != nil {
		return e
	}
	if deleting {
		return ErrInactive
	}
	return nil
}
func encodeTikTokOptions(options publishing.TikTokOptions) []byte {
	if options == (publishing.TikTokOptions{}) {
		return []byte(`{}`)
	}
	encoded, _ := json.Marshal(options)
	return encoded
}
func tiktokIssue(field string) Issue {
	switch field {
	case "accountIds":
		return Issue{field, "Reconnect the selected TikTok account and try again"}
	case "clipId":
		return Issue{field, "Choose an eligible TikTok clip from your library"}
	case "media":
		return Issue{field, "Choose TikTok-compatible media within the creator restrictions"}
	case "caption":
		return Issue{field, "TikTok captions support up to 2,200 characters for videos or 4,000 for photos"}
	default:
		return Issue{"tiktok", "Review the TikTok settings and creator restrictions"}
	}
}

func (s *Repository) prepareTikTokSchedule(ctx context.Context, userID, id string, fields map[string]any, create bool) ([]string, error) {
	if s.tiktokValidator == nil {
		return nil, nil
	}
	var status string
	var accountIDs []string
	if create {
		status = fields["status"].(string)
		accountIDs = fields["accountIds"].([]string)
	} else {
		var persisted pq.StringArray
		if err := s.db.QueryRowContext(ctx, `SELECT status,account_ids FROM scheduled_posts WHERE id=$1 AND user_id=$2`, id, userID).Scan(&status, &persisted); err != nil {
			return nil, err
		}
		accountIDs = []string(persisted)
		if value, ok := fields["status"]; ok {
			status = value.(string)
		}
		if value, ok := fields["accountIds"]; ok {
			accountIDs = value.([]string)
		}
	}
	if status != "scheduled" && status != "publish" {
		return nil, nil
	}
	field, err := s.tiktokValidator.PrepareTikTokSchedule(ctx, userID, accountIDs)
	if err == nil {
		return append([]string(nil), accountIDs...), nil
	}
	if field == "" {
		return nil, err
	}
	return nil, &ValidationError{Issues: []Issue{tiktokIssue(field)}}
}

func (s *Repository) Mutate(ctx context.Context, userID, id string, input map[string]any, create bool) (Post, error) {
	var empty Post
	fields, e := Validate(input, create)
	if e != nil {
		return empty, e
	}
	if media, ok := fields["media"].([]map[string]string); ok {
		for _, item := range media {
			key, keyErr := s.media.KeyFromReference(item["reference"])
			if keyErr != nil || path.Dir(key) != "publishing/"+userID {
				return empty, &ValidationError{Issues: []Issue{{"media", "Choose media uploaded by this account"}}}
			}
			item["reference"] = key
		}
	}
	preparedAccountIDs, prepareErr := s.prepareTikTokSchedule(ctx, userID, id, fields, create)
	if prepareErr != nil {
		e = prepareErr
		return empty, e
	}
	tx, e := s.db.BeginTx(ctx, nil)
	if e != nil {
		return empty, e
	}
	defer tx.Rollback()
	if e = lockUser(ctx, tx, userID); e != nil {
		return empty, e
	}
	var currentStatus string
	var currentClip sql.NullString
	var currentCaption sql.NullString
	var currentTikTokJSON []byte
	var currentPlatforms, currentAccountIDs pq.StringArray
	if !create {
		e = tx.QueryRowContext(ctx, `SELECT status,clip_id,caption,platforms,account_ids,tiktok_options FROM scheduled_posts WHERE id=$1 AND user_id=$2 FOR UPDATE`, id, userID).Scan(&currentStatus, &currentClip, &currentCaption, &currentPlatforms, &currentAccountIDs, &currentTikTokJSON)
		if e != nil {
			return empty, e
		}
		if currentStatus == "publishing" || currentStatus == "published" {
			return empty, ErrLocked
		}
	}
	clipID, clipChanged := fields["clipId"]
	if !clipChanged && currentClip.Valid {
		clipID = currentClip.String
	}
	if clipID != nil {
		var found string
		e = tx.QueryRowContext(ctx, `SELECT id FROM clips WHERE id=$1 AND user_id=$2 FOR KEY SHARE`, clipID, userID).Scan(&found)
		if errors.Is(e, sql.ErrNoRows) {
			return empty, ErrClip
		}
		if e != nil {
			return empty, e
		}
	}
	status := currentStatus
	if create {
		status = fields["status"].(string)
	} else if value, ok := fields["status"]; ok {
		status = value.(string)
	}
	if status == "publish" {
		status = "scheduled"
		fields["status"] = status
		fields["scheduledAt"] = time.Now().UTC().Truncate(time.Millisecond)
	}
	platforms := []string(currentPlatforms)
	if value, ok := fields["platforms"]; ok {
		platforms = value.([]string)
	}
	accountIDs := []string(currentAccountIDs)
	if value, ok := fields["accountIds"]; ok {
		accountIDs = value.([]string)
	}
	if status == "scheduled" && s.tiktokValidator != nil && !slices.Equal(accountIDs, preparedAccountIDs) {
		return empty, &ValidationError{Issues: []Issue{{"accountIds", "Publishing accounts changed while the post was being validated. Try again"}}}
	}
	caption := currentCaption.String
	if value, ok := fields["caption"]; ok {
		caption = ""
		if value != nil {
			caption = value.(string)
		}
	}
	tiktokOptions := publishing.TikTokOptions{}
	if !create && len(currentTikTokJSON) > 0 {
		if e = json.Unmarshal(currentTikTokJSON, &tiktokOptions); e != nil {
			return empty, e
		}
	}
	if value, ok := fields["tiktok"]; ok {
		tiktokOptions = value.(publishing.TikTokOptions)
	}
	if status == "scheduled" {
		issues := []Issue{}
		var selectedMedia []map[string]string
		mediaValue, hasMedia := fields["media"]
		if hasMedia {
			selectedMedia = mediaValue.([]map[string]string)
		}
		if !hasMedia && !create {
			var raw []byte
			if e = tx.QueryRowContext(ctx, `SELECT media FROM scheduled_posts WHERE id=$1`, id).Scan(&raw); e != nil {
				return empty, e
			}
			if e = json.Unmarshal(raw, &selectedMedia); e != nil {
				return empty, e
			}
		}
		if clipID == nil && len(selectedMedia) == 0 {
			issues = append(issues, Issue{"clipId", "Choose a clip before scheduling publication"})
		}
		if clipID != nil && len(selectedMedia) > 0 {
			issues = append(issues, Issue{"media", "Choose either a library clip or uploaded media"})
		}
		if len(accountIDs) == 0 {
			issues = append(issues, Issue{"accountIds", "Choose at least one connected account"})
		}
		type selectedAccount struct{ id, provider string }
		accounts := []selectedAccount{}
		providers := []string{}
		if len(accountIDs) > 0 {
			rows, queryErr := tx.QueryContext(ctx, `SELECT id,provider FROM social_accounts WHERE user_id=$1 AND status='connected' AND (provider='tiktok' OR COALESCE(token_expires_at>now(),true)) AND id=ANY($2::uuid[])`, userID, pq.Array(accountIDs))
			if queryErr != nil {
				return empty, queryErr
			}
			for rows.Next() {
				var account selectedAccount
				if queryErr = rows.Scan(&account.id, &account.provider); queryErr == nil {
					accounts = append(accounts, account)
					providers = append(providers, account.provider)
				}
			}
			if queryErr == nil {
				queryErr = rows.Err()
			}
			rows.Close()
			if queryErr != nil {
				return empty, queryErr
			}
		}
		if len(accounts) != len(accountIDs) {
			issues = append(issues, Issue{"accountIds", "Reconnect the selected account and try again"})
		} else {
			tiktokAccounts := []selectedAccount{}
			for _, account := range accounts {
				if account.provider == "tiktok" {
					tiktokAccounts = append(tiktokAccounts, account)
				}
				if !slices.Contains([]string{"instagram", "facebook", "tiktok"}, account.provider) || !slices.Contains(platforms, account.provider) {
					issues = append(issues, Issue{"accountIds", "Only connected Instagram, Facebook and TikTok accounts can be scheduled"})
					break
				}
				if len(selectedMedia) > 0 {
					media := make([]publishing.PublishMedia, 0, len(selectedMedia))
					for _, item := range selectedMedia {
						media = append(media, publishing.PublishMedia{Type: item["type"], URL: item["reference"]})
					}
					if mediaErr := publishing.ValidateMediaReferences(account.provider, media); mediaErr != nil {
						issues = append(issues, Issue{"media", mediaErr.Error()})
						break
					}
					if validator, ok := s.media.(interface {
						ValidatePublishingMedia(context.Context, string, string, string) error
					}); ok {
						for _, item := range selectedMedia {
							if mediaErr := validator.ValidatePublishingMedia(ctx, account.provider, item["reference"], item["type"]); mediaErr != nil {
								issues = append(issues, Issue{"media", mediaErr.Error()})
								break
							}
						}
					}
				}
			}
			if len(tiktokAccounts) > 1 {
				issues = append(issues, Issue{"accountIds", "Choose one TikTok account per calendar post"})
			}
			for _, platform := range platforms {
				if !slices.Contains(providers, platform) {
					issues = append(issues, Issue{"platforms", "Each platform must have a selected publishing account"})
					break
				}
			}
			if len(tiktokAccounts) == 1 {
				switch {
				case clipID == nil && len(selectedMedia) == 0:
					issues = append(issues, tiktokIssue("clipId"))
				case (len(selectedMedia) == 0 || selectedMedia[0]["type"] == "video") && utf16Length(caption) > 2200 || len(selectedMedia) > 0 && selectedMedia[0]["type"] == "image" && utf16Length(caption) > 4000:
					issues = append(issues, tiktokIssue("caption"))
				case !tiktokOptions.MusicUsageConfirmed || tiktokOptions.PrivacyLevel == "":
					issues = append(issues, tiktokIssue("tiktok"))
				case s.tiktokValidator == nil:
					issues = append(issues, Issue{"tiktok", "TikTok publishing is temporarily unavailable"})
				case len(issues) == 0:
					var field string
					var validationErr error
					if len(selectedMedia) > 0 {
						validator, ok := s.tiktokValidator.(interface {
							ValidateTikTokMediaSchedule(context.Context, *sql.Tx, string, string, []publishing.PublishMedia, string, publishing.TikTokOptions) (string, error)
						})
						if !ok {
							issues = append(issues, Issue{"tiktok", "TikTok publishing is temporarily unavailable"})
							break
						}
						media := make([]publishing.PublishMedia, 0, len(selectedMedia))
						for _, item := range selectedMedia {
							media = append(media, publishing.PublishMedia{Type: item["type"], URL: item["reference"]})
						}
						field, validationErr = validator.ValidateTikTokMediaSchedule(ctx, tx, userID, tiktokAccounts[0].id, media, caption, tiktokOptions)
					} else {
						field, validationErr = s.tiktokValidator.ValidateTikTokSchedule(ctx, tx, userID, tiktokAccounts[0].id, clipID.(string), caption, tiktokOptions)
					}
					if validationErr != nil {
						if field == "" {
							return empty, validationErr
						}
						var mediaError *publishing.TikTokMediaError
						if errors.As(validationErr, &mediaError) {
							issues = append(issues, Issue{field, mediaError.Error()})
						} else {
							issues = append(issues, tiktokIssue(field))
						}
					}
				}
			}
		}
		if len(issues) > 0 {
			return empty, &ValidationError{Issues: issues}
		}
	}
	if create {
		var b [16]byte
		if _, e = rand.Read(b[:]); e != nil {
			return empty, e
		}
		b[6] = b[6]&0x0f | 0x40
		b[8] = b[8]&0x3f | 0x80
		id = fmt.Sprintf("%x-%x-%x-%x-%x", b[:4], b[4:6], b[6:8], b[8:10], b[10:])
		var owner any
		if clipID != nil {
			owner = userID
		}
		media := fields["media"]
		if media == nil {
			media = []map[string]string{}
		}
		mediaJSON, _ := json.Marshal(media)
		_, e = tx.ExecContext(ctx, `INSERT INTO scheduled_posts(id,user_id,clip_id,clip_owner_id,title,caption,notes,platforms,account_ids,status,scheduled_at,media,tiktok_options,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now(),now())`, id, userID, clipID, owner, fields["title"], fields["caption"], fields["notes"], pq.Array(fields["platforms"]), pq.Array(fields["accountIds"]), fields["status"], fields["scheduledAt"], mediaJSON, encodeTikTokOptions(tiktokOptions))
	} else {
		if currentStatus == "failed" && status == "scheduled" {
			if _, e = tx.ExecContext(ctx, `UPDATE social_posts SET scheduled_post_id=NULL WHERE scheduled_post_id=$1`, id); e != nil {
				return empty, e
			}
		}
		keys := make([]string, 0, len(fields))
		for key := range fields {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		sets := []string{"updated_at=now()"}
		args := []any{id, userID}
		for _, key := range keys {
			value := fields[key]
			if key == "platforms" || key == "accountIds" {
				value = pq.Array(value)
			}
			if key == "media" {
				value, _ = json.Marshal(value)
			}
			if key == "tiktok" {
				value = encodeTikTokOptions(value.(publishing.TikTokOptions))
			}
			args = append(args, value)
			sets = append(sets, fmt.Sprintf("%s=$%d", mutationColumns[key], len(args)))
		}
		if status == "scheduled" {
			sets = append(sets, "publishing_error=''")
		}
		if clipChanged {
			var owner any
			if clipID != nil {
				owner = userID
			}
			args = append(args, owner)
			sets = append(sets, fmt.Sprintf("clip_owner_id=$%d", len(args)))
		}
		var result sql.Result
		result, e = tx.ExecContext(ctx, `UPDATE scheduled_posts SET `+strings.Join(sets, ",")+` WHERE id=$1 AND user_id=$2`, args...)
		if e == nil {
			var count int64
			count, e = result.RowsAffected()
			if e == nil && count == 0 {
				e = sql.ErrNoRows
			}
		}
	}
	if e != nil {
		var pg *pq.Error
		if errors.As(e, &pg) && pg.Code == "23503" {
			return empty, ErrClip
		}
		return empty, e
	}
	p, e := s.readPost(ctx, tx.QueryRowContext(ctx, postSelect+` WHERE p.id=$1 AND p.user_id=$2`, id, userID))
	if e != nil {
		return empty, e
	}
	if e = tx.Commit(); e != nil {
		return empty, e
	}
	return p, nil
}
func (s *Repository) Delete(ctx context.Context, userID, id string) error {
	tx, e := s.db.BeginTx(ctx, nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	if e = lockUser(ctx, tx, userID); e != nil {
		return e
	}
	var status string
	if e = tx.QueryRowContext(ctx, `SELECT status FROM scheduled_posts WHERE id=$1 AND user_id=$2 FOR UPDATE`, id, userID).Scan(&status); e != nil {
		return e
	}
	if status == "publishing" {
		return ErrLocked
	}
	result, e := tx.ExecContext(ctx, `DELETE FROM scheduled_posts WHERE id=$1 AND user_id=$2`, id, userID)
	if e != nil {
		return e
	}
	count, e := result.RowsAffected()
	if e != nil {
		return e
	}
	if count == 0 {
		return sql.ErrNoRows
	}
	return tx.Commit()
}
