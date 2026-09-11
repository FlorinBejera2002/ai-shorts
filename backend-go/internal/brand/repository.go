package brand

import (
	"context"
	"crypto/rand"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"strings"
)

type Repository struct{ db *sql.DB }

func NewRepository(db *sql.DB) *Repository { return &Repository{db: db} }
func (r *Repository) Update(ctx context.Context, userID string, input map[string]any) error {
	fields, e := Validate(input)
	if e != nil {
		return e
	}
	tx, e := r.db.BeginTx(ctx, nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	var role, plan string
	var activation bool
	e = tx.QueryRowContext(ctx, `SELECT access_role,plan,email_activation_required FROM users WHERE id=$1 FOR UPDATE`, userID).Scan(&role, &plan, &activation)
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
	if e = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=$1)`, userID).Scan(&deleting); e != nil {
		return e
	}
	if deleting {
		return ErrInactive
	}
	if hide, ok := fields["hidePlatformBadge"].(bool); ok && hide && plan != "agency" {
		return ErrPlan
	}
	var id [16]byte
	if _, e = rand.Read(id[:]); e != nil {
		return e
	}
	id[6] = id[6]&0x0f | 0x40
	id[8] = id[8]&0x3f | 0x80
	identifier := fmt.Sprintf("%x-%x-%x-%x-%x", id[0:4], id[4:6], id[6:8], id[8:10], id[10:16])
	_, e = tx.ExecContext(ctx, `INSERT INTO brand_kits(id,user_id,primary_color,secondary_color,font_family,apply_brand_colors,apply_brand_font,subtitle_font,subtitle_color,subtitle_bg_color,subtitle_bg_opacity,subtitle_position,watermark_position,watermark_opacity,hide_platform_badge,created_at,updated_at)
	VALUES($1,$2,'#6366f1','#8b5cf6','Inter',false,false,'Inter Bold','#FFFFFF','#000000',0.7,'bottom','bottom-right',0.8,false,now(),now()) ON CONFLICT(user_id) DO NOTHING`, identifier, userID)
	if e != nil {
		return e
	}
	keys := make([]string, 0, len(fields))
	for key := range fields {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	sets := []string{"updated_at=now()"}
	args := []any{userID}
	for _, key := range keys {
		args = append(args, fields[key])
		sets = append(sets, fmt.Sprintf("%s=$%d", columns[key], len(args)))
	}
	if _, e = tx.ExecContext(ctx, `UPDATE brand_kits SET `+strings.Join(sets, ",")+` WHERE user_id=$1`, args...); e != nil {
		return e
	}
	return tx.Commit()
}
