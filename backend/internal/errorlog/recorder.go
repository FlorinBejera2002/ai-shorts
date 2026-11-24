package errorlog

import (
	"context"
	"database/sql"
	"encoding/json"
	"log/slog"
	"sync"
	"time"
)

const (
	flushInterval  = 2 * time.Second
	pruneInterval  = time.Hour
	maxPending     = 500
	eventRetention = 30 * 24 * time.Hour
	groupRetention = 90 * 24 * time.Hour
	writeTimeout   = 5 * time.Second
)

type pending struct {
	event Event
	count int
}

// Recorder aggregates events in memory and writes them every few seconds:
// one group upsert and one sample row per fingerprint per flush, so an error
// loop cannot flood the database. A nil *Recorder ignores every call.
type Recorder struct {
	db       *sql.DB
	fallback *slog.Logger

	mu      sync.Mutex
	pending map[string]*pending
	dropped int
}

// NewRecorder writes to db. fallback must not route back into a Capture
// handler, otherwise a failing write would report itself.
func NewRecorder(db *sql.DB, fallback *slog.Logger) *Recorder {
	return &Recorder{db: db, fallback: fallback, pending: map[string]*pending{}}
}

// Record queues an event. It never blocks on the database.
func (r *Recorder) Record(event Event) {
	if r == nil {
		return
	}
	event = event.sanitized()
	key := event.Fingerprint()
	r.mu.Lock()
	defer r.mu.Unlock()
	if current, ok := r.pending[key]; ok {
		current.count++
		current.event = event
		return
	}
	if len(r.pending) >= maxPending {
		r.dropped++
		return
	}
	r.pending[key] = &pending{event: event, count: 1}
}

// Run flushes queued events until ctx ends, then flushes once more.
func (r *Recorder) Run(ctx context.Context) {
	if r == nil {
		return
	}
	flush := time.NewTicker(flushInterval)
	defer flush.Stop()
	prune := time.NewTicker(pruneInterval)
	defer prune.Stop()
	r.prune()
	for {
		select {
		case <-ctx.Done():
			r.Flush()
			return
		case <-flush.C:
			r.Flush()
		case <-prune.C:
			r.prune()
		}
	}
}

// Flush writes every queued group.
func (r *Recorder) Flush() {
	r.mu.Lock()
	batch, dropped := r.pending, r.dropped
	r.pending, r.dropped = map[string]*pending{}, 0
	r.mu.Unlock()
	if dropped > 0 {
		r.fallback.Warn("Error recorder queue was full", "dropped", dropped)
	}
	for fingerprint, item := range batch {
		ctx, cancel := context.WithTimeout(context.Background(), writeTimeout)
		err := r.write(ctx, fingerprint, item)
		cancel()
		if err != nil {
			r.fallback.Warn("Error recorder write failed", "error", err)
		}
	}
}

func (r *Recorder) write(ctx context.Context, fingerprint string, item *pending) error {
	contextJSON, err := json.Marshal(item.event.Context)
	if err != nil || item.event.Context == nil {
		contextJSON = []byte("{}")
	}
	e := item.event
	_, err = r.db.ExecContext(ctx, `WITH grp AS (
		INSERT INTO platform_error_groups (fingerprint, source, kind, message, route, occurrences, first_seen_at, last_seen_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
		ON CONFLICT (fingerprint) DO UPDATE SET
			occurrences = platform_error_groups.occurrences + EXCLUDED.occurrences,
			last_seen_at = GREATEST(platform_error_groups.last_seen_at, EXCLUDED.last_seen_at),
			message = EXCLUDED.message,
			resolved_at = NULL
		RETURNING id)
		INSERT INTO platform_error_events (group_id, occurred_at, occurrences, detail, context)
		SELECT id, $7, $6, $8, $9::jsonb FROM grp`,
		fingerprint, e.Source, e.Kind, e.Message, e.Route, item.count, e.At, e.Detail, string(contextJSON))
	return err
}

func (r *Recorder) prune() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	now := time.Now()
	if _, err := r.db.ExecContext(ctx, `DELETE FROM platform_error_events WHERE occurred_at < $1`, now.Add(-eventRetention)); err != nil {
		r.fallback.Warn("Error recorder prune failed", "error", err)
		return
	}
	if _, err := r.db.ExecContext(ctx, `DELETE FROM platform_error_groups WHERE last_seen_at < $1`, now.Add(-groupRetention)); err != nil {
		r.fallback.Warn("Error recorder prune failed", "error", err)
	}
}
