package calendar

import (
	"context"
	"crypto/rand"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/lib/pq"
)

var ErrClip = errors.New("Choose a clip from your library or remove the selected clip")
var ErrInactive = errors.New("Account is unavailable")

type Media interface {
	KeyFromReference(string) (string, error)
	SignedURL(context.Context, string) (string, error)
}
type PostClip struct {
	ID           string  `json:"id"`
	Title        string  `json:"title"`
	ViralScore   float64 `json:"viralScore"`
	ThumbnailURL *string `json:"thumbnailUrl"`
}
type ClipOption struct {
	PostClip
	CaptionTiktok    *string `json:"captionTiktok"`
	CaptionInstagram *string `json:"captionInstagram"`
	CaptionYoutube   *string `json:"captionYoutube"`
}
type Post struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	Caption     *string   `json:"caption"`
	Notes       *string   `json:"notes"`
	Platforms   []string  `json:"platforms"`
	Status      string    `json:"status"`
	ScheduledAt string    `json:"scheduledAt"`
	CreatedAt   string    `json:"createdAt"`
	UpdatedAt   string    `json:"updatedAt"`
	Clip        *PostClip `json:"clip"`
}
type Repository struct {
	db    *sql.DB
	media Media
}

func NewRepository(db *sql.DB, media Media) *Repository { return &Repository{db: db, media: media} }
func isoDate(t time.Time) string                        { return t.UTC().Format("2006-01-02T15:04:05.000Z") }
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

const postSelect = `SELECT p.id,p.title,p.caption,p.notes,p.platforms,p.status,p.scheduled_at,p.created_at,p.updated_at,
	c.id,c.title,c.viral_score,c.thumbnail_storage_key,c.thumbnail_path,c.thumbnail_url
	FROM scheduled_posts p LEFT JOIN clips c ON c.id=p.clip_id AND c.user_id=p.user_id`

type rowScanner interface{ Scan(...any) error }

func (s *Repository) readPost(ctx context.Context, row rowScanner) (Post, error) {
	var p Post
	var scheduled, created, updated time.Time
	var clipID, clipTitle, thumbKey, thumbPath, thumbURL sql.NullString
	var score sql.NullFloat64
	e := row.Scan(&p.ID, &p.Title, &p.Caption, &p.Notes, pq.Array(&p.Platforms), &p.Status, &scheduled, &created, &updated, &clipID, &clipTitle, &score, &thumbKey, &thumbPath, &thumbURL)
	if e != nil {
		return p, e
	}
	p.ScheduledAt = isoDate(scheduled)
	p.CreatedAt = isoDate(created)
	p.UpdatedAt = isoDate(updated)
	if clipID.Valid {
		p.Clip = &PostClip{ID: clipID.String, Title: clipTitle.String, ViralScore: score.Float64, ThumbnailURL: s.thumbnail(ctx, thumbKey, thumbPath, thumbURL)}
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
	rows, e = s.db.QueryContext(ctx, `SELECT id,title,viral_score,thumbnail_storage_key,thumbnail_path,thumbnail_url,caption_tiktok,caption_instagram,caption_youtube FROM clips WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2`, userID, RecentClipLimit)
	if e != nil {
		return result, e
	}
	defer rows.Close()
	for rows.Next() {
		var c ClipOption
		var key, path, url sql.NullString
		if e = rows.Scan(&c.ID, &c.Title, &c.ViralScore, &key, &path, &url, &c.CaptionTiktok, &c.CaptionInstagram, &c.CaptionYoutube); e != nil {
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
func (s *Repository) Mutate(ctx context.Context, userID, id string, input map[string]any, create bool) (Post, error) {
	var empty Post
	fields, e := Validate(input, create)
	if e != nil {
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
	clipID, clipChanged := fields["clipId"]
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
		_, e = tx.ExecContext(ctx, `INSERT INTO scheduled_posts(id,user_id,clip_id,clip_owner_id,title,caption,notes,platforms,status,scheduled_at,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),now())`, id, userID, clipID, owner, fields["title"], fields["caption"], fields["notes"], pq.Array(fields["platforms"]), fields["status"], fields["scheduledAt"])
	} else {
		keys := make([]string, 0, len(fields))
		for key := range fields {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		sets := []string{"updated_at=now()"}
		args := []any{id, userID}
		for _, key := range keys {
			value := fields[key]
			if key == "platforms" {
				value = pq.Array(value)
			}
			args = append(args, value)
			sets = append(sets, fmt.Sprintf("%s=$%d", mutationColumns[key], len(args)))
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
