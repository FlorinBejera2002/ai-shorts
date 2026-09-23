package brand

import (
	"context"
	"crypto/rand"
	"database/sql"
	"errors"
	"fmt"
	"sneepcut/backend-go/internal/agentaction"
	"sort"
	"strings"
)

type Repository struct{ db *sql.DB }

func NewRepository(db *sql.DB) *Repository { return &Repository{db: db} }
func (r *Repository) Update(ctx context.Context, userID string, input map[string]any) error {
	_, err := r.update(ctx, userID, input, nil)
	return err
}
func (r *Repository) update(ctx context.Context, userID string, input map[string]any, guard *AgentUpdate) (out AgentState, err error) {
	fields, e := Validate(input)
	if e != nil {
		return out, e
	}
	tx, e := r.db.BeginTx(ctx, nil)
	if e != nil {
		return out, e
	}
	defer tx.Rollback()
	if guard != nil {
		replay, e := agentaction.Replay(ctx, tx, userID, guard.RequestID, "brand.update", guard, &out)
		if e != nil {
			return out, e
		}
		if replay {
			return out, tx.Commit()
		}
	}
	var role, plan string
	var activation bool
	e = tx.QueryRowContext(ctx, `SELECT access_role,plan,email_activation_required FROM users WHERE id=$1 FOR UPDATE`, userID).Scan(&role, &plan, &activation)
	if errors.Is(e, sql.ErrNoRows) {
		return out, ErrInactive
	}
	if e != nil {
		return out, e
	}
	if role != "member" || activation {
		return out, ErrInactive
	}
	var deleting bool
	if e = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=$1)`, userID).Scan(&deleting); e != nil {
		return out, e
	}
	if deleting {
		return out, ErrInactive
	}
	if hide, ok := fields["hidePlatformBadge"].(bool); ok && hide && plan != "agency" {
		return out, ErrPlan
	}
	if guard != nil {
		before, e := readAgentState(ctx, tx, userID, true)
		if e != nil {
			return out, e
		}
		if guard.ExpectedState != before.ExpectedState {
			return out, agentaction.ErrConflict
		}
		out.Previous = before.Settings
	}
	var id [16]byte
	if _, e = rand.Read(id[:]); e != nil {
		return out, e
	}
	id[6] = id[6]&0x0f | 0x40
	id[8] = id[8]&0x3f | 0x80
	identifier := fmt.Sprintf("%x-%x-%x-%x-%x", id[0:4], id[4:6], id[6:8], id[8:10], id[10:16])
	_, e = tx.ExecContext(ctx, `INSERT INTO brand_kits(id,user_id,primary_color,secondary_color,font_family,apply_brand_colors,apply_brand_font,subtitle_font,subtitle_color,subtitle_bg_color,subtitle_bg_opacity,subtitle_position,watermark_position,watermark_opacity,hide_platform_badge,created_at,updated_at)
	VALUES($1,$2,'#6366f1','#8b5cf6','Inter',false,false,'Inter Bold','#FFFFFF','#000000',0.7,'bottom','bottom-right',0.8,false,now(),now()) ON CONFLICT(user_id) DO NOTHING`, identifier, userID)
	if e != nil {
		return out, e
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
		return out, e
	}
	if guard != nil {
		current, e := readAgentState(ctx, tx, userID, false)
		if e != nil {
			return out, e
		}
		current.Previous = out.Previous
		out = current
		if e = agentaction.Put(ctx, tx, userID, guard.RequestID, "brand.update", guard, out); e != nil {
			return out, e
		}
	}
	return out, tx.Commit()
}
