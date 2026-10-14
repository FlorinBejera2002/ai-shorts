package media

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"sneepcut/backend-go/internal/captions"
	"sneepcut/backend-go/internal/identity"
	"strconv"
	"time"
)

func (h *Handler) listFonts(w http.ResponseWriter, r *http.Request) {
	user := identity.Current(r).User.ID
	out := captions.Catalog()
	rows, err := h.service.db.QueryContext(r.Context(), `SELECT id,family,style,weight,romanian,archived FROM caption_fonts WHERE user_id=$1 ORDER BY created_at`, user)
	if err != nil {
		mediaError(w, err)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var f captions.Font
		var weight int
		if err = rows.Scan(&f.ID, &f.Family, &f.Style, &weight, &f.Romanian, &f.Archived); err != nil {
			mediaError(w, err)
			return
		}
		f.Category = "custom"
		f.Weights = []int{weight}
		out = append(out, f)
	}
	if err = rows.Err(); err != nil {
		mediaError(w, err)
		return
	}
	writeMedia(w, 200, map[string]any{"fonts": out})
}
func (h *Handler) fontFile(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	weight, _ := strconv.Atoi(r.URL.Query().Get("weight"))
	if captions.IsBuiltin(id) {
		b, e := captions.FontBytes(id, weight)
		if e != nil {
			mediaError(w, failure(404, e.Error()))
			return
		}
		w.Header().Set("Content-Type", "font/ttf")
		w.Header().Set("Cache-Control", "private, max-age=86400, immutable")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		_, _ = w.Write(b)
		return
	}
	user := identity.Current(r).User.ID
	var key string
	if _, e := captions.PrivateKey(user, id); e != nil {
		mediaError(w, failure(404, "Font is unavailable"))
		return
	}
	if e := h.service.db.QueryRowContext(r.Context(), `SELECT storage_key FROM caption_fonts WHERE id=$1 AND user_id=$2 AND weight=$3`, id, user, weight).Scan(&key); e != nil {
		mediaError(w, failure(404, "Font is unavailable"))
		return
	}
	// Keep private font bytes on the authenticated API origin. A redirect to
	// object storage would require bucket CORS and could cache bytes across users.
	data, e := h.service.readFontAsset(r.Context(), key)
	if e != nil {
		mediaError(w, failure(503, "Font is temporarily unavailable"))
		return
	}
	contentType := "font/ttf"
	if len(data) >= 4 && string(data[:4]) == "OTTO" {
		contentType = "font/otf"
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	_, _ = w.Write(data)
}
func (h *Handler) uploadFont(w http.ResponseWriter, r *http.Request) {
	user := identity.Current(r).User.ID
	if r.URL.Query().Get("license_confirmed") != "true" {
		mediaError(w, failure(400, "Confirm you have permission to use this font"))
		return
	}
	if e := h.service.allow(r.Context(), user, "font-upload", 30); e != nil {
		mediaError(w, e)
		return
	}
	part, e := firstFile(w, r, 8<<20)
	if e != nil {
		mediaError(w, e)
		return
	}
	defer part.Close()
	data, e := io.ReadAll(io.LimitReader(part, (8<<20)+1))
	if e != nil {
		mediaError(w, e)
		return
	}
	meta, e := captions.Inspect(data)
	if e != nil {
		mediaError(w, failure(400, e.Error()))
		return
	}
	id, e := randomUUID()
	if e != nil {
		mediaError(w, e)
		return
	}
	key, e := captions.PrivateKey(user, id)
	if e != nil {
		mediaError(w, e)
		return
	}
	f, e := os.CreateTemp(h.service.cfg.StagingDirectory, "caption-font-*.ttf")
	if e != nil {
		mediaError(w, e)
		return
	}
	defer os.Remove(f.Name())
	_, e = f.Write(data)
	closeErr := f.Close()
	if e == nil {
		e = closeErr
	}
	if e != nil {
		mediaError(w, e)
		return
	}
	tx, e := h.service.db.BeginTx(r.Context(), nil)
	if e != nil {
		mediaError(w, e)
		return
	}
	defer tx.Rollback()
	if e = lockBrandLogoUser(r.Context(), tx, user); e != nil {
		mediaError(w, e)
		return
	}
	if e = h.service.Storage.Save(r.Context(), f.Name(), key, "font/ttf"); e != nil {
		mediaError(w, e)
		return
	}
	digest := sha256.Sum256(data)
	_, e = tx.ExecContext(r.Context(), `INSERT INTO caption_fonts(id,user_id,family,style,weight,romanian,digest,storage_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, id, user, meta.Family, meta.Style, meta.Weights[0], meta.Romanian, hex.EncodeToString(digest[:]), key)
	if e == nil {
		e = tx.Commit()
	}
	if e != nil {
		_ = h.service.Storage.Delete(r.Context(), key)
		mediaError(w, e)
		return
	}
	meta.ID = id
	writeMedia(w, 201, map[string]any{"font": meta})
}

// Archiving hides a font from new selections but retains bytes for saved videos.
func (h *Handler) archiveFont(w http.ResponseWriter, r *http.Request) {
	user, id := identity.Current(r).User.ID, r.URL.Query().Get("id")
	if _, e := captions.PrivateKey(user, id); e != nil {
		mediaError(w, failure(400, "Invalid font resource"))
		return
	}
	result, e := h.service.db.ExecContext(r.Context(), `UPDATE caption_fonts SET archived=true WHERE id=$1 AND user_id=$2`, id, user)
	if e != nil {
		mediaError(w, e)
		return
	}
	n, _ := result.RowsAffected()
	if n != 1 {
		mediaError(w, failure(404, "Font is unavailable"))
		return
	}
	writeMedia(w, 200, map[string]string{"message": fmt.Sprint("Font removed from the picker; saved projects keep their font")})
}

func (s *Service) readFontAsset(ctx context.Context, key string) ([]byte, error) {
	var reader io.ReadCloser
	if local, ok := s.Storage.(interface{ Path(string) (string, error) }); ok {
		file, err := local.Path(key)
		if err != nil {
			return nil, err
		}
		opened, err := os.Open(file)
		if err != nil {
			return nil, err
		}
		reader = opened
	} else {
		signed, err := s.Storage.SignedURL(ctx, key, time.Minute)
		if err != nil {
			return nil, err
		}
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, signed, nil)
		if err != nil {
			return nil, err
		}
		client := &http.Client{Timeout: 30 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return errors.New("font storage redirected") }}
		response, err := client.Do(request)
		if err != nil {
			return nil, err
		}
		if response.StatusCode != http.StatusOK {
			response.Body.Close()
			return nil, errors.New("font storage unavailable")
		}
		reader = response.Body
	}
	defer reader.Close()
	data, err := io.ReadAll(io.LimitReader(reader, (8<<20)+1))
	if err != nil {
		return nil, err
	}
	if len(data) > 8<<20 {
		return nil, errors.New("font resource exceeds supported size")
	}
	return data, nil
}
