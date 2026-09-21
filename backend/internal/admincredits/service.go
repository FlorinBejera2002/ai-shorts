// Package admincredits applies audited, idempotent account credit grants.
package admincredits

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"regexp"
	"time"
)

var batchKeyPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`)

type Report struct {
	Status             string    `json:"status"`
	BatchKey           string    `json:"batch_key"`
	AmountPerUser      int       `json:"amount_per_user"`
	Cutoff             time.Time `json:"cutoff"`
	Recipients         int64     `json:"recipients"`
	TotalGranted       int64     `json:"total_granted"`
	BalanceTotalBefore int64     `json:"balance_total_before"`
	BalanceTotalAfter  int64     `json:"balance_total_after"`
}

type Service struct{ db *sql.DB }

func New(db *sql.DB) *Service { return &Service{db: db} }

func validate(batchKey string, amount int, cutoff time.Time) error {
	if !batchKeyPattern.MatchString(batchKey) {
		return errors.New("batch key must contain 1-128 letters, digits, dots, colons, dashes or underscores")
	}
	if amount <= 0 || int64(amount) > 2_147_483_647 {
		return errors.New("amount must be a positive PostgreSQL integer")
	}
	if cutoff.IsZero() {
		return errors.New("cutoff is required")
	}
	return nil
}

func (s *Service) Preview(ctx context.Context, batchKey string, amount int, cutoff time.Time) (Report, error) {
	if err := validate(batchKey, amount, cutoff); err != nil {
		return Report{}, err
	}
	var existingAmount int
	var existingCutoff time.Time
	var completed sql.NullTime
	err := s.db.QueryRowContext(ctx, `SELECT amount, cutoff, completed_at FROM credit_grant_batches WHERE batch_key=$1`, batchKey).Scan(&existingAmount, &existingCutoff, &completed)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return Report{}, err
	}
	if err == nil && (existingAmount != amount || !existingCutoff.Equal(cutoff)) {
		return Report{}, errors.New("batch key was already used with a different amount or cutoff")
	}
	if completed.Valid {
		return report(ctx, s.db, "already_applied", batchKey, amount, cutoff, true)
	}
	return report(ctx, s.db, "preview", batchKey, amount, cutoff, false)
}

func (s *Service) Apply(ctx context.Context, batchKey string, amount int, cutoff time.Time) (Report, error) {
	if err := validate(batchKey, amount, cutoff); err != nil {
		return Report{}, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Report{}, err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `INSERT INTO credit_grant_batches(batch_key,amount,cutoff) VALUES($1,$2,$3) ON CONFLICT(batch_key) DO NOTHING`, batchKey, amount, cutoff); err != nil {
		return Report{}, err
	}
	var existingAmount int
	var existingCutoff time.Time
	var completed sql.NullTime
	if err = tx.QueryRowContext(ctx, `SELECT amount,cutoff,completed_at FROM credit_grant_batches WHERE batch_key=$1 FOR UPDATE`, batchKey).Scan(&existingAmount, &existingCutoff, &completed); err != nil {
		return Report{}, err
	}
	if existingAmount != amount || !existingCutoff.Equal(cutoff) {
		return Report{}, errors.New("batch key was already used with a different amount or cutoff")
	}
	if !completed.Valid {
		_, err = tx.ExecContext(ctx, `WITH eligible AS MATERIALIZED (SELECT id FROM users WHERE created_at <= $2 ORDER BY id FOR UPDATE), credited AS (UPDATE users u SET credits=u.credits+$3,updated_at=now() FROM eligible WHERE u.id=eligible.id RETURNING u.id,u.credits-$3 AS balance_before,u.credits AS balance_after) INSERT INTO credit_grant_recipients(batch_key,user_id,balance_before,balance_after) SELECT $1,id,balance_before,balance_after FROM credited`, batchKey, cutoff, amount)
		if err != nil {
			return Report{}, err
		}
		if _, err = tx.ExecContext(ctx, `UPDATE credit_grant_batches SET completed_at=now() WHERE batch_key=$1`, batchKey); err != nil {
			return Report{}, err
		}
	}
	r, err := report(ctx, tx, map[bool]string{true: "already_applied", false: "applied"}[completed.Valid], batchKey, amount, cutoff, true)
	if err != nil {
		return Report{}, err
	}
	if err = tx.Commit(); err != nil {
		return Report{}, err
	}
	return r, nil
}

type queryer interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func report(ctx context.Context, q queryer, status, batchKey string, amount int, cutoff time.Time, applied bool) (Report, error) {
	query := `SELECT count(*),coalesce(sum(credits),0) FROM users WHERE created_at <= $1`
	args := []any{cutoff}
	if applied {
		query = `SELECT count(*),coalesce(sum(balance_before),0) FROM credit_grant_recipients WHERE batch_key=$1`
		args = []any{batchKey}
	}
	var recipients, before int64
	if err := q.QueryRowContext(ctx, query, args...).Scan(&recipients, &before); err != nil {
		return Report{}, fmt.Errorf("build grant report: %w", err)
	}
	total := recipients * int64(amount)
	return Report{Status: status, BatchKey: batchKey, AmountPerUser: amount, Cutoff: cutoff, Recipients: recipients, TotalGranted: total, BalanceTotalBefore: before, BalanceTotalAfter: before + total}, nil
}
