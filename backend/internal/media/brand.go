package media

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"mime"
	"net/http"
	"os"
	"path"
	"strings"
	"time"

	_ "golang.org/x/image/webp"
	"sneepcut/backend-go/internal/identity"
)

const maxLogoBytes int64 = 5 * 1024 * 1024

var logoFormats = map[string]string{".png": "png", ".jpg": "jpeg", ".jpeg": "jpeg", ".webp": "webp"}
var logoTypes = map[string]string{".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}

func validStoredImage(filename, suffix string) bool {
	f, e := os.Open(filename)
	if e != nil {
		return false
	}
	defer f.Close()
	config, format, e := image.DecodeConfig(f)
	if e != nil || format != logoFormats[suffix] || config.Width <= 0 || config.Height <= 0 || int64(config.Width)*int64(config.Height) > 40_000_000 {
		return false
	}
	if _, e = f.Seek(0, 0); e != nil {
		return false
	}
	decoded, format, e := image.Decode(f)
	return e == nil && format == logoFormats[suffix] && decoded.Bounds().Dx() == config.Width && decoded.Bounds().Dy() == config.Height
}
func (s *Service) ownedLogoKey(reference, userID string, legacy bool) (string, error) {
	key, e := s.KeyFromReference(reference)
	suffix := strings.ToLower(path.Ext(key))
	if e != nil || !uuidPattern.MatchString(userID) || path.Dir(key) != "brand/"+userID || (logoFormats[suffix] == "" && !(legacy && suffix == ".svg")) {
		return "", ErrInvalidKey
	}
	return key, nil
}

// ResolveOwnedLogo admits only completed, validated logo uploads in this account.
func (s *Service) ResolveOwnedLogo(ctx context.Context, user, reference string) (string, error) {
	key, err := s.ownedLogoKey(reference, user, false)
	if err != nil {
		return "", err
	}
	exists, err := s.Storage.Exists(ctx, key)
	if err != nil {
		return "", err
	}
	if !exists {
		return "", ErrInvalidKey
	}
	return key, nil
}

func camelCase(key string) string {
	parts := strings.Split(key, "_")
	for i := 1; i < len(parts); i++ {
		if parts[i] != "" {
			parts[i] = strings.ToUpper(parts[i][:1]) + parts[i][1:]
		}
	}
	return strings.Join(parts, "")
}
func (s *Service) GetBrand(ctx context.Context, userID string) (map[string]any, error) {
	var raw []byte
	e := s.db.QueryRowContext(ctx, `SELECT to_jsonb(b) FROM brand_kits b WHERE user_id=$1`, userID).Scan(&raw)
	if errors.Is(e, sql.ErrNoRows) {
		return nil, nil
	}
	if e != nil {
		return nil, e
	}
	var fields map[string]any
	if e = json.Unmarshal(raw, &fields); e != nil {
		return nil, e
	}
	result := make(map[string]any, len(fields))
	for k, v := range fields {
		result[camelCase(k)] = v
	}
	result["logoUrl"] = nil
	if reference, ok := result["logoPath"].(string); ok && reference != "" {
		key, e := s.ownedLogoKey(reference, userID, false)
		if e == nil {
			exists, e := s.Storage.Exists(ctx, key)
			if e == nil && exists {
				signed, e := s.SignedURL(ctx, key)
				if e == nil {
					result["logoUrl"] = signed
				}
			}
		}
	}
	return result, nil
}
func (s *Service) setBrandLogo(ctx context.Context, userID string, key *string) error {
	tx, e := s.db.BeginTx(ctx, nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	if e = lockBrandLogoUser(ctx, tx, userID); e != nil {
		return e
	}
	if e = writeBrandLogo(ctx, tx, userID, key); e != nil {
		return e
	}
	return tx.Commit()
}

func lockBrandLogoUser(ctx context.Context, tx *sql.Tx, userID string) error {
	var role string
	var activation bool
	// Serialize final logo persistence with account deletion's user lock.
	e := tx.QueryRowContext(ctx, `SELECT access_role,email_activation_required FROM users WHERE id=$1 FOR UPDATE`, userID).Scan(&role, &activation)
	if errors.Is(e, sql.ErrNoRows) {
		return failure(401, "Authentication required")
	}
	if e != nil {
		return e
	}
	if role != "member" || activation {
		return failure(403, "This role cannot modify content")
	}
	var deleting bool
	if e = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=$1)`, userID).Scan(&deleting); e != nil {
		return e
	}
	if deleting {
		return failure(409, "Account deletion is pending")
	}
	return nil
}

func writeBrandLogo(ctx context.Context, tx *sql.Tx, userID string, key *string) error {
	id, e := randomUUID()
	if e != nil {
		return e
	}
	_, e = tx.ExecContext(ctx, `INSERT INTO brand_kits(id,user_id,logo_path,logo_url,primary_color,secondary_color,font_family,apply_brand_colors,apply_brand_font,subtitle_font,subtitle_color,subtitle_bg_color,subtitle_bg_opacity,subtitle_position,watermark_position,watermark_opacity,hide_platform_badge,created_at,updated_at)
	VALUES($1,$2,$3,NULL,'#6366f1','#8b5cf6','Inter',false,false,'Inter Bold','#FFFFFF','#000000',0.7,'bottom','bottom-right',0.8,false,now(),now())
	ON CONFLICT(user_id) DO UPDATE SET logo_path=excluded.logo_path,logo_url=NULL,updated_at=now()`, id, userID, key)
	if e != nil {
		return e
	}
	return nil
}
func (h *Handler) getLogo(w http.ResponseWriter, r *http.Request) {
	userID := identity.Current(r).User.ID
	reference := r.URL.Query().Get("logo_path")
	if r.URL.Path == "/api/user/brand/logo" && reference == "" {
		brand, e := h.service.GetBrand(r.Context(), userID)
		if e != nil {
			mediaError(w, e)
			return
		}
		writeMedia(w, 200, map[string]any{"brandKit": brand})
		return
	}
	key, e := h.service.ownedLogoKey(reference, userID, false)
	if e != nil {
		mediaError(w, e)
		return
	}
	exists, e := h.service.Storage.Exists(r.Context(), key)
	if e != nil {
		mediaError(w, e)
		return
	}
	if !exists {
		mediaError(w, failure(404, "Logo not found"))
		return
	}
	signed, e := h.service.SignedURL(r.Context(), key)
	if e != nil {
		mediaError(w, e)
		return
	}
	writeMedia(w, 200, map[string]string{"logo_url": signed})
}
func (h *Handler) uploadLogo(w http.ResponseWriter, r *http.Request) {
	userID := identity.Current(r).User.ID
	if e := h.service.allow(r.Context(), userID, "logo", 10); e != nil {
		mediaError(w, e)
		return
	}
	part, e := firstFile(w, r, maxLogoBytes)
	if e != nil {
		mediaError(w, e)
		return
	}
	defer part.Close()
	suffix := strings.ToLower(path.Ext(part.FileName()))
	if logoFormats[suffix] == "" {
		mediaError(w, failure(400, "Unsupported image format"))
		return
	}
	contentType, _, e := mime.ParseMediaType(part.Header.Get("Content-Type"))
	if e != nil || (contentType != logoTypes[suffix] && contentType != "application/octet-stream") {
		mediaError(w, failure(400, "Unsupported content type"))
		return
	}
	filename, _, e := h.service.stage(r.Context(), part, maxLogoBytes, 0, suffix, false)
	if e != nil {
		mediaError(w, e)
		return
	}
	defer os.Remove(filename)
	if !validStoredImage(filename, suffix) {
		mediaError(w, failure(400, "Invalid image file"))
		return
	}
	if e = h.service.accountActive(r.Context(), userID, true); e != nil {
		mediaError(w, e)
		return
	}
	id, e := randomID()
	if e != nil {
		mediaError(w, e)
		return
	}
	key := "brand/" + userID + "/logo-" + id + "-" + safeSlug(strings.TrimSuffix(part.FileName(), path.Ext(part.FileName()))) + suffix
	if e = h.service.Storage.Save(r.Context(), filename, key, logoTypes[suffix]); e != nil {
		mediaError(w, e)
		return
	}
	if r.URL.Path == "/api/user/brand/logo" {
		e = h.service.setBrandLogo(r.Context(), userID, &key)
	} else {
		e = h.service.accountActive(r.Context(), userID, true)
	}
	if e != nil {
		cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 30*time.Second)
		defer cancel()
		_ = h.service.Storage.Delete(cleanupCtx, key)
		mediaError(w, e)
		return
	}
	if r.URL.Path == "/api/user/brand/logo" {
		brand, e := h.service.GetBrand(r.Context(), userID)
		if e != nil {
			mediaError(w, e)
			return
		}
		writeMedia(w, 200, map[string]any{"brandKit": brand})
		return
	}
	writeMedia(w, 201, map[string]string{"logo_path": key})
}
func (h *Handler) deleteLogo(w http.ResponseWriter, r *http.Request) {
	userID := identity.Current(r).User.ID
	if e := h.service.allow(r.Context(), userID, "delete-logo", 30); e != nil {
		mediaError(w, e)
		return
	}
	reference := r.URL.Query().Get("logo_path")
	browser := r.URL.Path == "/api/user/brand/logo"
	if browser {
		var stored sql.NullString
		e := h.service.db.QueryRowContext(r.Context(), `SELECT logo_path FROM brand_kits WHERE user_id=$1`, userID).Scan(&stored)
		if e != nil && !errors.Is(e, sql.ErrNoRows) {
			mediaError(w, e)
			return
		}
		reference = stored.String
	}
	if reference != "" {
		key, e := h.service.ownedLogoKey(reference, userID, true)
		if e != nil {
			mediaError(w, e)
			return
		}
		if e = h.service.Storage.Delete(r.Context(), key); e != nil {
			mediaError(w, e)
			return
		}
	} else if !browser {
		mediaError(w, failure(400, "logo_path is required"))
		return
	}
	if browser {
		if e := h.service.setBrandLogo(r.Context(), userID, nil); e != nil {
			mediaError(w, e)
			return
		}
		brand, e := h.service.GetBrand(r.Context(), userID)
		if e != nil {
			mediaError(w, e)
			return
		}
		writeMedia(w, 200, map[string]any{"brandKit": brand})
		return
	}
	writeMedia(w, 204, nil)
}
