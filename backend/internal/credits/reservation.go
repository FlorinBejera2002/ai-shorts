// Package credits reserves actual account charges inside the caller's transaction.
package credits

import (
	"context"
	"database/sql"
	"errors"
)

var (
	ErrInactive     = errors.New("Account is unavailable")
	ErrInsufficient = errors.New("Insufficient credits")
)

// Reserve locks the current account before checking its role and balance. Admin
// work has no charge; callers must persist the returned amount for safe refunds.
// A zero amount validates and locks the account without changing its balance.
func Reserve(ctx context.Context, tx *sql.Tx, userID string, amount int) (int, error) {
	if amount < 0 {
		return 0, errors.New("Credit reservation must not be negative")
	}
	var balance int
	var role, status string
	var activationRequired bool
	err := tx.QueryRowContext(ctx, `SELECT credits,access_role,account_status,email_activation_required FROM users WHERE id=$1 FOR UPDATE`, userID).Scan(&balance, &role, &status, &activationRequired)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, ErrInactive
	}
	if err != nil {
		return 0, err
	}
	// Account deletion takes the same user lock before inserting its marker.
	// Read the marker after acquiring that lock, in a fresh statement snapshot.
	var deleting bool
	if err = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=$1)`, userID).Scan(&deleting); err != nil {
		return 0, err
	}
	if (role != "member" && role != "admin") || (status != "" && status != "active") || activationRequired || deleting {
		return 0, ErrInactive
	}
	if role == "admin" || amount == 0 {
		return 0, nil
	}
	if balance < amount {
		return 0, ErrInsufficient
	}
	if _, err = tx.ExecContext(ctx, `UPDATE users SET credits=credits-$2,updated_at=now() WHERE id=$1`, userID, amount); err != nil {
		return 0, err
	}
	return amount, nil
}
