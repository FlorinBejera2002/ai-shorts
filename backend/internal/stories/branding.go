package stories

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"path"
	"sneepcut/backend-go/internal/captions"
	"sneepcut/backend-go/internal/story"
	"strings"
)

// Resolve the opaque resource only inside the owned project's queue transaction.
// Storage keys are never accepted as public story options.
func resolveStoryLogo(ctx context.Context, tx *sql.Tx, req *story.Request) error {
	if err := story.ValidateBrandOptions(req.Options); err != nil {
		return fmt.Errorf("%w: %s", ErrInvalid, err)
	}
	if req.Options.UseBrandKit {
		var raw []byte
		err := tx.QueryRowContext(ctx, `SELECT COALESCE(s.brand_snapshot,(SELECT to_jsonb(b) FROM brand_kits b WHERE b.user_id=$2),'{}'::jsonb) FROM story_projects s WHERE s.id=$1 AND s.user_id=$2`, req.ID, req.UserID).Scan(&raw)
		if err != nil {
			return err
		}
		if err = json.Unmarshal(raw, &req.BrandSnapshot); err != nil {
			return err
		}
		if _, err = tx.ExecContext(ctx, `UPDATE story_projects SET brand_snapshot=$2 WHERE id=$1`, req.ID, string(raw)); err != nil {
			return err
		}
		// Logo-only generation must not resolve a font that will not be used.
		// Keep the snapshot so enabling captions later validates that saved font.
		if req.Options.CaptionStyle == nil && story.EffectiveCaptionMode(req.Options) != "off" {
			if v := req.BrandSnapshot["caption_style"]; v != nil {
				style, e := captions.Decode(v)
				if e != nil {
					return e
				}
				req.Options.CaptionStyle = style
			} else {
				style := captions.Legacy(req.BrandSnapshot)
				if err := style.Validate(); err != nil {
					return fmt.Errorf("%w: choose an available caption font or upload your saved font before using this Brand Kit", ErrInvalid)
				}
				req.Options.CaptionStyle = &style
			}
		}
		if enabled, ok := req.BrandSnapshot["watermark_enabled"].(bool); !ok || enabled {
			req.LogoKey, _ = req.BrandSnapshot["logo_path"].(string)
		}
		if position, ok := req.BrandSnapshot["watermark_position"].(string); ok {
			req.Options.LogoPosition = position
		}
		if opacity, ok := req.BrandSnapshot["watermark_opacity"].(float64); ok {
			req.Options.LogoOpacity = &opacity
		}
	}
	if style := req.Options.CaptionStyle; style != nil && !captions.IsBuiltin(style.FontID) {
		var weight int
		if err := tx.QueryRowContext(ctx, `SELECT weight FROM caption_fonts WHERE id=$1 AND user_id=$2`, style.FontID, req.UserID).Scan(&weight); err != nil || weight != style.Weight {
			return fmt.Errorf("%w: selected font is unavailable", ErrInvalid)
		}
	}
	if req.Options.LogoResourceID == "" {
		return nil
	}
	err := tx.QueryRowContext(ctx, `SELECT reference FROM workspace_agent_resources WHERE id=$1 AND user_id=$2 AND kind='logo' AND source_project_id IS NULL AND (project_id IS NULL OR project_id=$3)`, req.Options.LogoResourceID, req.UserID, req.ID).Scan(&req.LogoKey)
	if err == sql.ErrNoRows {
		return fmt.Errorf("%w: logo resource is unavailable", ErrInvalid)
	}
	if err != nil {
		return err
	}
	if path.Dir(req.LogoKey) != "brand/"+req.UserID || strings.ContainsAny(req.LogoKey, "\\\x00") || strings.Contains(req.LogoKey, "..") {
		return fmt.Errorf("%w: logo resource is invalid", ErrInvalid)
	}
	switch strings.ToLower(path.Ext(req.LogoKey)) {
	case ".png", ".jpg", ".jpeg", ".webp":
	default:
		return fmt.Errorf("%w: logo format is invalid", ErrInvalid)
	}
	return nil
}
