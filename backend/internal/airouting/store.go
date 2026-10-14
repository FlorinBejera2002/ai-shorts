package airouting

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"sneepcut/backend-go/internal/aiprovider"
)

// SQLStore shares routing changes between API and worker processes. Credentials
// are process configuration and are never persisted with a route.
type SQLStore struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *SQLStore { return &SQLStore{db: db} }

func (s *SQLStore) Load(ctx context.Context) (Configuration, error) {
	return readStoredConfiguration(s.db.QueryRowContext(ctx,
		`SELECT version,routes FROM ai_routing_settings WHERE singleton=true`))
}

// Save checks the version under a row lock, then stores both the configuration
// and its audit event in the same transaction. A stale editor cannot overwrite
// a later change, and an unaudited change cannot become visible.
func (s *SQLStore) Save(ctx context.Context, expectedVersion int64, routes map[aiprovider.Task]Route, actorID, reason string) (Configuration, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Configuration{}, fmt.Errorf("begin AI routing update: %w", err)
	}
	defer tx.Rollback()
	before, err := readStoredConfiguration(tx.QueryRowContext(ctx,
		`SELECT version,routes FROM ai_routing_settings WHERE singleton=true FOR UPDATE`))
	if err != nil {
		return Configuration{}, err
	}
	if before.Version != expectedVersion {
		return Configuration{}, ErrConflict
	}
	if routes == nil {
		routes = map[aiprovider.Task]Route{}
	}
	routesJSON, err := json.Marshal(routes)
	if err != nil {
		return Configuration{}, fmt.Errorf("encode AI routing update: %w", err)
	}
	after := Configuration{Version: before.Version + 1, Routes: routes}
	if _, err = tx.ExecContext(ctx, `UPDATE ai_routing_settings SET version=version+1,routes=$1,updated_at=now(),updated_by=$2 WHERE singleton=true`, routesJSON, actorID); err != nil {
		return Configuration{}, fmt.Errorf("save AI routing update: %w", err)
	}
	beforeJSON, err := json.Marshal(before)
	if err != nil {
		return Configuration{}, fmt.Errorf("encode AI routing audit before state: %w", err)
	}
	afterJSON, err := json.Marshal(after)
	if err != nil {
		return Configuration{}, fmt.Errorf("encode AI routing audit after state: %w", err)
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO admin_audit_events(actor_user_id,target_user_id,action,reason,before_state,after_state) VALUES($1,NULL,'set_ai_routing',$2,$3,$4)`, actorID, reason, beforeJSON, afterJSON); err != nil {
		return Configuration{}, fmt.Errorf("audit AI routing update: %w", err)
	}
	if err = tx.Commit(); err != nil {
		return Configuration{}, fmt.Errorf("commit AI routing update: %w", err)
	}
	return after, nil
}

func readStoredConfiguration(row *sql.Row) (Configuration, error) {
	var result Configuration
	var routesJSON []byte
	if err := row.Scan(&result.Version, &routesJSON); err != nil {
		return Configuration{}, fmt.Errorf("load AI routing configuration: %w", err)
	}
	if err := json.Unmarshal(routesJSON, &result.Routes); err != nil {
		return Configuration{}, fmt.Errorf("decode AI routing configuration: %w", err)
	}
	if result.Routes == nil {
		return Configuration{}, fmt.Errorf("AI routing configuration must be an object")
	}
	return result, nil
}
