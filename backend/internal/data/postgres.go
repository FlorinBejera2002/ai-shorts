// Package data provides shared database infrastructure. Put feature queries in
// their feature packages as those are introduced, rather than a giant Models bag.
package data

import (
	"context"
	"database/sql"
	"errors"
	"time"

	_ "github.com/lib/pq"
)

var (
	ErrRecordNotFound = errors.New("record not found")
	ErrEditConflict   = errors.New("edit conflict")
)

type Config struct {
	DSN          string
	MaxOpenConns int
	MaxIdleConns int
	MaxIdleTime  time.Duration
}

// Open retains the example's bounded database/sql pool. Startup wires it only
// when a database-backed feature is enabled.
func Open(ctx context.Context, cfg Config) (*sql.DB, error) {
	if cfg.DSN == "" || cfg.MaxOpenConns < 1 || cfg.MaxIdleConns < 0 ||
		cfg.MaxIdleConns > cfg.MaxOpenConns || cfg.MaxIdleTime <= 0 {
		return nil, errors.New("database DSN and valid bounded pool settings are required")
	}
	db, err := sql.Open("postgres", cfg.DSN)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(cfg.MaxOpenConns)
	db.SetMaxIdleConns(cfg.MaxIdleConns)
	db.SetConnMaxIdleTime(cfg.MaxIdleTime)
	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := db.PingContext(pingCtx); err != nil {
		_ = db.Close()
		return nil, err
	}
	return db, nil
}
