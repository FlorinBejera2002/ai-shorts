package stories

import (
	"context"
	"database/sql"
	"fmt"
	"path"
	"sneepcut/backend-go/internal/story"
	"strings"
)

// Resolve the opaque resource only inside the owned project's queue transaction.
// Storage keys are never accepted as public story options.
func resolveStoryLogo(ctx context.Context, tx *sql.Tx, req *story.Request) error {
	if err := story.ValidateBrandOptions(req.Options); err != nil {
		return fmt.Errorf("%w: %s", ErrInvalid, err)
	}
	if req.Options.LogoResourceID == "" {
		return nil
	}
	err := tx.QueryRowContext(ctx, `SELECT reference FROM workspace_agent_resources WHERE id=$1 AND user_id=$2 AND kind='logo' AND (project_id IS NULL OR project_id=$3)`, req.Options.LogoResourceID, req.UserID, req.ID).Scan(&req.LogoKey)
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
