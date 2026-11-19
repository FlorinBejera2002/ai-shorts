package projects

import (
	"context"
	"net/http"
	"time"

	"github.com/julienschmidt/httprouter"

	"sneepcut/backend-go/internal/identity"
)

// FavoriteInput stars or unstars one clip.
type FavoriteInput struct {
	Favorite *bool `json:"favorite"`
}

func (h *Handler) registerFavorites(r *httprouter.Router) {
	r.Handler(http.MethodPut, "/api/clips/:id/favorite", h.auth.RequireMember(h.auth.Limit(h.setFavorite, "projects-clips", 240, time.Hour)))
}

// SetFavorite stars or unstars a clip of the account.
func (r *Repository) SetFavorite(ctx context.Context, userID, clipID string, favorite bool) error {
	result, err := r.db.ExecContext(ctx, `UPDATE clips SET favorite=$3 WHERE id=$1 AND user_id=$2`, clipID, userID, favorite)
	if err != nil {
		return err
	}
	return affected(result)
}

func (h *Handler) setFavorite(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r, "id")
	if !ok {
		respond(w, 400, map[string]string{"detail": "Invalid clip identifier"})
		return
	}
	var input FavoriteInput
	if !decode(w, r, &input) {
		return
	}
	if input.Favorite == nil {
		respond(w, http.StatusUnprocessableEntity, map[string]string{"detail": "favorite is required"})
		return
	}
	if err := h.repo.SetFavorite(r.Context(), identity.Current(r).User.ID, id, *input.Favorite); err != nil {
		fail(w, err)
		return
	}
	respond(w, http.StatusOK, map[string]bool{"favorite": *input.Favorite})
}
