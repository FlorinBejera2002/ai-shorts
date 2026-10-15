package workspaceagent

import (
	"context"
	"database/sql"
	"strings"
)

func unlimitedCredits(ctx context.Context, db *sql.DB, user string) (bool, error) {
	var unlimited bool
	err := db.QueryRowContext(ctx, `SELECT access_role='admin' FROM users WHERE id=$1`, user).Scan(&unlimited)
	return unlimited, err
}

func estimateActionCost(executor Executor, action Action) (int, error) {
	if estimator, ok := executor.(interface{ EstimateCost(Action) (int, error) }); ok {
		return estimator.EstimateCost(action)
	}
	for _, capability := range executor.Catalog() {
		if capability.Name == action.Name {
			return capability.CostCredits, nil
		}
	}
	return 0, ErrUnavailable
}

func (h *Handler) currentActionCost(ctx context.Context, user string, action Action) (int, error) {
	known := false
	for _, capability := range h.executor.Catalog() {
		if capability.Name == action.Name {
			known = true
			break
		}
	}
	if !known {
		// Guarded restore actions are internal undo receipts, outside the
		// planner catalog. They restore saved state without a credit charge.
		return 0, nil
	}
	cost, err := estimateActionCost(h.executor, action)
	if err != nil {
		return 0, err
	}
	unlimited, err := unlimitedCredits(ctx, h.db, user)
	if unlimited {
		cost = 0
	}
	return cost, err
}

func accountCatalog(catalog []Capability, unlimited bool) []Capability {
	if !unlimited {
		return catalog
	}
	out := append([]Capability(nil), catalog...)
	for i := range out {
		out[i].CostCredits = 0
		switch out[i].Name {
		case "stories.generate":
			out[i].Description = strings.ReplaceAll(out[i].Description, "spends up to 10 credits", "uses unlimited admin credits without a charge")
		case "jobs.create":
			out[i].Description = strings.ReplaceAll(out[i].Description, "Cost exactly 10 credits per requested clip, requires approval", "Uses unlimited admin credits without a charge")
		}
	}
	return out
}

func accountSuggestion(s Suggestion, unlimited bool) Suggestion {
	if !unlimited {
		return s
	}
	s.CostCredits = 0
	s.Description = strings.NewReplacer(
		"Generarea costă 10 credite și cere confirmare înainte de procesare.", "Contul de administrator are credite nelimitate pentru generare.",
		"Confirmarea afișează costul înainte de pornire.", "Generarea folosește creditele nelimitate ale administratorului.",
		"Generation requires confirmation of its 10-credit cost.", "Your administrator account has unlimited generation credits.",
		"Confirm the cost before processing starts.", "Generation uses your unlimited administrator credits.",
		"Generation follows after saving these settings; its 10-credit cost requires confirmation before processing.", "Generation follows after saving these settings and uses your unlimited administrator credits.",
	).Replace(s.Description)
	return s
}
