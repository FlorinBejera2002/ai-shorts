package stories

import (
	"fmt"
	"net/http"
	"sneepcut/backend-go/internal/identity"
	"sneepcut/backend-go/internal/story"
)

type TranscriptReviewInput struct {
	AssetID    string   `json:"asset_id"`
	ProposalID string   `json:"proposal_id"`
	Words      []string `json:"words"`
}

func approveTranscriptInputs(assets []story.Asset, reviews []TranscriptReviewInput) ([]story.Asset, error) {
	result := append([]story.Asset(nil), assets...)
	seen := map[string]bool{}
	count := 0
	for _, review := range reviews {
		key := review.AssetID + ":" + review.ProposalID
		count += len(review.Words)
		if seen[key] || count > 10000 {
			return nil, fmt.Errorf("duplicate or oversized transcript review")
		}
		seen[key] = true
		found := false
		for i := range result {
			if result[i].ID != review.AssetID {
				continue
			}
			var err error
			result[i], err = story.ApproveTranscript(result[i], review.ProposalID, review.Words)
			if err != nil {
				return nil, err
			}
			found = true
			break
		}
		if !found {
			return nil, fmt.Errorf("transcript source does not belong to this story")
		}
	}
	return result, nil
}

func (h *Handler) reviewTranscript(w http.ResponseWriter, r *http.Request) {
	id := requestID(w, r)
	if id == "" {
		return
	}
	var in struct {
		RequestID     string                  `json:"request_id"`
		ExpectedState string                  `json:"expected_state"`
		Version       int                     `json:"version"`
		Reviews       []TranscriptReviewInput `json:"reviews"`
	}
	if !decode(w, r, &in) {
		return
	}
	user := identity.Current(r).User.ID
	if err := h.repo.Queue(r.Context(), user, id, Generate{RequestID: in.RequestID, ExpectedState: in.ExpectedState, Version: in.Version, Action: "review_transcript", TranscriptReviews: in.Reviews}); err != nil {
		failure(w, err)
		return
	}
	h.respondProject(w, r, user, id, 202)
}
