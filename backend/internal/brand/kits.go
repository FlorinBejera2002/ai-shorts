package brand

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/julienschmidt/httprouter"
	"sneepcut/backend-go/internal/identity"
)

// An account keeps several named brand kits; exactly one is the default. The single-kit
// endpoint (/api/user/brand) and every renderer fallback read the default kit.

var (
	ErrNotFound = errors.New("Brand kit not found")
	ErrConflict = errors.New("A brand kit with this name already exists")
	kitID       = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
)

// KitReader reads kits with signed media URLs (implemented by the media service).
type KitReader interface {
	GetKit(context.Context, string, string) (map[string]any, error)
	ListKits(context.Context, string) ([]map[string]any, error)
}

type KitCreate struct {
	Name      string  `json:"name"`
	FromKitID *string `json:"fromKitId"`
	ImagePath *string `json:"imagePath"`
}

type KitChange struct {
	Name      *string         `json:"name"`
	ImagePath json.RawMessage `json:"imagePath"`
	IsDefault *bool           `json:"isDefault"`
}

func kitName(value string) (string, error) {
	name := strings.TrimSpace(value)
	if name == "" || len([]rune(name)) > 80 {
		return "", fmt.Errorf("%w: kit name must be between 1 and 80 characters", ErrInvalid)
	}
	return name, nil
}

// kitImage accepts only images uploaded into the user's own brand folder.
func kitImage(userID string, value *string) (*string, error) {
	if value == nil || *value == "" {
		return nil, nil
	}
	if !strings.HasPrefix(*value, "brand/"+userID+"/") || strings.Contains(*value, "..") || len(*value) > 2048 {
		return nil, fmt.Errorf("%w: invalid kit image", ErrInvalid)
	}
	return value, nil
}

func newID() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16]), nil
}

func uniqueViolation(err error) bool {
	return err != nil && (strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate"))
}

// CreateKit adds a kit, empty or copied from another kit. The account's first kit is the default.
func (r *Repository) CreateKit(ctx context.Context, userID string, in KitCreate) (string, error) {
	name, err := kitName(in.Name)
	if err != nil {
		return "", err
	}
	image, err := kitImage(userID, in.ImagePath)
	if err != nil {
		return "", err
	}
	if in.FromKitID != nil && !kitID.MatchString(*in.FromKitID) {
		return "", ErrNotFound
	}
	id, err := newID()
	if err != nil {
		return "", err
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()
	var first bool
	if err = tx.QueryRowContext(ctx, `SELECT NOT EXISTS(SELECT 1 FROM brand_kits WHERE user_id=$1)`, userID).Scan(&first); err != nil {
		return "", err
	}
	var result sql.Result
	if in.FromKitID != nil {
		// Copy every setting; only identity, name, image and default flag are new.
		result, err = tx.ExecContext(ctx, `INSERT INTO brand_kits SELECT (jsonb_populate_record(NULL::brand_kits, to_jsonb(b) || jsonb_build_object('id',$3::uuid,'name',$4::text,'is_default',$5::boolean,'image_path',$6::text,'created_at',now(),'updated_at',now()))).* FROM brand_kits b WHERE b.id::text=$1 AND b.user_id=$2`, *in.FromKitID, userID, id, name, first, image)
	} else {
		result, err = tx.ExecContext(ctx, `INSERT INTO brand_kits(id,user_id,name,is_default,image_path,primary_color,secondary_color,font_family,apply_brand_colors,apply_brand_font,subtitle_font,subtitle_color,subtitle_bg_color,subtitle_bg_opacity,subtitle_position,watermark_position,watermark_opacity,hide_platform_badge,created_at,updated_at)
		VALUES($1,$2,$3,$4,$5,'#6366f1','#8b5cf6','Inter',false,false,'Inter Bold','#FFFFFF','#000000',0.7,'bottom','bottom-right',0.8,false,now(),now())`, id, userID, name, first, image)
	}
	if uniqueViolation(err) {
		return "", ErrConflict
	}
	if err != nil {
		return "", err
	}
	if n, err := result.RowsAffected(); err != nil || n == 0 {
		return "", ErrNotFound
	}
	return id, tx.Commit()
}

// ChangeKit renames a kit, replaces or clears its image, or makes it the default.
func (r *Repository) ChangeKit(ctx context.Context, userID, id string, in KitChange) error {
	if !kitID.MatchString(id) {
		return ErrNotFound
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var exists bool
	if err = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM brand_kits WHERE id=$1 AND user_id=$2)`, id, userID).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return ErrNotFound
	}
	if in.Name != nil {
		name, err := kitName(*in.Name)
		if err != nil {
			return err
		}
		_, err = tx.ExecContext(ctx, `UPDATE brand_kits SET name=$3,updated_at=now() WHERE id=$1 AND user_id=$2`, id, userID, name)
		if uniqueViolation(err) {
			return ErrConflict
		}
		if err != nil {
			return err
		}
	}
	if in.ImagePath != nil {
		var value *string
		if string(in.ImagePath) != "null" {
			if err = json.Unmarshal(in.ImagePath, &value); err != nil {
				return fmt.Errorf("%w: invalid kit image", ErrInvalid)
			}
		}
		image, err := kitImage(userID, value)
		if err != nil {
			return err
		}
		if _, err = tx.ExecContext(ctx, `UPDATE brand_kits SET image_path=$3,updated_at=now() WHERE id=$1 AND user_id=$2`, id, userID, image); err != nil {
			return err
		}
	}
	if in.IsDefault != nil {
		if !*in.IsDefault {
			return fmt.Errorf("%w: choose another kit as the default instead", ErrInvalid)
		}
		if _, err = tx.ExecContext(ctx, `UPDATE brand_kits SET is_default=false WHERE user_id=$1 AND is_default AND id<>$2`, userID, id); err != nil {
			return err
		}
		if _, err = tx.ExecContext(ctx, `UPDATE brand_kits SET is_default=true,updated_at=now() WHERE id=$1 AND user_id=$2`, id, userID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// DeleteKit removes a kit. Deleting the default promotes the most recently edited kit left.
func (r *Repository) DeleteKit(ctx context.Context, userID, id string) error {
	if !kitID.MatchString(id) {
		return ErrNotFound
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var wasDefault bool
	err = tx.QueryRowContext(ctx, `DELETE FROM brand_kits WHERE id=$1 AND user_id=$2 RETURNING is_default`, id, userID).Scan(&wasDefault)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if wasDefault {
		if _, err = tx.ExecContext(ctx, `UPDATE brand_kits SET is_default=true WHERE id=(SELECT id FROM brand_kits WHERE user_id=$1 ORDER BY updated_at DESC,id LIMIT 1)`, userID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// ---------------------------------------------------------------- HTTP

func (h *Handler) registerKits(router *httprouter.Router) {
	router.Handler(http.MethodGet, "/api/brand-kits", h.auth.Require(h.listKits))
	router.Handler(http.MethodPost, "/api/brand-kits", h.auth.RequireMember(h.auth.Limit(h.createKit, "brand-kits", 60, time.Hour)))
	router.Handler(http.MethodGet, "/api/brand-kits/:id", h.auth.Require(h.getKit))
	router.Handler(http.MethodPut, "/api/brand-kits/:id", h.auth.RequireMember(h.auth.Limit(h.updateKit, "brand-settings", 60, time.Hour)))
	router.Handler(http.MethodPatch, "/api/brand-kits/:id", h.auth.RequireMember(h.auth.Limit(h.changeKit, "brand-kits", 60, time.Hour)))
	router.Handler(http.MethodDelete, "/api/brand-kits/:id", h.auth.RequireMember(h.auth.Limit(h.deleteKit, "brand-kits", 60, time.Hour)))
}

func kitFailure(w http.ResponseWriter, err error) {
	status, message := 503, "Brand kits are temporarily unavailable"
	switch {
	case errors.Is(err, ErrNotFound):
		status, message = 404, ErrNotFound.Error()
	case errors.Is(err, ErrConflict):
		status, message = 409, ErrConflict.Error()
	case errors.Is(err, ErrInvalid):
		status, message = 400, err.Error()
	case errors.Is(err, ErrPlan):
		status, message = 403, err.Error()
	case errors.Is(err, ErrInactive):
		status, message = 409, err.Error()
	}
	write(w, status, map[string]string{"error": message})
}

func (h *Handler) access(r *http.Request) map[string]any {
	user := identity.Current(r).User
	return map[string]any{"plan": user.Plan, "canWhiteLabel": user.Plan == "agency" || user.AccessRole == "admin"}
}

func (h *Handler) respondKit(w http.ResponseWriter, r *http.Request, id string, status int) {
	kit, err := h.media.GetKit(r.Context(), identity.Current(r).User.ID, id)
	if err != nil {
		kitFailure(w, err)
		return
	}
	if kit == nil {
		kitFailure(w, ErrNotFound)
		return
	}
	body := h.access(r)
	body["brandKit"] = kit
	write(w, status, body)
}

func (h *Handler) listKits(w http.ResponseWriter, r *http.Request) {
	kits, err := h.media.ListKits(r.Context(), identity.Current(r).User.ID)
	if err != nil {
		kitFailure(w, err)
		return
	}
	body := h.access(r)
	body["kits"] = kits
	write(w, 200, body)
}

func (h *Handler) createKit(w http.ResponseWriter, r *http.Request) {
	var in KitCreate
	if !readJSON(w, r, &in) {
		return
	}
	id, err := h.repository.CreateKit(r.Context(), identity.Current(r).User.ID, in)
	if err != nil {
		kitFailure(w, err)
		return
	}
	h.respondKit(w, r, id, 201)
}

func pathKit(r *http.Request) string {
	return httprouter.ParamsFromContext(r.Context()).ByName("id")
}

func (h *Handler) getKit(w http.ResponseWriter, r *http.Request) {
	id := pathKit(r)
	if !kitID.MatchString(id) {
		kitFailure(w, ErrNotFound)
		return
	}
	h.respondKit(w, r, id, 200)
}

func (h *Handler) updateKit(w http.ResponseWriter, r *http.Request) {
	id := pathKit(r)
	if !kitID.MatchString(id) {
		kitFailure(w, ErrNotFound)
		return
	}
	var input map[string]any
	if !readJSON(w, r, &input) {
		return
	}
	if err := h.repository.UpdateKit(r.Context(), identity.Current(r).User.ID, id, input); err != nil {
		kitFailure(w, err)
		return
	}
	h.respondKit(w, r, id, 200)
}

func (h *Handler) changeKit(w http.ResponseWriter, r *http.Request) {
	id := pathKit(r)
	var in KitChange
	if !readJSON(w, r, &in) {
		return
	}
	if err := h.repository.ChangeKit(r.Context(), identity.Current(r).User.ID, id, in); err != nil {
		kitFailure(w, err)
		return
	}
	h.respondKit(w, r, id, 200)
}

func (h *Handler) deleteKit(w http.ResponseWriter, r *http.Request) {
	if err := h.repository.DeleteKit(r.Context(), identity.Current(r).User.ID, pathKit(r)); err != nil {
		kitFailure(w, err)
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	w.WriteHeader(http.StatusNoContent)
}
